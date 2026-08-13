import { useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from './Avatar.jsx'

export default function EditProfile({ onClose }) {
  const { user, updateUser } = useAuth()
  const [name, setName] = useState(user.name)
  const [oldPassword, setOldPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pfp, setPfp] = useState(null)
  const [pfpPreview, setPfpPreview] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const onPfp = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPfp(file)
    setPfpPreview(URL.createObjectURL(file))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (password && password !== confirm) return setError('New passwords do not match')
    if (password && password.length < 4) return setError('New password must be at least 4 characters')
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('name', name)
      if (password) {
        fd.append('old_password', oldPassword)
        fd.append('password', password)
      }
      if (pfp) fd.append('pfp', pfp)
      const data = await api.updateMe(fd)
      updateUser(data.user)
      setSuccess('Profile updated!')
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>EDIT PROFILE</h2>
          <button className="ghost" onClick={onClose}>✕ CLOSE</button>
        </div>

        <form onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}

          <div className="pfp-picker small">
            <label className="pfp-circle" htmlFor="edit-pfp-input">
              {pfpPreview ? <img src={pfpPreview} alt="preview" /> : <Avatar user={{ ...user, pfp: user.pfp }} size={88} />}
              <span className="pfp-plus">+</span>
            </label>
            <input id="edit-pfp-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={onPfp} />
          </div>

          <div className="field">
            <label>Student ID (cannot change)</label>
            <input value={user.student_id} disabled />
          </div>
          <div className="field">
            <label>Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Current Password (needed to change password)</label>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Enter current password" />
          </div>
          <div className="field">
            <label>New Password (leave blank to keep)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" />
          </div>
          <div className="field">
            <label>Confirm New Password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter new password" />
          </div>

          <button type="submit" disabled={busy} className="btn-block">
            {busy ? 'SAVING...' : 'SAVE CHANGES'}
          </button>
        </form>
      </div>
    </div>
  )
}
