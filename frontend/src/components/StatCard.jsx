export default function StatCard({ label, value, unit, icon, color = '#f59e0b' }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: color + '22', color }}>
        {icon}
      </div>
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <span className="stat-value">
          {value ?? '--'} <span className="stat-unit">{unit}</span>
        </span>
      </div>
    </div>
  )
}
