import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'
import HomeworkTab from '../components/HomeworkTab.jsx'
import DoubtsTab from '../components/DoubtsTab.jsx'

export default function Home() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('homework')

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="ghost dash-btn" onClick={() => navigate('/dashboard')}>
          <span className="dash-icon">▦</span> DASHBOARD
        </button>

        <nav className="tabs">
          <button className={tab === 'homework' ? 'tab active' : 'tab'} onClick={() => setTab('homework')}>
            HOMEWORK
          </button>
          <button className={tab === 'doubt' ? 'tab active' : 'tab'} onClick={() => setTab('doubt')}>
            DOUBT
          </button>
        </nav>

        <div className="user-chip">
          <Avatar user={user} size={34} />
          <div className="user-chip-info">
            <span className="user-chip-name">{user.name}</span>
            <span className="user-chip-id">{user.student_id}</span>
          </div>
          <button className="ghost logout-btn" onClick={logout}>LOGOUT</button>
        </div>
      </header>

      <main className="content">
        {tab === 'homework' ? <HomeworkTab /> : <DoubtsTab />}
      </main>
    </div>
  )
}
