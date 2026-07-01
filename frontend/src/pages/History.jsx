import React, { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { getSessions, getSessionSensor } from '../hooks/api'

export default function History() {
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [detailData, setDetailData] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    getSessions()
      .then(r => setSessions(r.data?.data || []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [])

  const fmt = (iso) => iso ? new Date(iso).toLocaleString('id-ID') : '-'
  const dur = (sec) => sec ? `${Math.floor(sec / 60)}m ${sec % 60}s` : '-'
  const temp = (v) => (v !== null && v !== undefined) ? `${v}°C` : '-'

  const toggleRow = async (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      setDetailData([])
      return
    }
    setExpandedId(id)
    setDetailLoading(true)
    try {
      const r = await getSessionSensor(id)
      const rows = (r.data?.data || []).map(row => ({
        time: new Date(row.recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        temp: row.temperature,
        hum:  row.humidity,
      }))
      setDetailData(rows)
    } catch {
      setDetailData([])
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Riwayat Sesi</h1>
          <p className="page-subtitle">Log pengeringan pisang</p>
        </div>
      </div>

      {loading
        ? <div className="loading">Memuat data...</div>
        : sessions.length === 0
          ? <div className="empty">Belum ada sesi tercatat.</div>
          : <div className="card table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>#</th>
                    <th>Mulai</th>
                    <th>Selesai</th>
                    <th>Durasi</th>
                    <th>Siklus</th>
                    <th>Temp Avg</th>
                    <th>Temp Max</th>
                    <th>Temp Min</th>
                    <th>Hasil</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <React.Fragment key={s.id}>
                      <tr
                        className="data-row-clickable"
                        onClick={() => toggleRow(s.id)}
                      >
                        <td className="expand-cell">
                          {expandedId === s.id ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                        </td>
                        <td>{i + 1}</td>
                        <td>{fmt(s.started_at)}</td>
                        <td>{fmt(s.finished_at)}</td>
                        <td>{dur(s.duration_sec)}</td>
                        <td>{s.cycles_done ?? '-'}/{s.cycles_total ?? '-'}</td>
                        <td>{temp(s.temp_avg)}</td>
                        <td>{temp(s.temp_max)}</td>
                        <td>{temp(s.temp_min)}</td>
                        <td>
                          <span className={`badge badge-${s.result?.toLowerCase() || 'stopped'}`}>
                            {s.result || 'STOPPED'}
                          </span>
                        </td>
                      </tr>
                      {expandedId === s.id && (
                        <tr className="detail-row">
                          <td colSpan={10}>
                            <div className="session-detail">
                              {detailLoading
                                ? <div className="loading">Memuat grafik sesi...</div>
                                : detailData.length === 0
                                  ? <div className="empty">Tidak ada data sensor untuk sesi ini.</div>
                                  : <ResponsiveContainer width="100%" height={220}>
                                      <LineChart data={detailData}>
                                        <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Legend />
                                        <Line type="monotone" dataKey="temp" name="Suhu (°C)" stroke="#ef4444" dot={false} strokeWidth={2} />
                                        <Line type="monotone" dataKey="hum"  name="Kelembaban (%)" stroke="#3b82f6" dot={false} strokeWidth={2} />
                                      </LineChart>
                                    </ResponsiveContainer>
                              }
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
      }
    </div>
  )
}