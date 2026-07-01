import { Activity, Scissors, Wind, SlidersHorizontal, History, Bell } from 'lucide-react'

const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'pemotong',  label: 'Pemotong',  icon: Scissors },
  { id: 'pengering', label: 'Pengering', icon: Wind },
  { id: 'settings',  label: 'Pengaturan', icon: SlidersHorizontal },
  { id: 'history',   label: 'Riwayat',   icon: History },
  { id: 'alerts',    label: 'Alert',     icon: Bell },
]

export default function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">🍌</span>
        <span className="logo-text">Smart Banana System</span>
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