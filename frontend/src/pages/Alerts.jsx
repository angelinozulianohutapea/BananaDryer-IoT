import { useEffect, useState } from 'react'
import { getAlerts, acknowledgeAlert, acknowledgeAll } from '../hooks/api'
import useSocket from '../hooks/useSocket'

export default function Alerts() {
  const [alerts, setAlerts]   = useState([])
  const [loading, setLoading] = useState(true)
  const { alerts: newAlerts } = useSocket()

  useEffect(() => {
    getAlerts()
      .then(r => setAlerts(r.data?.data || []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false))
  }, [])

  // Merge alert realtime
  useEffect(() => {
    if (newAlerts.length > 0) {
      setAlerts(prev => {
        const ids = new Set(prev.map(a => a.id))
        const incoming = newAlerts.filter(a => !ids.has(a.id))
        return [...incoming, ...prev]
      })
    }
  }, [newAlerts])

  const ack = async (id) => {
    await acknowledgeAlert(id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: 1 } : a))
  }

  const ackAll = async () => {
    await acknowledgeAll()
    setAlerts(prev => prev.map(a => ({ ...a, acknowledged: 1 })))
  }

  const fmt = (iso) => iso ? new Date(iso).toLocaleString('id-ID') : '-'
  const unread = alerts.filter(a => !a.acknowledged).length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Alert</h1>
          <p className="page-subtitle">{unread} belum dibaca</p>
        </div>
        {unread > 0 && (
          <button className="btn btn-yellow" onClick={ackAll}>Tandai Semua Dibaca</button>
        )}
      </div>

      {loading
        ? <div className="loading">Memuat alert...</div>
        : alerts.length === 0
          ? <div className="empty">Tidak ada alert.</div>
          : <div className="alert-list">
              {alerts.map((a, i) => (
                <div key={a.id || i} className={`alert-item ${a.acknowledged ? 'ack' : ''}`}>
                  <div className="alert-meta">
                    <span className={`badge badge-${a.type?.toLowerCase().replace('_','-') || 'info'}`}>{a.type}</span>
                    <span className="alert-time">{fmt(a.created_at || a.ts)}</span>
                  </div>
                  <div className="alert-msg">{a.message}</div>
                  {!a.acknowledged && (
                    <button className="btn-ack" onClick={() => ack(a.id)}>✓ Tandai Dibaca</button>
                  )}
                </div>
              ))}
            </div>
      }
    </div>
  )
}
