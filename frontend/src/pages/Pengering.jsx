import { useState, useEffect, useRef, useMemo } from 'react'
import { Flame, Thermometer, Droplets, Clock, CheckCircle2, Image as ImageIcon } from 'lucide-react'
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

// Kurva referensi "1 siklus ideal" — dibangun dari setpoint di Pengaturan, dipakai
// sebagai garis putus-putus di chart supaya dari awal (sebelum ada data real) sudah
// kelihatan gambaran bentuk siklus yang diharapkan: suhu naik saat pemanasan awal lalu
// netap (naik-turun kecil, karena heater nyala-mati menjaga rentang target); kelembaban
// turun terus melandai sampai ke batas target.
// Titik dibuat per 5% progres siklus (0–100%), dipakai bareng field `pct` di titik data real
// biar garis aktual & garis ideal sejajar di sumbu-X yang sama (persen siklus, bukan waktu jam).
function buildIdealTempCurve(settings) {
  const min = settings?.target_temp_min ?? 60
  const max = settings?.target_temp_max ?? 70
  const mid = (min + max) / 2
  const amp = Math.max((max - min) / 2 - 0.5, 1) // riak kecil di dalam rentang target (heater nyala-mati)
  const start = Math.max(28, min - 20) // suhu awal (ruangan) sebelum heater memanaskan
  const rampEndPct = 12 // 0–12% siklus dipakai buat pemanasan awal sampai masuk rentang target

  const points = []
  for (let pct = 0; pct <= 100; pct += 5) {
    let value
    if (pct <= rampEndPct) {
      value = start + (mid - start) * (pct / rampEndPct)
    } else {
      const wave = Math.sin(((pct - rampEndPct) / (100 - rampEndPct)) * Math.PI * 5)
      value = mid + wave * amp
    }
    points.push({ pct, value: Math.round(value * 10) / 10 })
  }
  return points
}

function buildIdealHumCurve(settings) {
  const targetMax = settings?.target_humidity_max ?? 15
  const start = 90 // kelembaban awal pisang basah sebelum dikeringkan

  const points = []
  for (let pct = 0; pct <= 100; pct += 5) {
    // turun melandai (eksponensial) — cepat di awal, makin lambat mendekati target
    const value = targetMax + (start - targetMax) * Math.exp(-pct / 30)
    points.push({ pct, value: Math.round(value * 10) / 10 })
  }
  return points
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

  // Kurva ideal 1 siklus penuh — dihitung ulang tiap setpoint di Pengaturan berubah.
  // Dipakai sebagai garis referensi (selalu tampil, bahkan sebelum ada data real).
  const idealTempCurve = useMemo(() => buildIdealTempCurve(settings), [settings])
  const idealHumCurve  = useMemo(() => buildIdealHumCurve(settings), [settings])

  // Tambah data chart
  useEffect(() => {
    if (!sensorData) return
    const estSec = settings ? settings.estimated_duration_min * 60 : null
    const elapsed = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0
    // pct = posisi titik ini di sumbu-X yang sama dengan kurva ideal (0–100% siklus),
    // biar garis aktual & garis ideal bisa langsung dibandingkan sejajar.
    const pct = isDrying && estSec ? Math.min(100, (elapsed / estSec) * 100) : null
    const point = {
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      temp: sensorData.temperature,
      hum:  sensorData.humidity,
      pct,
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

      {/* Dokumentasi Mesin — 4 slot foto berdampingan.
          Tinggal ganti isi tiap .photo-slot dengan <img src="..." alt="..." /> untuk
          menampilkan foto asli mesin pengering di sini. */}
      <div className="card">
        <div className="card-title">Dokumentasi Mesin Pengering</div>
        <div className="photo-grid">
          {[1, 2, 3, 4].map(i => (
            <div className="photo-slot" key={i}>
              <ImageIcon size={22} strokeWidth={1.5} />
              <span>Foto {i}</span>
            </div>
          ))}
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
          idealCurve={idealTempCurve}
        />
      </div>

      {/* Chart Kelembaban dengan band ideal */}
      <div className="card">
        <div className="card-title">Grafik Kelembaban {settings && `(Ideal: ≤ ${settings.target_humidity_max}%)`}</div>
        <ChartWithIdealBand
          data={chartData} dataKey="hum" name="Kelembaban (%)" color="#3b82f6" unit="%"
          idealMin={0} idealMax={settings?.target_humidity_max}
          domain={[0, 100]}
          idealCurve={idealHumCurve}
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