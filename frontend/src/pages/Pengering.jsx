import { useState, useEffect, useRef } from 'react'
import { Flame, Thermometer, Droplets, Clock, CheckCircle2 } from 'lucide-react'
import useSocket from '../hooks/useSocket'
import { sendCommand, controlHeater, getSettings } from '../hooks/api'
import ManualControl from '../components/ManualControl'
import ChartWithIdealBand from '../components/ChartWithIdealBand'

const STATE_COLOR = {
  IDLE: '#6b7280', DRYING: '#f59e0b', FINISHED: '#10b981', ERROR: '#ef4444', OFFLINE: '#ef4444',
}

function fmtDuration(sec) {
  if (sec === null || sec === undefined) return '-'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}j ${m}m` : `${m}m`
}

export default function Pengering() {
  const { connected, sensorData, machineState, earlyComplete } = useSocket()
  const [mode, setMode]     = useState('AUTO') // 'AUTO' | 'MANUAL'
  const [chartData, setChartData] = useState([])
  const [settings, setSettings] = useState(null)
  const [cmdLoading, setCmdLoading] = useState(false)
  const [heaterLoading, setHeaterLoading] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const startedAtRef = useRef(null)

  const effectiveState = sensorData?.state || machineState
  const stateColor = STATE_COLOR[effectiveState] || '#6b7280'
  const isDrying = effectiveState === 'DRYING'
  const heaterOn = sensorData?.heater === 'ON'

  // Ambil setpoint sekali di awal + refresh tiap ganti halaman
  useEffect(() => {
    getSettings().then(r => setSettings(r.data?.data)).catch(() => {})
  }, [])

  // Tambah data chart
  useEffect(() => {
    if (!sensorData) return
    const point = {
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      temp: sensorData.temperature,
      hum:  sensorData.humidity,
    }
    setChartData(prev => [...prev.slice(-39), point])
  }, [sensorData])

  // Hitung elapsed time berjalan (buat progress vs estimasi)
  useEffect(() => {
    if (isDrying && !startedAtRef.current) {
      startedAtRef.current = Date.now()
    }
    if (!isDrying) {
      startedAtRef.current = null
      setElapsedSec(0)
    }
  }, [isDrying])

  useEffect(() => {
    if (!isDrying) return
    const t = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(t)
  }, [isDrying])

  const estimatedSec = settings ? settings.estimated_duration_min * 60 : null
  const progressPct  = estimatedSec ? Math.min(100, (elapsedSec / estimatedSec) * 100) : 0
  const remainingSec = estimatedSec ? Math.max(0, estimatedSec - elapsedSec) : null

  const sendCmd = async (cmd, value) => {
    setCmdLoading(true)
    try { await sendCommand(cmd, value) }
    catch (e) { alert('Gagal kirim perintah: ' + e.message) }
    finally { setCmdLoading(false) }
  }

  const doHeater = async (state) => {
    setHeaterLoading(true)
    try { await controlHeater(state) }
    catch (e) { alert('Gagal kontrol heater: ' + e.message) }
    finally { setHeaterLoading(false) }
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pengering</h1>
          <p className="page-subtitle">Kontrol heater &amp; monitoring suhu/kelembaban</p>
        </div>
        <div className="status-badge" style={{ background: stateColor + '22', color: stateColor, border: `1px solid ${stateColor}` }}>
          <span className="status-dot" style={{ background: stateColor }} />
          {effectiveState || 'IDLE'}
        </div>
      </div>

      <div className={`conn-bar ${connected ? 'conn-ok' : 'conn-err'}`}>
        {connected ? '🟢 Socket.IO terhubung — data realtime aktif' : '🔴 Tidak terhubung ke backend'}
      </div>

      {/* Notifikasi early-complete */}
      {earlyComplete && (
        <div className="early-complete-banner">
          <CheckCircle2 size={20} />
          <div>
            <b>Target tercapai lebih cepat!</b>
            <div>
              Selesai dalam {fmtDuration(earlyComplete.elapsed_sec)} dari estimasi {fmtDuration(earlyComplete.estimated_sec)}
              {' '}— hemat {fmtDuration(earlyComplete.saved_sec)}.
            </div>
          </div>
        </div>
      )}

      {/* Ilustrasi mesin pengering */}
      <div className="card">
        <div className="card-title">Skema Mesin Pengering</div>
        <div className="machine-illustration">
          <DryerIllustration heaterOn={heaterOn} temp={sensorData?.temperature} />
        </div>
      </div>

      {/* Toggle Mode Auto/Manual */}
      <div className="card">
        <div className="card-title">Mode Operasi</div>
        <div className="mode-switch">
          <button className={`mode-btn ${mode === 'AUTO' ? 'mode-btn-active' : ''}`} onClick={() => setMode('AUTO')}>
            🔄 Otomatis
          </button>
          <button className={`mode-btn ${mode === 'MANUAL' ? 'mode-btn-active' : ''}`} onClick={() => setMode('MANUAL')}>
            ✋ Manual
          </button>
        </div>
      </div>

      {/* Stat + Kontrol Heater */}
      <div className="card">
        <div className="card-title">Status &amp; Kontrol Heater</div>
        <div className="component-grid" style={{ gridTemplateColumns: '1fr' }}>
          <ManualControl
            icon={<Flame size={20} />}
            label="Heater"
            desc="Elemen pemanas"
            on={heaterOn}
            disabled={mode === 'AUTO'}
            loading={heaterLoading}
            onToggleOn={() => doHeater('ON')}
            onToggleOff={() => doHeater('OFF')}
          />
        </div>
      </div>

      {/* Progress vs Estimasi */}
      {isDrying && settings && (
        <div className="card">
          <div className="card-title">Progress vs Estimasi Waktu</div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progressPct}%`, background: stateColor }} />
          </div>
          <div className="progress-labels">
            <span><Clock size={12} style={{ verticalAlign: 'middle' }} /> {fmtDuration(elapsedSec)} berjalan</span>
            <span style={{ color: stateColor, fontWeight: 600 }}>{progressPct.toFixed(0)}%</span>
            <span>Estimasi {fmtDuration(estimatedSec)}</span>
          </div>
          <div className="estimate-compare">
            <div className="estimate-item">
              <span>Sisa Waktu (estimasi)</span>
              <b>{fmtDuration(remainingSec)}</b>
            </div>
            <div className="estimate-item">
              <span>Target Suhu</span>
              <b>{settings.target_temp_min}–{settings.target_temp_max}°C</b>
            </div>
            <div className="estimate-item">
              <span>Target Kelembaban</span>
              <b>≤ {settings.target_humidity_max}%</b>
            </div>
          </div>
          <p className="manual-warning" style={{ marginTop: 12 }}>
            Kalau suhu &amp; kelembaban sudah masuk target dan stabil selama {settings.stable_minutes} menit,
            sistem akan berhenti otomatis walau estimasi waktu di atas belum habis.
          </p>
        </div>
      )}

      {/* Chart Suhu dengan band ideal */}
      <div className="card">
        <div className="card-title">Grafik Suhu {settings && `(Ideal: ${settings.target_temp_min}–${settings.target_temp_max}°C)`}</div>
        <ChartWithIdealBand
          data={chartData} dataKey="temp" name="Suhu (°C)" color="#ef4444" unit="°C"
          idealMin={settings?.target_temp_min} idealMax={settings?.target_temp_max}
          domain={[30, 90]}
        />
      </div>

      {/* Chart Kelembaban dengan band ideal */}
      <div className="card">
        <div className="card-title">Grafik Kelembaban {settings && `(Ideal: ≤ ${settings.target_humidity_max}%)`}</div>
        <ChartWithIdealBand
          data={chartData} dataKey="hum" name="Kelembaban (%)" color="#3b82f6" unit="%"
          idealMin={0} idealMax={settings?.target_humidity_max}
          domain={[0, 100]}
        />
      </div>

      {/* Aksi mesin — hanya kalau AUTO */}
      {mode === 'AUTO' && (
        <div className="card">
          <div className="card-title">Aksi Mesin</div>
          <div className="control-row">
            <button className="btn btn-green" disabled={cmdLoading} onClick={() => sendCmd('START')}>▶ Mulai Pengeringan</button>
            <button className="btn btn-red"   disabled={cmdLoading} onClick={() => sendCmd('STOP')}>⏹ Hentikan</button>
          </div>
        </div>
      )}

      {mode === 'MANUAL' && (
        <div className="card">
          <div className="card-title">⚠️ Mode Manual Aktif</div>
          <p className="manual-warning">
            Kontrol otomatis heater dinonaktifkan. Gunakan tombol ON/OFF di atas untuk mengatur heater
            secara langsung. Perhatikan suhu supaya tidak melebihi batas aman.
          </p>
        </div>
      )}
    </div>
  )
}

function DryerIllustration({ heaterOn, temp }) {
  return (
    <svg viewBox="0 0 400 160" width="100%" height="160">
      <rect x="60" y="20" width="280" height="120" rx="10" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
      {/* Rak-rak pengering */}
      {[0, 1, 2].map(i => (
        <line key={i} x1="75" y1={45 + i * 30} x2="325" y2={45 + i * 30} stroke="#cbd5e1" strokeWidth="2" />
      ))}
      {/* Elemen heater di bawah */}
      <rect x="75" y="125" width="250" height="8" rx="4" fill={heaterOn ? '#f59e0b' : '#cbd5e1'}>
        {heaterOn && (
          <animate attributeName="opacity" values="1;0.4;1" dur="0.8s" repeatCount="indefinite" />
        )}
      </rect>
      <text x="200" y="150" textAnchor="middle" fontSize="11" fill="#64748b">
        Heater {heaterOn ? '(ON)' : '(OFF)'} {temp !== undefined && temp !== null ? `· ${temp.toFixed(1)}°C` : ''}
      </text>
      {/* Uap kalau heater nyala */}
      {heaterOn && (
        <>
          <circle cx="150" cy="30" r="3" fill="#94a3b8" opacity="0.6">
            <animate attributeName="cy" values="30;5;30" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="200" cy="30" r="3" fill="#94a3b8" opacity="0.6">
            <animate attributeName="cy" values="30;5;30" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx="250" cy="30" r="3" fill="#94a3b8" opacity="0.6">
            <animate attributeName="cy" values="30;5;30" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </>
      )}
    </svg>
  )
}