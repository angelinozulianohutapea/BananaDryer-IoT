import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Thermometer, Droplets, RotateCcw, Cpu, Flame, Scissors, ArrowRightLeft } from 'lucide-react'
import useSocket from '../hooks/useSocket'
import { sendCommand, getMachineStatus } from '../hooks/api'
import StatCard from '../components/StatCard'

const STATE_COLOR = {
  IDLE: '#6b7280', DRYING: '#f59e0b', FINISHED: '#10b981',
  ERROR: '#ef4444', OFFLINE: '#ef4444', SERVO_OPENING: '#3b82f6',
  SERVO_CLOSING: '#3b82f6', SLICING_FORWARD: '#3b82f6', SLICING_RETURN: '#3b82f6',
  SERVO_WAIT: '#3b82f6',
}

// State yang termasuk fase "memotong" — progress di fase ini cuma merepresentasikan
// rasio siklus pemotongan (current/total), BUKAN progress keseluruhan proses.
// Fase mengering (DRYING) baru progress berbasis waktu yang sebenarnya.
const SLICING_PHASES = ['SERVO_OPENING', 'SLICING_FORWARD', 'SLICING_RETURN', 'SERVO_WAIT', 'SERVO_CLOSING']

// Status aktuator pemotong & pendorong diturunkan dari state mesin,
// karena firmware belum mengirim field ON/OFF terpisah untuk itu.
function getActuatorStatus(state, heater) {
  const pendorong = state === 'SLICING_FORWARD' || state === 'SLICING_RETURN'
  const pemotong   = state === 'SLICING_FORWARD'
  return {
    heater:    heater === 'ON',
    pemotong,
    pendorong,
  }
}

const STATE_LABEL = {
  IDLE: 'Sistem siaga (IDLE)',
  SERVO_OPENING: 'Servo membuka',
  SLICING_FORWARD: 'Pemotongan berlangsung — pendorong & pisau aktif',
  SLICING_RETURN: 'Pendorong mundur',
  SERVO_WAIT: 'Menunggu irisan masuk',
  SERVO_CLOSING: 'Servo menutup',
  DRYING: 'Sistem BananaDryer aktif, heater menyala',
  FINISHED: 'Siklus selesai, target tercapai',
  ERROR: 'Terjadi error pada sistem',
}

export default function Dashboard() {
  const { connected, sensorData, machineState, heartbeat, alerts } = useSocket()
  const [chartData, setChartData] = useState([])
  const [cmdLoading, setCmdLoading] = useState(false)
  const [machineInfo, setMachineInfo] = useState(null)
  const [stateLog, setStateLog] = useState([])
  const prevStateRef = useRef(null)

  // sensorData.state dipakai sebagai sumber utama (lihat catatan versi sebelumnya):
  // lebih reliable daripada machineState karena dikirim berkala, bukan sekali per transisi.
  const effectiveState = sensorData?.state || machineState

  // Load status awal
  useEffect(() => {
    getMachineStatus()
      .then(r => setMachineInfo(r.data?.data))
      .catch(() => {})
  }, [])

  // Tambah data ke chart (max 30 titik)
  useEffect(() => {
    if (!sensorData) return
    const point = {
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      temp: sensorData.temperature,
      hum:  sensorData.humidity,
    }
    setChartData(prev => [...prev.slice(-29), point])
  }, [sensorData])

  // Catat perubahan state ke log lokal (realtime, sesi berjalan ini)
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

  // Gabungkan alert asli dari backend (alert:new) dengan histori perubahan state lokal
  const activityLog = [
    ...alerts.map(a => ({
      id: `alert-${a.id || a.ts}`,
      message: a.message || a.type,
      ts: a.ts ? new Date(a.ts).getTime() : Date.now(),
      type: a.type === 'EMERGENCY_STOP' || a.type === 'SENSOR_ERROR' ? 'error' : 'warning',
    })),
    ...stateLog,
  ].sort((a, b) => b.ts - a.ts).slice(0, 20)

  const sendCmd = async (cmd, value) => {
    setCmdLoading(true)
    try { await sendCommand(cmd, value) }
    catch (e) { alert('Gagal kirim perintah: ' + e.message) }
    finally { setCmdLoading(false) }
  }

  const stateColor = STATE_COLOR[effectiveState] || '#6b7280'
  const actuators  = getActuatorStatus(effectiveState, sensorData?.heater)
  const cycleCurrent = sensorData?.cycle_current ?? sensorData?.cycle ?? 0
  const cycleTotal   = sensorData?.cycle_total   ?? sensorData?.total ?? 0
  const isSlicingPhase = SLICING_PHASES.includes(effectiveState)

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">BananaDryer01</h1>
          <p className="page-subtitle">Ringkasan Monitoring Realtime — detail kontrol ada di halaman Pemotong &amp; Pengering</p>
        </div>
        <div className="status-badge" style={{ background: stateColor + '22', color: stateColor, border: `1px solid ${stateColor}` }}>
          <span className="status-dot" style={{ background: stateColor }} />
          {effectiveState || 'IDLE'}
        </div>
      </div>

      {/* Koneksi */}
      <div className={`conn-bar ${connected ? 'conn-ok' : 'conn-err'}`}>
        {connected ? '🟢 Socket.IO terhubung — data realtime aktif' : '🔴 Tidak terhubung ke backend'}
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        <StatCard label="Suhu" value={sensorData?.temperature?.toFixed(1)} unit="°C" icon={<Thermometer size={20}/>} color="#ef4444" />
        <StatCard label="Kelembaban" value={sensorData?.humidity?.toFixed(1)} unit="%" icon={<Droplets size={20}/>} color="#3b82f6" />
        <StatCard label="Siklus" value={sensorData ? `${cycleCurrent}/${cycleTotal}` : '--'} unit="" icon={<RotateCcw size={20}/>} color="#10b981" />
        <StatCard
          label={isSlicingPhase ? 'Siklus Berjalan' : 'Progress'}
          value={isSlicingPhase ? `${cycleCurrent}/${cycleTotal || '-'}` : (sensorData?.progress ?? 0)}
          unit={isSlicingPhase ? '' : '%'}
          icon={<Cpu size={20}/>} color="#f59e0b" />
      </div>

      {/* Status Komponen — read-only, kontrol manual ada di halaman Pemotong/Pengering */}
      <div className="card">
        <div className="card-title">Status Komponen</div>
        <div className="component-grid">
          <ComponentStatus icon={<Flame size={20}/>} label="Heater" desc="Elemen pemanas" on={actuators.heater} />
          <ComponentStatus icon={<Scissors size={20}/>} label="Pemotong" desc="Pisau iris otomatis" on={actuators.pemotong} />
          <ComponentStatus icon={<ArrowRightLeft size={20}/>} label="Pendorong" desc="Motor pendorong bahan" on={actuators.pendorong} />
        </div>
        <p className="dashboard-hint">Untuk kontrol manual per-komponen, buka halaman <b>Pemotong</b> atau <b>Pengering</b>.</p>
      </div>

      {/* Progress Bar */}
      <div className="card">
        <div className="card-title">{isSlicingPhase ? 'Progress Pemotongan' : 'Progress Pengeringan'}</div>
        {isSlicingPhase ? (
          <>
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{ width: cycleTotal ? `${Math.min(100, (cycleCurrent / cycleTotal) * 100)}%` : '0%', background: stateColor }}
              />
            </div>
            <div className="progress-labels">
              <span>Siklus 0</span>
              <span style={{ color: stateColor, fontWeight: 600 }}>{cycleCurrent}/{cycleTotal || '-'}</span>
              <span>Siklus {cycleTotal || '-'}</span>
            </div>
          </>
        ) : (
          <>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${sensorData?.progress ?? 0}%`, background: stateColor }} />
            </div>
            <div className="progress-labels">
              <span>0%</span>
              <span style={{ color: stateColor, fontWeight: 600 }}>{sensorData?.progress ?? 0}%</span>
              <span>100%</span>
            </div>
          </>
        )}
      </div>

      {/* Chart Suhu */}
      <div className="card">
        <div className="card-title">Grafik Suhu</div>
        {chartData.length === 0
          ? <div className="chart-empty">Menunggu data dari sensor...</div>
          : <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[40, 90]} />
                <Tooltip />
                <Line type="monotone" dataKey="temp" name="Suhu (°C)" stroke="#ef4444" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
        }
      </div>

      {/* Chart Kelembaban */}
      <div className="card">
        <div className="card-title">Grafik Kelembaban</div>
        {chartData.length === 0
          ? <div className="chart-empty">Menunggu data dari sensor...</div>
          : <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="hum" name="Kelembaban (%)" stroke="#3b82f6" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
        }
      </div>

      {/* Aksi Darurat Global — START/STOP/RESET tetap di sini biar operator bisa
          langsung hentikan mesin dari halaman manapun tanpa navigasi.
          Panel pengaturan JUMLAH SIKLUS dipindah sepenuhnya ke halaman Pemotong,
          supaya cuma ada 1 tempat buat setting itu (hindari duplikasi/salah setting). */}
      <div className="card">
        <div className="card-title">Aksi Mesin (Darurat / Global)</div>
        <div className="control-row">
          <button className="btn btn-green"  disabled={cmdLoading} onClick={() => sendCmd('START')}>▶ Mulai (pakai siklus terakhir)</button>
          <button className="btn btn-red"    disabled={cmdLoading} onClick={() => sendCmd('STOP')}>⏹ Hentikan</button>
          <button className="btn btn-yellow" disabled={cmdLoading} onClick={() => sendCmd('RESET')}>↺ Reset Sistem</button>
        </div>
        <p className="dashboard-hint">Untuk mengatur jumlah siklus pemotongan, buka halaman <b>Pemotong</b>.</p>
      </div>

      {/* Log Aktivitas */}
      <div className="card">
        <div className="card-title">Log Aktivitas</div>
        {activityLog.length === 0
          ? <div className="empty">Belum ada aktivitas pada sesi ini</div>
          : <div className="alert-list">
              {activityLog.map(item => (
                <div key={item.id} className="alert-item">
                  <div className="alert-meta">
                    <span className={`badge badge-${item.type === 'error' ? 'error' : item.type === 'success' ? 'finished' : item.type === 'warning' ? 'wifi-lost' : 'stopped'}`}>
                      {item.type === 'error' ? 'Error' : item.type === 'success' ? 'Selesai' : item.type === 'warning' ? 'Peringatan' : 'Info'}
                    </span>
                    <span className="alert-time">
                      {new Date(item.ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <div className="alert-msg">{item.message}</div>
                </div>
              ))}
            </div>
        }
      </div>

      {/* Heartbeat Info */}
      {heartbeat && (
        <div className="card info-grid">
          <div className="info-item"><span>Firmware</span><b>{heartbeat.firmware}</b></div>
          <div className="info-item"><span>Chip</span><b>{heartbeat.chip}</b></div>
          <div className="info-item"><span>WiFi RSSI</span><b>{heartbeat.wifi_rssi} dBm</b></div>
          <div className="info-item"><span>Heap Free</span><b>{heartbeat.heap_free} B</b></div>
          <div className="info-item"><span>Uptime</span><b>{Math.floor((heartbeat.uptime||0)/60)} menit</b></div>
          <div className="info-item"><span>Nano</span><b style={{color: heartbeat.nano==='online'?'#10b981':'#ef4444'}}>{heartbeat.nano}</b></div>
        </div>
      )}
    </div>
  )
}

function ComponentStatus({ icon, label, desc, on }) {
  return (
    <div className="component-card">
      <div className={`component-icon ${on ? 'component-icon-on' : ''}`}>{icon}</div>
      <div className="component-label">{label}</div>
      <div className="component-desc">{desc}</div>
      <div className={`component-state ${on ? 'component-state-on' : 'component-state-off'}`}>
        <span className="status-dot" />
        {on ? 'ON' : 'OFF'}
      </div>
    </div>
  )
}