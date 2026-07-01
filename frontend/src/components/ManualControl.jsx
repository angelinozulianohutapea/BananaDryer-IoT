import { Power, PowerOff } from 'lucide-react'

// Reusable toggle on/off untuk kontrol manual komponen (heater/pemotong/pendorong)
// disabled saat mode AUTO aktif (biar gak bentrok sama siklus otomatis).
export default function ManualControl({ icon, label, desc, on, disabled, onToggleOn, onToggleOff, loading }) {
  return (
    <div className="component-card">
      <div className={`component-icon ${on ? 'component-icon-on' : ''}`}>{icon}</div>
      <div className="component-label">{label}</div>
      <div className="component-desc">{desc}</div>
      <div className={`component-state ${on ? 'component-state-on' : 'component-state-off'}`}>
        <span className="status-dot" />
        {on ? 'ON' : 'OFF'}
      </div>
      <div className="manual-toggle-row">
        <button
          className="btn-toggle btn-toggle-on"
          disabled={disabled || loading || on}
          onClick={onToggleOn}
        >
          <Power size={16} strokeWidth={2.5} />
          ON
        </button>
        <button
          className="btn-toggle btn-toggle-off"
          disabled={disabled || loading || !on}
          onClick={onToggleOff}
        >
          <PowerOff size={16} strokeWidth={2.5} />
          OFF
        </button>
      </div>
      {disabled && <div className="manual-disabled-hint">Mode Otomatis aktif</div>}
    </div>
  )
}