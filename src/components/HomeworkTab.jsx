import { useCallback, useEffect, useState } from 'react'
import { api, downloadHomework } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from './Avatar.jsx'

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

function daysLeft(iso) {
  const diff = new Date(iso).getTime() + 3 * 24 * 60 * 60 * 1000 - Date.now()
  const d = Math.ceil(diff / (24 * 60 * 60 * 1000))
  return d
}

export default function HomeworkTab() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ type: 'share', subject: '', title: '', description: '' })
  const [file, setFile] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await api.homework()
      setItems(data.homework)
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
      const fd = new FormData()
      fd.append('type', form.type)
      fd.append('subject', form.subject)
      fd.append('title', form.title)
      fd.append('description', form.description)
      if (file) fd.append('file', file)
      await api.createHomework(fd)
      setForm({ type: 'share', subject: '', title: '', description: '' })
      setFile(null)
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const del = async (id) => {
    if (!confirm('Delete this homework?')) return
    try {
      await api.deleteHomework(id)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  const visible = items.filter((h) => filter === 'all' || h.type === filter)

  return (
    <div className="tab-content">
      <div className="hw-toolbar">
        <div>
          <button onClick={() => setShowForm(!showForm)}>{showForm ? 'CLOSE FORM' : '+ POST HOMEWORK'}</button>
        </div>
        <div className="filter-group">
          {['all', 'share', 'ask'].map((f) => (
            <button key={f} className={`ghost filter-btn ${filter === f ? 'filter-active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'ALL' : f === 'share' ? 'SHARED' : 'ASKED'}
            </button>
          ))}
        </div>
      </div>

      <p className="hw-note muted">⏳ Homework automatically deletes after 3 days</p>

      {showForm && (
        <form className="hw-form" onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}
          <div className="form-row">
            <div className="field">
              <label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="share">Share homework</option>
                <option value="ask">Ask for homework</option>
              </select>
            </div>
            <div className="field">
              <label>Subject</label>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Physics, Chemistry..." />
            </div>
          </div>
          <div className="field">
            <label>Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What homework is this?" required />
          </div>
          <div className="field">
            <label>Details</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the homework, pages, questions..." />
          </div>
          <div className="field">
            <label>Attach file (photo / pdf)</label>
            <input type="file" onChange={(e) => setFile(e.target.files[0])} />
          </div>
          <button type="submit" disabled={busy}>{busy ? 'POSTING...' : 'POST HOMEWORK'}</button>
        </form>
      )}

      {loading ? (
        <p className="muted empty">Loading homework...</p>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <p>No homework here yet.</p>
          <p className="muted">Be the first to share or ask!</p>
        </div>
      ) : (
        <div className="hw-list">
          {visible.map((h) => (
            <div key={h.id} className="hw-card">
              <div className="hw-card-top">
                <Avatar user={{ name: h.author_name, pfp: h.author_pfp }} size={38} />
                <div className="hw-meta">
                  <span className="hw-author">{h.author_name}</span>
                  <span className="muted hw-time">{timeAgo(h.created_at)} · deletes in {daysLeft(h.created_at)}d</span>
                </div>
                <span className={`badge ${h.type}`}>{h.type === 'share' ? 'SHARED' : 'ASKED'}</span>
              </div>
              <div className="hw-body">
                {h.subject && <span className="badge subject-badge">{h.subject}</span>}
                <h3 className="hw-title">{h.title}</h3>
                {h.description && <p className="hw-desc">{h.description}</p>}
              </div>
              <div className="hw-card-actions">
                {h.file && (
                  <button onClick={() => downloadHomework(h.id, h.original_name)}>⬇ DOWNLOAD</button>
                )}
                {h.type === 'ask' && h.file && <span className="muted hw-solved-note">attached a file to their ask</span>}
                {user && h.author_id === user.id && (
                  <button className="danger" onClick={() => del(h.id)}>DELETE</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
