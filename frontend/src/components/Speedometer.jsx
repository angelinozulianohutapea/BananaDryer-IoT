// Speedometer sederhana pakai SVG arc, gak butuh library tambahan.
// value: 0-100 (persentase kecepatan/aktivitas motor)
export default function Speedometer({ value = 0, label = 'Kecepatan', unit = '%', color = '#f59e0b', size = 220 }) {
  const clamped = Math.max(0, Math.min(100, value))
  const angle   = (clamped / 100) * 180 // 0-180 derajat (setengah lingkaran)

  const cx = size / 2
  const cy = size / 2
  const r  = size / 2 - 18
  const trackWidth = Math.max(10, size * 0.075)

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

  // Skala angka (0 - 100) di sepanjang arc, ditaruh sedikit ke dalam dari track
  const scale = size / 160
  const ticks = [0, 25, 50, 75, 100].map(t => {
    const f = t / 100
    const theta = (1 - f) * Math.PI // radian, sama basisnya dgn track/needle
    const rTickOuter = r
    const rTickInner = r - 10 * scale
    const rLabel = r - 30 * scale
    return {
      value: t,
      x1: cx + rTickOuter * Math.cos(theta), y1: cy - rTickOuter * Math.sin(theta),
      x2: cx + rTickInner * Math.cos(theta), y2: cy - rTickInner * Math.sin(theta),
      lx: cx + rLabel * Math.cos(theta),     ly: cy - rLabel * Math.sin(theta),
    }
  })

  return (
    <div className="speedometer">
      <svg width={size} height={size / 2 + 40 * scale} viewBox={`0 0 ${size} ${size / 2 + 40 * scale}`}>
        {/* Track abu-abu */}
        <path
          d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 0 1 ${trackEnd.x} ${trackEnd.y}`}
          fill="none" stroke="#e2e8f0" strokeWidth={trackWidth} strokeLinecap="round"
        />
        {/* Progress berwarna */}
        {clamped > 0 && (
          <path
            d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${largeArc} 1 ${progX} ${progY}`}
            fill="none" stroke={color} strokeWidth={trackWidth} strokeLinecap="round"
          />
        )}
        {/* Skala angka + tanda tick */}
        {ticks.map(tk => (
          <g key={tk.value}>
            <line x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} stroke="#94a3b8" strokeWidth={2 * scale} />
            <text x={tk.lx} y={tk.ly} textAnchor="middle" dominantBaseline="middle" fontSize={13 * scale} fontWeight="600" fill="#64748b">
              {tk.value}
            </text>
          </g>
        ))}
        {/* Jarum */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#1e293b" strokeWidth={3 * scale} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={6 * scale} fill="#1e293b" />
        {/* Nilai */}
        <text x={cx} y={cy + 32 * scale} textAnchor="middle" fontSize={24 * scale} fontWeight="700" fill="#1e293b">
          {clamped.toFixed(0)}{unit}
        </text>
      </svg>
      <div className="speedometer-label" style={{ fontSize: 13 * scale }}>{label}</div>
    </div>
  )
}