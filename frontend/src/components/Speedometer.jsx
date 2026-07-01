// Speedometer sederhana pakai SVG arc, gak butuh library tambahan.
// value: 0-100 (persentase kecepatan/aktivitas motor)
export default function Speedometer({ value = 0, label = 'Kecepatan', unit = '%', color = '#f59e0b' }) {
  const clamped = Math.max(0, Math.min(100, value))
  const angle   = (clamped / 100) * 180 // 0-180 derajat (setengah lingkaran)

  const size = 160
  const cx = size / 2
  const cy = size / 2
  const r  = size / 2 - 14

  // Titik ujung jarum
  const rad = (Math.PI * (180 - angle)) / 180
  const needleX = cx + r * 0.75 * Math.cos(rad)
  const needleY = cy - r * 0.75 * Math.sin(rad)

  // Arc track (background) — setengah lingkaran dari kiri ke kanan
  const trackStart = { x: cx - r, y: cy }
  const trackEnd   = { x: cx + r, y: cy }

  // Arc progress
  const progRad = (Math.PI * (180 - angle)) / 180
  const progX = cx + r * Math.cos(progRad)
  const progY = cy - r * Math.sin(progRad)
  const largeArc = angle > 180 ? 1 : 0

  return (
    <div className="speedometer">
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        {/* Track abu-abu */}
        <path
          d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 0 1 ${trackEnd.x} ${trackEnd.y}`}
          fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round"
        />
        {/* Progress berwarna */}
        {clamped > 0 && (
          <path
            d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${largeArc} 1 ${progX} ${progY}`}
            fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          />
        )}
        {/* Jarum */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill="#1e293b" />
        {/* Nilai */}
        <text x={cx} y={cy + 28} textAnchor="middle" fontSize="20" fontWeight="700" fill="#1e293b">
          {clamped.toFixed(0)}{unit}
        </text>
      </svg>
      <div className="speedometer-label">{label}</div>
    </div>
  )
}