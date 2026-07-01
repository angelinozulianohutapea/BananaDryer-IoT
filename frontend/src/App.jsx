import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Alerts from './pages/Alerts'
import Sidebar from './components/Sidebar'

export default function App() {
  const [page, setPage] = useState('dashboard')

  return (
    <div className="app-layout">
      <Sidebar page={page} setPage={setPage} />
      <main className="main-content">
        {page === 'dashboard' && <Dashboard />}
        {page === 'history'   && <History />}
        {page === 'alerts'    && <Alerts />}
      </main>
    </div>
  )
}
