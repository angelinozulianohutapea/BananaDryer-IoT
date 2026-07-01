import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceArea, ResponsiveContainer } from 'recharts'

// Chart suhu/kelembaban dengan area hijau transparan sebagai band "ideal"
// data: [{ time, value }], idealMin/idealMax: batas band ideal
export default function ChartWithIdealBand({ data, dataKey, name, color, unit, idealMin, idealMax, domain }) {
  if (!data || data.length === 0) {
    return <div className="chart-empty">Menunggu data dari sensor...</div>
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <XAxis dataKey="time" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} domain={domain || ['auto', 'auto']} />
        <Tooltip formatter={(v) => [`${v}${unit}`, name]} />
        <Legend />
        {idealMin !== undefined && idealMax !== undefined && (
          <ReferenceArea
            y1={idealMin} y2={idealMax}
            fill="#10b981" fillOpacity={0.12}
            stroke="#10b981" strokeOpacity={0.3} strokeDasharray="4 4"
            label={{ value: 'Ideal', position: 'insideTopLeft', fontSize: 11, fill: '#0d9468' }}
          />
        )}
        <Line type="monotone" dataKey={dataKey} name={name} stroke={color} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}