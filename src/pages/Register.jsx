import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ student_id: '', name: '', password: '', confirm: '' })
  const [pfp, setPfp] = useState(null)
  const [pfpPreview, setPfpPreview] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const onPfp = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPfp(file)
    setPfpPreview(URL.createObjectURL(file))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) return setError('Passwords do not match')
    if (form.password.length < 4) return setError('Password must be at least 4 characters')
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('student_id', form.student_id)
      fd.append('name', form.name)
      fd.append('password', form.password)
      if (pfp) fd.append('pfp', pfp)
      await register(fd)
      navigate('/home')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">REGISTER</h1>
        <p className="auth-sub">Join Class XI-A {`{L.E.G.E.N.D.S}`}</p>

        <div className="pfp-picker">
          <label className="pfp-circle" htmlFor="pfp-input">
            {pfpPreview ? <img src={pfpPreview} alt="preview" /> : <Avatar user={form.name ? { name: form.name } : null} size={96} />}
            <span className="pfp-plus">+</span>
          </label>
          <p className="muted pfp-hint">Tap to add your profile picture</p>
          <input id="pfp-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={onPfp} />
        </div>

        <form onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}
          <div className="field">
            <label>Student ID</label>
            <input name="student_id" value={form.student_id} onChange={onChange} placeholder="Your own ID (e.g. 11A-01)" required />
          </div>
          <div className="field">
            <label>Full Name</label>
            <input name="name" value={form.name} onChange={onChange} placeholder="Your name" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" value={form.password} onChange={onChange} placeholder="At least 4 characters" required />
          </div>
          <div className="field">
            <label>Confirm Password</label>
            <input name="confirm" type="password" value={form.confirm} onChange={onChange} placeholder="Re-enter password" required />
          </div>
          <button type="submit" disabled={busy} className="btn-block">
            {busy ? 'REGISTERING...' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <p className="form-note">
          Already registered? <Link to="/login">Login here</Link>
        </p>
        <p className="form-note">
          <Link to="/">← Back to home</Link>
        </p>
      </div>
    </div>
  )
}
