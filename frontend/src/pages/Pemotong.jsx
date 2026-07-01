import { useState, useEffect } from 'react'
import { Scissors, ArrowRightLeft, RotateCcw } from 'lucide-react'
import useSocket from '../hooks/useSocket'
import { sendCommand, controlPusher, controlCutter } from '../hooks/api'
import Speedometer from '../components/Speedometer'
import ManualControl from '../components/ManualControl'

const CYCLE_PRESETS = [5, 10, 15, 20]

// State yang termasuk fase "memotong"
const SLICING_PHASES = ['SERVO_OPENING', 'SLICING_FORWARD', 'SLICING_RETURN', 'SERVO_WAIT', 'SERVO_CLOSING']

const STATE_COLOR = {
  IDLE: '#6b7280', SERVO_OPENING: '#3b82f6', SLICING_FORWARD: '#f59e0b',
  SLICING_RETURN: '#f59e0b', SERVO_WAIT: '#3b82f6', SERVO_CLOSING: '#3b82f6',
  DRYING: '#f59e0b', FINISHED: '#10b981', ERROR: '#ef4444', OFFLINE: '#ef4444',
}

export default function Pemotong() {
  const { connected, sensorData, machineState } = useSocket()
  const [mode, setMode]         = useState('AUTO') // 'AUTO' | 'MANUAL'
  const [cycles, setCycles]     = useState(10)
  const [cmdLoading, setCmdLoading] = useState(false)

  const effectiveState = sensorData?.state || machineState
  const isSlicingPhase = SLICING_PHASES.includes(effectiveState)
  const cycleCurrent   = sensorData?.cycle_current ?? sensorData?.cycle ?? 0
  const cycleTotal     = sensorData?.cycle_total   ?? sensorData?.total ?? 0
  const stateColor     = STATE_COLOR[effectiveState] || '#6b7280'

  // Status aktuator (dari state mesin, karena firmware belum kirim field ON/OFF terpisah)
  const pendorongOn = effectiveState === 'SLICING_FORWARD' || effectiveState === 'SLICING_RETURN'
  const pemotongOn  = effectiveState === 'SLICING_FORWARD'

  // Perkiraan "kecepatan" motor buat speedometer — selama fase memotong dianggap
  // berjalan penuh (100%), di luar itu 0%. Kalau nanti firmware kirim RPM asli,
  // tinggal ganti nilai ini dengan sensorData.motor_rpm.
  const motorSpeed = pendorongOn || pemotongOn ? 100 : 0

  const [manualLoading, setManualLoading] = useState({ pusher: false, cutter: false })

  const sendCmd = async (cmd, value) => {
    setCmdLoading(true)
    try { await sendCommand(cmd, value) }
    catch (e) { alert('Gagal kirim perintah: ' + e.message) }
    finally { setCmdLoading(false) }
  }

  const doPusher = async (action) => {
    setManualLoading(s => ({ ...s, pusher: true }))
    try { await controlPusher(action) }
    catch (e) { alert('Gagal kontrol pendorong: ' + e.message) }
    finally { setManualLoading(s => ({ ...s, pusher: false })) }
  }

  const doCutter = async (state) => {
    setManualLoading(s => ({ ...s, cutter: true }))
    try { await controlCutter(state) }
    catch (e) { alert('Gagal kontrol pemotong: ' + e.message) }
    finally { setManualLoading(s => ({ ...s, cutter: false })) }
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pemotong / Pengiris</h1>
          <p className="page-subtitle">Kontrol pendorong &amp; pisau pemotong pisang</p>
        </div>
        <div className="status-badge" style={{ background: stateColor + '22', color: stateColor, border: `1px solid ${stateColor}` }}>
          <span className="status-dot" style={{ background: stateColor }} />
          {effectiveState || 'IDLE'}
        </div>
      </div>

      <div className={`conn-bar ${connected ? 'conn-ok' : 'conn-err'}`}>
        {connected ? '🟢 Socket.IO terhubung — data realtime aktif' : '🔴 Tidak terhubung ke backend'}
      </div>

      {/* Ilustrasi mesin */}
      <div className="card">
        <div className="card-title">Skema Mesin Pemotong</div>
        <div className="machine-illustration">
          <MachineIllustration pendorongOn={pendorongOn} pemotongOn={pemotongOn} />
        </div>
      </div>

      {/* Toggle Mode Auto/Manual */}
      <div className="card">
        <div className="card-title">Mode Operasi</div>
        <div className="mode-switch">
          <button className={`mode-btn ${mode === 'AUTO' ? 'mode-btn-active' : ''}`} onClick={() => setMode('AUTO')}>
            🔄 Otomatis (Siklus)
          </button>
          <button className={`mode-btn ${mode === 'MANUAL' ? 'mode-btn-active' : ''}`} onClick={() => setMode('MANUAL')}>
            ✋ Manual
          </button>
        </div>
      </div>

      {/* Status Komponen + Kontrol Manual */}
      <div className="card">
        <div className="card-title">Status &amp; Kontrol Komponen</div>
        <div className="component-grid">
          <ManualControl
            icon={<ArrowRightLeft size={20} />}
            label="Pendorong"
            desc="Motor pendorong bahan (TB1)"
            on={pendorongOn}
            disabled={mode === 'AUTO'}
            loading={manualLoading.pusher}
            onToggleOn={() => doPusher('FORWARD')}
            onToggleOff={() => doPusher('STOP')}
          />
          <ManualControl
            icon={<Scissors size={20} />}
            label="Pemotong"
            desc="Pisau iris otomatis (TB2)"
            on={pemotongOn}
            disabled={mode === 'AUTO'}
            loading={manualLoading.cutter}
            onToggleOn={() => doCutter('ON')}
            onToggleOff={() => doCutter('OFF')}
          />
        </div>
      </div>

      {/* Speedometer */}
      <div className="card">
        <div className="card-title">Kecepatan Motor</div>
        <div className="speedometer-row">
          <Speedometer value={motorSpeed} label="Pendorong (TB1)" color="#3b82f6" />
          <Speedometer value={pemotongOn ? 100 : 0} label="Pemotong (TB2)" color="#f59e0b" />
        </div>
      </div>

      {/* Progress siklus */}
      <div className="card">
        <div className="card-title">Progress Pemotongan</div>
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
      </div>

      {/* Panel Kontrol Otomatis — cuma aktif kalau mode AUTO */}
      {mode === 'AUTO' && (
        <>
          <div className="card">
            <div className="card-title">Panel Kontrol — Target Siklus</div>
            <div className="cycle-presets">
              {CYCLE_PRESETS.map(n => (
                <button
                  key={n}
                  className={`preset-btn ${cycles === n ? 'preset-btn-active' : ''}`}
                  onClick={() => setCycles(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="cycles-row">
              <label className="cycles-label">Jumlah Siklus:</label>
              <div className="stepper">
                <button type="button" className="stepper-btn" disabled={cmdLoading || cycles <= 1} onClick={() => setCycles(c => Math.max(1, c - 1))}>−</button>
                <input
                  type="number" min={1} max={99}
                  value={cycles}
                  onChange={e => setCycles(Math.min(99, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="cycles-input"
                />
                <button type="button" className="stepper-btn" disabled={cmdLoading || cycles >= 99} onClick={() => setCycles(c => Math.min(99, c + 1))}>+</button>
              </div>
              <button className="btn btn-blue" disabled={cmdLoading} onClick={() => sendCmd('CYCLES', cycles)}>Set Siklus</button>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Aksi Mesin</div>
            <div className="control-row">
              <button className="btn btn-green"  disabled={cmdLoading} onClick={() => sendCmd('START')}>▶ Mulai Siklus Otomatis</button>
              <button className="btn btn-red"    disabled={cmdLoading} onClick={() => sendCmd('STOP')}>⏹ Hentikan</button>
              <button className="btn btn-yellow" disabled={cmdLoading} onClick={() => sendCmd('RESET')}><RotateCcw size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />Reset Sistem</button>
            </div>
          </div>
        </>
      )}

      {mode === 'MANUAL' && (
        <div className="card">
          <div className="card-title">⚠️ Mode Manual Aktif</div>
          <p className="manual-warning">
            Siklus otomatis dinonaktifkan. Gunakan tombol ON/OFF di atas untuk mengontrol pendorong
            dan pemotong secara langsung. Pastikan area mesin aman sebelum mengoperasikan manual.
          </p>
        </div>
      )}
    </div>
  )
}

// Ilustrasi sederhana posisi pendorong & pisau — pakai SVG, gampang diganti pakai gambar asli nanti
function MachineIllustration({ pendorongOn, pemotongOn }) {
  return (
    <svg viewBox="0 0 400 160" width="100%" height="160">
      {/* Rangka mesin */}
      <rect x="10" y="30" width="380" height="100" rx="8" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />
      {/* Rel pendorong */}
      <line x1="30" y1="80" x2="250" y2="80" stroke="#cbd5e1" strokeWidth="4" strokeDasharray="6 4" />
      {/* Pendorong (kotak biru bergerak) */}
      <rect
        x={pendorongOn ? 180 : 40} y="65" width="30" height="30" rx="4"
        fill={pendorongOn ? '#3b82f6' : '#94a3b8'}
        style={{ transition: 'x 0.6s ease' }}
      />
      <text x={pendorongOn ? 195 : 55} y="115" textAnchor="middle" fontSize="11" fill="#64748b">Pendorong</text>

      {/* Pisau pemotong (lingkaran kuning berputar) */}
      <circle cx="300" cy="80" r="28" fill="none" stroke={pemotongOn ? '#f59e0b' : '#cbd5e1'} strokeWidth="4" />
      <line x1="300" y1="60" x2="300" y2="100" stroke={pemotongOn ? '#f59e0b' : '#cbd5e1'} strokeWidth="3"
        style={pemotongOn ? { transformOrigin: '300px 80px', animation: 'spin 0.4s linear infinite' } : {}} />
      <line x1="280" y1="80" x2="320" y2="80" stroke={pemotongOn ? '#f59e0b' : '#cbd5e1'} strokeWidth="3"
        style={pemotongOn ? { transformOrigin: '300px 80px', animation: 'spin 0.4s linear infinite' } : {}} />
      <text x="300" y="130" textAnchor="middle" fontSize="11" fill="#64748b">Pemotong</text>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </svg>
  )
}