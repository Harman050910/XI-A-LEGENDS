import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'
import DoubtThread from '../components/DoubtThread.jsx'
import EditProfile from '../components/EditProfile.jsx'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [saved, setSaved] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api.saved()
      setSaved(data.saved)
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (d) => {
    await api.toggleSaved(d.id)
    load()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="ghost dash-btn active-dash" onClick={() => navigate('/home')}>
          <span className="dash-icon">◀</span> BACK TO HOME
        </button>
        <h1 className="dash-title">MY DASHBOARD</h1>
        <div className="user-chip">
          <Avatar user={user} size={34} />
          <div className="user-chip-info">
            <span className="user-chip-name">{user.name}</span>
            <span className="user-chip-id">{user.student_id}</span>
          </div>
        </div>
      </header>

      <main className="content">
        <h2 className="dash-section-title">★ SAVED DISCUSSIONS</h2>
        <p className="muted dash-sub">All the doubts and discussions you saved, easy to find again.</p>

        {loading ? (
          <p className="muted empty">Loading...</p>
        ) : saved.length === 0 ? (
          <div className="empty-state">
            <p>You haven't saved any discussions yet.</p>
            <p className="muted">Open any doubt and press "☆ SAVE" to keep it here.</p>
            <button onClick={() => navigate('/home')}>GO TO DOUBTS</button>
          </div>
        ) : (
          <div className="saved-list">
            {saved.map((d) => (
              <div key={d.id} className="saved-card">
                <div className="doubt-head">
                  <Avatar user={{ name: d.author_name, pfp: d.author_pfp }} size={30} />
                  <span className="doubt-author">{d.author_name}</span>
                  <span className="muted doubt-time">· saved {timeAgo(d.created_at)}</span>
                </div>
                <h3 className="doubt-title" onClick={() => setOpen(d)}>{d.title}</h3>
                <p className="doubt-preview" onClick={() => setOpen(d)}>{d.content}</p>
                <div className="doubt-actions">
                  <button className="ghost mini" onClick={() => setOpen(d)}>💬 {d.discussions.length} DISCUSSION{d.discussions.length !== 1 ? 'S' : ''}</button>
                  <button className="ghost mini" onClick={() => remove(d)}>★ REMOVE</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="dash-footer">
        <button className="ghost edit-profile-btn" onClick={() => setEditing(true)}>
          ⚙ EDIT PROFILE
        </button>
      </footer>

      {open && (
        <DoubtThread
          doubtId={open.id}
          onClose={() => setOpen(null)}
          onUpdated={(updated) => {
            setSaved((list) => list.map((x) => (x.id === updated.id ? updated : x)))
            setOpen(null)
          }}
          user={user}
        />
      )}

      {editing && <EditProfile onClose={() => setEditing(false)} />}
    </div>
  )
}
