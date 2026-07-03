import { useState, useEffect, useRef, useMemo } from 'react'
import {
  RotateCcw, Flame, Scissors, ArrowRightLeft,
  Settings as SettingsIcon, History as HistoryIcon, Bell, Clock, ListChecks, Wifi, Cpu, Image as ImageIcon,
} from 'lucide-react'
import useSocket from '../hooks/useSocket'
import { sendCommand, getSessions, getSettings, getAlerts } from '../hooks/api'

import fotoKiri from '../assets/SeluruhDariKiri.jpeg'
import fotoDepan from '../assets/SeluruhDariDepan.jpeg'
import fotoAtas from '../assets/SeluruhDariAtas.jpeg'
import fotoKanan from '../assets/SeluruhDariKanan.jpeg'

const DOKUMENTASI_FOTO = [
  { src: fotoKiri, label: 'Tampak Kiri' },
  { src: fotoDepan, label: 'Tampak Depan' },
  { src: fotoAtas, label: 'Tampak Atas' },
  { src: fotoKanan, label: 'Tampak Kanan' },
]

function fmtDuration(sec) {
  if (sec === null || sec === undefined) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}j ${m}m` : `${m}m`
}

const STATE_COLOR = {
  IDLE: '#6b7280', DRYING: '#f59e0b', FINISHED: '#10b981',
  ERROR: '#ef4444', OFFLINE: '#ef4444', SERVO_OPENING: '#3b82f6',
  SERVO_CLOSING: '#3b82f6', SLICING_FORWARD: '#3b82f6', SLICING_RETURN: '#3b82f6',
  SERVO_WAIT: '#3b82f6',
}

const SLICING_PHASES = ['SERVO_OPENING', 'SLICING_FORWARD', 'SLICING_RETURN', 'SERVO_WAIT', 'SERVO_CLOSING']

const STATE_LABEL = {
  IDLE: 'Sistem siaga, menunggu perintah',
  SERVO_OPENING: 'Servo membuka',
  SLICING_FORWARD: 'Pemotongan berlangsung — pendorong & pisau aktif',
  SLICING_RETURN: 'Pendorong mundur',
  SERVO_WAIT: 'Menunggu irisan masuk',
  SERVO_CLOSING: 'Servo menutup',
  DRYING: 'Proses pengeringan aktif, heater menyala',
  FINISHED: 'Siklus selesai, target tercapai',
  ERROR: 'Terjadi error pada sistem',
}

// Dashboard = HALAMAN OVERVIEW, sengaja beda LAYOUT dari halaman lain (bukan cuma
// tumpukan .card kayak Pemotong/Pengering/Settings). Di sini pakai bento-grid:
// hero status + kesehatan sistem sejajar di atas, lalu ringkasan (angka besar) +
// timeline aktivitas sejajar di bawah, dan akses cepat sebagai baris chip tanpa
// bingkai card. Isinya juga sengaja gak dobel sama konten Pemotong/Pengering.
export default function Dashboard({ onNavigate }) {
  const { connected, sensorData, machineState, heartbeat, alerts } = useSocket()
  const [cmdLoading, setCmdLoading] = useState(false)
  const [stateLog, setStateLog] = useState([])
  const prevStateRef = useRef(null)

  const [sessions, setSessions] = useState([])
  const [settings, setSettings] = useState(null)
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [elapsedSec, setElapsedSec] = useState(0)
  const startedAtRef = useRef(null)

  const effectiveState = sensorData?.state || machineState
  const isDrying = effectiveState === 'DRYING'
  const isSlicingPhase = SLICING_PHASES.includes(effectiveState)
  const cycleCurrent = sensorData?.cycle_current ?? sensorData?.cycle ?? 0
  const cycleTotal   = sensorData?.cycle_total   ?? sensorData?.total ?? 0
  const stateColor   = STATE_COLOR[effectiveState] || '#6b7280'

  useEffect(() => {
    getSessions().then(r => setSessions(r.data?.data || [])).catch(() => {})
    getSettings().then(r => setSettings(r.data?.data)).catch(() => {})
  }, [])

  useEffect(() => {
    getAlerts(true).then(r => setUnreadAlerts(r.data?.count ?? (r.data?.data || []).length)).catch(() => {})
  }, [alerts.length])

  useEffect(() => {
    if (effectiveState === 'FINISHED' || effectiveState === 'IDLE') {
      getSessions().then(r => setSessions(r.data?.data || [])).catch(() => {})
    }
  }, [effectiveState])

  useEffect(() => {
    if (isDrying && !startedAtRef.current) startedAtRef.current = Date.now()
    if (!isDrying) { startedAtRef.current = null; setElapsedSec(0) }
  }, [isDrying])

  useEffect(() => {
    if (!isDrying) return
    const t = setInterval(() => {
      if (startedAtRef.current) setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [isDrying])

  const estimatedSec = settings ? settings.estimated_duration_min * 60 : null
  const progressPct  = estimatedSec ? Math.min(100, (elapsedSec / estimatedSec) * 100) : 0

  const todaySummary = useMemo(() => {
    const todayStr = new Date().toDateString()
    const todays = sessions.filter(s => s.started_at && new Date(s.started_at).toDateString() === todayStr)
    return {
      count:        todays.length,
      totalCycles:  todays.reduce((sum, s) => sum + (s.cycles_done || 0), 0),
      totalDurSec:  todays.reduce((sum, s) => sum + (s.duration_sec || 0), 0),
      finished:     todays.filter(s => s.result === 'FINISHED').length,
      earlyStopped: todays.filter(s => !!s.early_stop).length,
      errored:      todays.filter(s => s.result === 'ERROR').length,
    }
  }, [sessions])

  useEffect(() => {
    if (!effectiveState || effectiveState === prevStateRef.current) return
    prevStateRef.current = effectiveState
    const label = STATE_LABEL[effectiveState] || `Status berubah ke ${effectiveState}`
    const entry = {
      id: `state-${Date.now()}`,
      message: label,
      ts: Date.now(),
      type: effectiveState === 'ERROR' ? 'error' : effectiveState === 'FINISHED' ? 'success' : 'info',
    }
    setStateLog(prev => [entry, ...prev].slice(0, 20))
  }, [effectiveState])

  const activityLog = [
    ...alerts.map(a => ({
      id: `alert-${a.id || a.ts}`,
      message: a.message || a.type,
      ts: a.ts ? new Date(a.ts).getTime() : Date.now(),
      type: a.type === 'EMERGENCY_STOP' || a.type === 'SENSOR_ERROR' ? 'error' : 'warning',
    })),
    ...stateLog,
  ].sort((a, b) => b.ts - a.ts).slice(0, 10)

  const doEmergencyStop = async () => {
    if (!window.confirm('Hentikan mesin sekarang juga?')) return
    setCmdLoading(true)
    try { await sendCommand('STOP') }
    catch (e) { alert('Gagal kirim perintah stop: ' + e.message) }
    finally { setCmdLoading(false) }
  }

  const dotColor = { error: '#ef4444', success: '#10b981', warning: '#f59e0b', info: '#6b7280' }

  return (
    <div className="page dash-page">
      {/* Bar judul tipis — bukan page-header besar kayak halaman lain, karena identitas
          halaman ini sudah dibawa oleh hero status di bawah */}
      <div className="dash-topbar">
        <span className="dash-topbar-title">Smart Banana System</span>
        <span className={`dash-topbar-conn ${connected ? 'is-ok' : 'is-err'}`}>
          <span className="status-dot" /> {connected ? 'Terhubung' : 'Terputus'}
        </span>
      </div>

      <div className="dash-grid">
        {/* Hero status — signature element halaman ini: ring status besar + gradient warna state */}
        <div className="dash-hero" style={{ background: `linear-gradient(135deg, ${stateColor} 0%, #1e2a4a 130%)` }}>
          <div className="dash-hero-ring">
            {isDrying || isSlicingPhase ? <span className="dash-hero-pulse" /> : null}
            <div className="dash-hero-ring-inner">
              <Cpu size={26} color="#fff" />
            </div>
          </div>
          <div className="dash-hero-body">
            <div className="dash-hero-eyebrow">Status Sistem</div>
            <div className="dash-hero-state">{effectiveState || 'IDLE'}</div>
            <div className="dash-hero-desc">{STATE_LABEL[effectiveState] || 'Menunggu data dari mesin...'}</div>
            {isSlicingPhase && (
              <div className="dash-hero-foot"><span>Siklus {cycleCurrent}/{cycleTotal || '-'}</span></div>
            )}
            {isDrying && (
              <div className="dash-hero-foot"><span>{progressPct.toFixed(0)}% dari estimasi waktu</span></div>
            )}
          </div>
          <button className="dash-hero-stop" disabled={cmdLoading} onClick={doEmergencyStop}>⏹ Stop Darurat</button>
        </div>

        {/* Kesehatan sistem — info device, gak ditampilkan di halaman lain */}
        <div className="dash-health">
          <div className="dash-health-title"><Wifi size={14} /> Kesehatan Sistem</div>
          {heartbeat ? (
            <>
              <div className="dash-health-row"><span>Firmware</span><b>{heartbeat.firmware}</b></div>
              <div className="dash-health-row"><span>Chip</span><b>{heartbeat.chip}</b></div>
              <div className="dash-health-row"><span>WiFi RSSI</span><b>{heartbeat.wifi_rssi} dBm</b></div>
              <div className="dash-health-row"><span>Heap Free</span><b>{heartbeat.heap_free} B</b></div>
              <div className="dash-health-row"><span>Uptime</span><b>{Math.floor((heartbeat.uptime||0)/60)} menit</b></div>
              <div className="dash-health-row">
                <span>Nano</span>
                <b style={{ color: heartbeat.nano === 'online' ? '#10b981' : '#ef4444' }}>{heartbeat.nano}</b>
              </div>
            </>
          ) : <p className="dashboard-hint">Menunggu heartbeat dari ESP32...</p>}
        </div>

        {/* Akses Cepat — baris chip tanpa bingkai card, sengaja beda dari style card di halaman lain */}
        <div className="dash-shortcuts-row">
          <ShortcutChip icon={<ArrowRightLeft size={16} />} title="Pemotong"
            desc={isSlicingPhase ? `Aktif · siklus ${cycleCurrent}/${cycleTotal || '-'}` : 'Siap dipakai'}
            onClick={() => onNavigate?.('pemotong')} />
          <ShortcutChip icon={<Flame size={16} />} title="Pengering"
            desc={isDrying ? `Berjalan · ${progressPct.toFixed(0)}%` : 'Siap dipakai'}
            onClick={() => onNavigate?.('pengering')} />
          <ShortcutChip icon={<SettingsIcon size={16} />} title="Pengaturan"
            desc={settings ? `${settings.target_temp_min}–${settings.target_temp_max}°C` : 'Atur setpoint'}
            onClick={() => onNavigate?.('settings')} />
          <ShortcutChip icon={<HistoryIcon size={16} />} title="Riwayat"
            desc={`${sessions.length} sesi`}
            onClick={() => onNavigate?.('history')} />
          <ShortcutChip icon={<Bell size={16} />} title="Alert"
            desc={unreadAlerts > 0 ? `${unreadAlerts} belum dibaca` : 'Aman'}
            badge={unreadAlerts > 0 ? unreadAlerts : null}
            onClick={() => onNavigate?.('alerts')} />
        </div>

        {/* Ringkasan Hari Ini — bento tile angka besar, beda dari list icon+label di halaman lain */}
        <div className="dash-summary">
          <div className="dash-panel-title"><ListChecks size={14} /> Ringkasan Hari Ini</div>
          <div className="dash-summary-tiles">
            <div className="dash-tile">
              <div className="dash-tile-value">{todaySummary.count}</div>
              <div className="dash-tile-label">Total Sesi</div>
            </div>
            <div className="dash-tile">
              <div className="dash-tile-value">{todaySummary.totalCycles}</div>
              <div className="dash-tile-label">Siklus Selesai</div>
            </div>
            <div className="dash-tile">
              <div className="dash-tile-value">{fmtDuration(todaySummary.totalDurSec)}</div>
              <div className="dash-tile-label">Total Durasi</div>
            </div>
            <div className="dash-tile">
              <div className="dash-tile-value accent-green">{todaySummary.finished}</div>
              <div className="dash-tile-label">Selesai Normal</div>
            </div>
            <div className="dash-tile">
              <div className="dash-tile-value accent-blue">{todaySummary.earlyStopped}</div>
              <div className="dash-tile-label">Lebih Cepat</div>
            </div>
            <div className="dash-tile">
              <div className="dash-tile-value accent-red">{todaySummary.errored}</div>
              <div className="dash-tile-label">Error</div>
            </div>
          </div>
          {todaySummary.count === 0 && <p className="dashboard-hint">Belum ada sesi yang berjalan hari ini.</p>}
        </div>

        {/* Log Aktivitas — timeline vertikal, beda dari .alert-list flat di halaman Alert */}
        <div className="dash-activity">
          <div className="dash-panel-title"><Clock size={14} /> Log Aktivitas</div>
          {activityLog.length === 0
            ? <p className="dashboard-hint">Belum ada aktivitas pada sesi ini.</p>
            : <div className="dash-timeline">
                {activityLog.map(item => (
                  <div key={item.id} className="dash-timeline-item">
                    <span className="dash-timeline-dot" style={{ background: dotColor[item.type] }} />
                    <div className="dash-timeline-time">
                      {new Date(item.ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div className="dash-timeline-msg">{item.message}</div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Foto Dokumentasi Mesin — slot 4 kolom, konsisten sama Pemotong & Pengering. */}
        <div className="dash-photos">
          <div className="dash-panel-title"><ImageIcon size={14} /> Foto Dokumentasi Mesin</div>
          <div className="photo-grid">
            {DOKUMENTASI_FOTO.map((foto, i) => (
              <div className="photo-slot" key={i}>
                <img src={foto.src} alt={foto.label} />
                <span className="photo-slot-label">{foto.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ShortcutChip({ icon, title, desc, badge, onClick }) {
  return (
    <button className="dash-chip" onClick={onClick} type="button">
      <span className="dash-chip-icon">{icon}</span>
      <span className="dash-chip-text">
        <span className="dash-chip-title">{title}</span>
        <span className="dash-chip-desc">{desc}</span>
      </span>
      {badge ? <span className="shortcut-badge">{badge}</span> : null}
    </button>
  )
}