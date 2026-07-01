import { useRef, useState, useEffect } from 'react'

// Chart suhu/kelembaban dibangun pakai SVG murni (bukan recharts) — sama seperti
// DualLineChart di halaman Pemotong — supaya sumbu, angka, pita "ideal", dan kurva
// referensi 1 siklus PASTI kelihatan dari awal, gak gantung ke behavior
// ResponsiveContainer recharts yang suka gagal ngukur lebar pas ditaruh di CSS Grid.
//
// Lebar SVG diukur langsung dari elemen pembungkus pakai ResizeObserver (bukan di-scale
// lewat viewBox/CSS), jadi selalu pas memenuhi lebar card tanpa ruang kosong kiri-kanan,
// tanpa bikin tinggi ikut membengkak, dan teks/lingkaran gak gepeng/distorsi.
//
// Props:
// data: [{ time, [dataKey]: number, pct?: number }] — pct = posisi progres siklus (0-100%),
//        dipakai supaya garis data real sejajar sumbu-X dengan idealCurve. Kalau pct gak ada
//        (misal belum drying), titik disebar rata seperti biasa.
// dataKey, name, color, unit — sama seperti sebelumnya.
// idealMin/idealMax — batas pita target (band hijau transparan), opsional.
// idealCurve: [{ pct, value }] — kurva referensi "1 siklus ideal" (garis putus-putus oranye),
//        selalu tampil dari awal walau belum ada data real, dibangun dari setpoint di Pengaturan.
// domain — [yMin, yMax] skala sumbu-Y.
export default function ChartWithIdealBand({ data, dataKey, name, color, unit, idealMin, idealMax, domain, ticks, idealCurve }) {
  const containerRef = useRef(null)
  const [measuredWidth, setMeasuredWidth] = useState(600)

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width
      if (w) setMeasuredWidth(Math.max(280, Math.round(w)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const hasData = data && data.length > 0
  const points  = hasData ? data : []

  const yDomain = domain || [0, 100]
  const [yMin, yMax] = yDomain

  // Kalau ticks gak dikasih, bikin otomatis 5 titik merata dari domain (dibulatkan biar rapi)
  const yTicks = ticks || (() => {
    const step = (yMax - yMin) / 4
    return Array.from({ length: 5 }, (_, i) => Math.round(yMin + step * i))
  })()

  // W = lebar asli card (piksel), H = tinggi tetap (gak ikut membengkak walau card lebar)
  const W = measuredWidth, H = 220
  const padL = 46, padR = 16, padT = 14, padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
  const yPixel = (v) => padT + plotH * (1 - (clamp(v, yMin, yMax) - yMin) / (yMax - yMin))
  const xPixel = (i, n) => n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW
  const xForPct = (pct) => padL + (clamp(pct, 0, 100) / 100) * plotW

  const n = points.length
  // Posisi X tiap titik data real: pakai pct (sejajar dengan kurva ideal) kalau ada,
  // kalau enggak (belum drying / belum ada estimasi durasi) sebar rata seperti biasa.
  const xForPoint = (p, i) => (p.pct !== undefined && p.pct !== null) ? xForPct(p.pct) : xPixel(i, n)

  // Biar label waktu di sumbu-X gak numpuk kalau titik data banyak, tampilin sebagian aja
  const labelStep = n > 6 ? Math.ceil(n / 6) : 1

  const hasBand = idealMin !== undefined && idealMax !== undefined && idealMin !== null && idealMax !== null
  // Clamp band biar gak keluar dari area plot kalau idealMin/idealMax di luar domain
  const bandTop = hasBand ? clamp(idealMax, yMin, yMax) : null
  const bandBottom = hasBand ? clamp(idealMin, yMin, yMax) : null

  const hasCurve = idealCurve && idealCurve.length > 0
  const curvePath = hasCurve
    ? idealCurve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForPct(p.pct)} ${yPixel(p.value)}`).join(' ')
    : ''

  const path = hasData
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForPoint(p, i)} ${yPixel(p[dataKey] ?? 0)}`).join(' ')
    : ''
  const lastX = hasData ? xForPoint(points[n - 1], n - 1) : 0
  const lastY = hasData ? yPixel(points[n - 1][dataKey] ?? 0) : 0

  return (
    <div ref={containerRef} style={{ width: '100%', minWidth: 0 }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Grid horizontal + label angka sumbu-Y */}
        {yTicks.map(t => (
          <g key={t}>
            <line x1={padL} y1={yPixel(t)} x2={W - padR} y2={yPixel(t)} stroke="#eef1f6" strokeWidth="1" />
            <text x={padL - 8} y={yPixel(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#94a3b8">
              {t}
            </text>
          </g>
        ))}

        {/* Pita area "ideal" (rentang target) — selalu tampil, walau belum ada data real */}
        {hasBand && (
          <>
            <rect
              x={padL} y={yPixel(bandTop)}
              width={plotW} height={Math.max(yPixel(bandBottom) - yPixel(bandTop), 0)}
              fill="#10b981" fillOpacity="0.10"
            />
            <line x1={padL} y1={yPixel(bandTop)} x2={W - padR} y2={yPixel(bandTop)} stroke="#10b981" strokeWidth="1.5" strokeDasharray="5 4" strokeOpacity="0.5" />
            <line x1={padL} y1={yPixel(bandBottom)} x2={W - padR} y2={yPixel(bandBottom)} stroke="#10b981" strokeWidth="1.5" strokeDasharray="5 4" strokeOpacity="0.5" />
          </>
        )}

        {/* Kurva referensi "1 siklus ideal" — bentuk lengkap dari awal sampai akhir siklus,
            selalu tampil dari awal (sebelum ada data real sekalipun) */}
        {hasCurve && (
          <>
            <path d={curvePath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
            <text x={W - padR} y={yPixel(idealCurve[idealCurve.length - 1].value) - 8} textAnchor="end" fontSize="11" fontWeight="600" fill="#b45309">
              Kurva ideal 1 siklus
            </text>
          </>
        )}

        {/* Sumbu X & Y (garis tepi plot) */}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#cbd5e1" strokeWidth="1.5" />
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#cbd5e1" strokeWidth="1.5" />

        {/* Garis data aktual (real-time) — cuma tergambar kalau sudah ada data */}
        {hasData && (
          <g>
            <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lastX} cy={lastY} r="4" fill={color} />
          </g>
        )}

        {/* Label sumbu-X */}
        {hasData ? points.map((p, i) => (
          i % labelStep === 0 && (
            <text key={i} x={xForPoint(p, i)} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#94a3b8">
              {p.time}
            </text>
          )
        )) : (
          <>
            <text x={padL} y={H - padB + 16} textAnchor="start" fontSize="10" fill="#cbd5e1">Mulai siklus</text>
            <text x={W - padR} y={H - padB + 16} textAnchor="end" fontSize="10" fill="#cbd5e1">Selesai siklus</text>
            <text x={padL + plotW / 2} y={padT + plotH / 2 + 20} textAnchor="middle" fontSize="11" fill="#94a3b8">
              Menunggu data sensor...
            </text>
          </>
        )}
      </svg>

      {/* Keterangan warna: mana garis aktual, mana pita target, mana kurva ideal siklus */}
      <div className="chart-legend-hint">
        <span className="chart-legend-hint-item">
          <span className="chart-legend-swatch" style={{ background: color }} />
          {name} — nilai aktual (real-time){unit ? ` (${unit})` : ''}
        </span>
        {hasCurve && (
          <span className="chart-legend-hint-item">
            <span className="chart-legend-swatch chart-legend-swatch-dash" style={{ borderColor: '#f59e0b' }} />
            Kurva ideal — perkiraan bentuk 1 siklus penuh
          </span>
        )}
        {hasBand && (
          <span className="chart-legend-hint-item">
            <span className="chart-legend-swatch" style={{ background: '#10b981', opacity: 0.5 }} />
            Area hijau — rentang target
          </span>
        )}
      </div>
    </div>
  )
}