import { Activity, History, Bell } from 'lucide-react'

const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'history',   label: 'Riwayat',   icon: History },
  { id: 'alerts',    label: 'Alert',      icon: Bell },
]

export default function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">🍌</span>
        <span className="logo-text">BananaDryer</span>
      </div>
      <nav className="sidebar-nav">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${page === id ? 'active' : ''}`}
            onClick={() => setPage(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
