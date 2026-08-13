import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from './Avatar.jsx'
import DoubtThread from './DoubtThread.jsx'

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

export default function DoubtsTab() {
  const { user } = useAuth()
  const [doubts, setDoubts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await api.doubts()
      setDoubts(data.doubts)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api.createDoubt(form.title, form.content)
      setForm({ title: '', content: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const vote = async (d, value) => {
    const data = await api.vote(d.id, value)
    setDoubts((list) => list.map((x) => (x.id === d.id ? data.doubt : x)))
  }

  const toggleSave = async (d) => {
    const data = await api.toggleSaved(d.id)
    setDoubts((list) => list.map((x) => (x.id === d.id ? data.doubt : x)))
  }

  return (
    <div className="tab-content">
      <div className="hw-toolbar">
        <button onClick={() => setShowForm(!showForm)}>{showForm ? 'CLOSE FORM' : '+ POST A DOUBT'}</button>
        <span className="muted reddit-note">♾ Doubts &amp; discussions stay forever</span>
      </div>

      {showForm && (
        <form className="hw-form" onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}
          <div className="field">
            <label>Doubt title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Short question..." required />
          </div>
          <div className="field">
            <label>Explain your doubt</label>
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Full details of what you don't understand..." required />
          </div>
          <button type="submit" disabled={busy}>{busy ? 'POSTING...' : 'POST DOUBT'}</button>
        </form>
      )}

      {loading ? (
        <p className="muted empty">Loading doubts...</p>
      ) : doubts.length === 0 ? (
        <div className="empty-state">
          <p>No doubts yet.</p>
          <p className="muted">Ask the first question!</p>
        </div>
      ) : (
        <div className="doubt-list">
          {doubts.map((d) => (
            <div key={d.id} className="doubt-card">
              <div className="doubt-votes">
                <button className={`vote-btn ${d.my_vote > 0 ? 'voted-up' : ''}`} onClick={() => vote(d, 1)}>▲</button>
                <span className="vote-count">{d.upvotes - d.downvotes}</span>
                <button className={`vote-btn ${d.my_vote < 0 ? 'voted-down' : ''}`} onClick={() => vote(d, -1)}>▼</button>
              </div>
              <div className="doubt-main">
                <div className="doubt-head">
                  <Avatar user={{ name: d.author_name, pfp: d.author_pfp }} size={30} />
                  <span className="doubt-author">{d.author_name}</span>
                  <span className="muted doubt-time">· {timeAgo(d.created_at)}</span>
                </div>
                <h3 className="doubt-title" onClick={() => setOpen(d)}>{d.title}</h3>
                <p className="doubt-preview" onClick={() => setOpen(d)}>{d.content}</p>
                <div className="doubt-actions">
                  <button className="ghost mini" onClick={() => setOpen(d)}>💬 {d.discussions.length} DISCUSSION{d.discussions.length !== 1 ? 'S' : ''}</button>
                  <button className={`ghost mini ${d.saved ? 'saved-active' : ''}`} onClick={() => toggleSave(d)}>
                    {d.saved ? '★ SAVED' : '☆ SAVE'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <DoubtThread
          doubtId={open.id}
          onClose={() => setOpen(null)}
          onUpdated={(updated) => {
            setDoubts((list) => list.map((x) => (x.id === updated.id ? updated : x)))
            setOpen(null)
          }}
          user={user}
        />
      )}
    </div>
  )
}
