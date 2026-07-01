// Chart garis dibangun pakai SVG murni (bukan recharts) — supaya sumbu, angka,
// dan garis ideal PASTI kelihatan, gak gantung ke behavior library chart pihak ketiga.
// data: [{ time, ...dataKeys }], lines: [{ dataKey, name, color }]
// idealLine: { value, label, color } — garis acuan ideal yang selalu tampil, bahkan sebelum ada data.
export default function DualLineChart({ data, lines, domain, ticks, unit = '%', idealLine }) {
  const hasData = data && data.length > 0
  const points  = hasData ? data : []

  const yDomain = domain || [0, 110]
  const yTicks  = ticks  || [0, 25, 50, 75, 100]
  const [yMin, yMax] = yDomain

  // Ukuran & padding kanvas (viewBox tetap, scale otomatis lewat width 100%)
  const W = 600, H = 220
  const padL = 42, padR = 16, padT = 14, padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const yPixel = (v) => padT + plotH * (1 - (v - yMin) / (yMax - yMin))
  const xPixel = (i, n) => n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW

  const n = points.length
  // Biar label waktu di sumbu-X gak numpuk kalau titik data banyak, tampilin sebagian aja
  const labelStep = n > 6 ? Math.ceil(n / 6) : 1

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
        {/* Grid horizontal + label angka sumbu-Y */}
        {yTicks.map(t => (
          <g key={t}>
            <line x1={padL} y1={yPixel(t)} x2={W - padR} y2={yPixel(t)} stroke="#eef1f6" strokeWidth="1" />
            <text x={padL - 8} y={yPixel(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#94a3b8">
              {t}
            </text>
          </g>
        ))}

        {/* Sumbu X & Y (garis tepi plot) */}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#cbd5e1" strokeWidth="1.5" />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#cbd5e1" strokeWidth="1.5" />

        {/* Garis ideal / target — selalu tampil, walau belum ada data real */}
        {idealLine && (
          <>
            <line
              x1={padL} y1={yPixel(idealLine.value)} x2={W - padR} y2={yPixel(idealLine.value)}
              stroke={idealLine.color || '#94a3b8'} strokeWidth="2" strokeDasharray="7 5"
            />
            <text x={W - padR} y={yPixel(idealLine.value) - 6} textAnchor="end" fontSize="11" fontWeight="600" fill={idealLine.color || '#94a3b8'}>
              {idealLine.label || 'Ideal'}
            </text>
          </>
        )}

        {/* Garis data aktual (real-time) — cuma tergambar kalau sudah ada data */}
        {hasData && lines.map(l => {
          const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPixel(i, n)} ${yPixel(p[l.dataKey] ?? 0)}`).join(' ')
          const lastX = xPixel(n - 1, n)
          const lastY = yPixel(points[n - 1][l.dataKey] ?? 0)
          return (
            <g key={l.dataKey}>
              <path d={path} fill="none" stroke={l.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={lastX} cy={lastY} r="4" fill={l.color} />
            </g>
          )
        })}

        {/* Label waktu di sumbu-X */}
        {hasData ? points.map((p, i) => (
          i % labelStep === 0 && (
            <text key={i} x={xPixel(i, n)} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#94a3b8">
              {p.time}
            </text>
          )
        )) : (
          <text x={padL + plotW / 2} y={H - padB + 16} textAnchor="middle" fontSize="11" fill="#94a3b8">
            Menunggu data sensor...
          </text>
        )}
      </svg>

      {/* Keterangan warna: mana garis ideal/target, mana garis aktual real-time */}
      <div className="chart-legend-hint">
        {lines.map(l => (
          <span key={l.dataKey} className="chart-legend-hint-item">
            <span className="chart-legend-swatch" style={{ background: l.color }} />
            {l.name} — nilai aktual (real-time)
          </span>
        ))}
        {idealLine && (
          <span className="chart-legend-hint-item">
            <span className="chart-legend-swatch chart-legend-swatch-dash" style={{ borderColor: idealLine.color || '#94a3b8' }} />
            {idealLine.label || 'Ideal'} — target/ideal
          </span>
        )}
      </div>
    </div>
  )
}