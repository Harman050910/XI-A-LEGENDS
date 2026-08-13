import { useEffect, useState } from 'react'
import { api } from '../api.js'
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

export default function DoubtThread({ doubtId, onClose, onUpdated, user }) {
  const [doubt, setDoubt] = useState(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .doubt(doubtId)
      .then(({ doubt }) => setDoubt(doubt))
      .catch((e) => setError(e.message))
  }, [doubtId])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!comment.trim()) return
    setBusy(true)
    try {
      await api.comment(doubtId, comment)
      setComment('')
      const { doubt: updated } = await api.doubt(doubtId)
      setDoubt(updated)
      if (onUpdated) onUpdated(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const vote = async (value) => {
    const { doubt: updated } = await api.vote(doubtId, value)
    setDoubt(updated)
    if (onUpdated) onUpdated(updated)
  }

  const toggleSave = async () => {
    const { doubt: updated } = await api.toggleSaved(doubtId)
    setDoubt(updated)
    if (onUpdated) onUpdated(updated)
  }

  if (!doubt) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          {error ? <p className="muted">{error}</p> : <p className="muted">Loading...</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal thread-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>DISCUSSION</h2>
          <button className="ghost" onClick={onClose}>✕ CLOSE</button>
        </div>

        <div className="thread-doubt">
          <div className="doubt-head">
            <Avatar user={{ name: doubt.author_name, pfp: doubt.author_pfp }} size={34} />
            <span className="doubt-author">{doubt.author_name}</span>
            <span className="muted doubt-time">· {timeAgo(doubt.created_at)}</span>
          </div>
          <h3>{doubt.title}</h3>
          <p className="thread-content">{doubt.content}</p>
          <div className="doubt-actions">
            <button className={`ghost mini ${doubt.my_vote > 0 ? 'voted-up' : ''}`} onClick={() => vote(1)}>▲ {doubt.upvotes}</button>
            <button className={`ghost mini ${doubt.my_vote < 0 ? 'voted-down' : ''}`} onClick={() => vote(-1)}>▼ {doubt.downvotes}</button>
            <button className={`ghost mini ${doubt.saved ? 'saved-active' : ''}`} onClick={toggleSave}>
              {doubt.saved ? '★ SAVED' : '☆ SAVE'}
            </button>
          </div>
        </div>

        <div className="thread-discussions">
          <h4>{doubt.discussions.length} DISCUSSION{doubt.discussions.length !== 1 ? 'S' : ''}</h4>
          {doubt.discussions.length === 0 && <p className="muted">No replies yet. Start the discussion!</p>}
          {doubt.discussions.map((c) => (
            <div key={c.id} className="discussion-item">
              <Avatar user={{ name: c.author_name, pfp: c.author_pfp }} size={30} />
              <div className="discussion-body">
                <div className="discussion-head">
                  <span className="doubt-author">{c.author_name}</span>
                  <span className="muted doubt-time">· {timeAgo(c.created_at)}</span>
                </div>
                <p>{c.content}</p>
              </div>
            </div>
          ))}
        </div>

        <form className="comment-form" onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}
          <div className="comment-row">
            <Avatar user={user} size={32} />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add to the discussion..."
              rows={2}
            />
          </div>
          <div className="comment-submit">
            <button type="submit" disabled={busy || !comment.trim()}>{busy ? 'POSTING...' : 'REPLY'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
