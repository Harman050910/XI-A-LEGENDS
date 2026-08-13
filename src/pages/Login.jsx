import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ student_id: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(form.student_id, form.password)
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
        <h1 className="auth-title">LOGIN</h1>
        <p className="auth-sub">Welcome back, Legend</p>

        <form onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}
          <div className="field">
            <label>Student ID</label>
            <input name="student_id" value={form.student_id} onChange={onChange} placeholder="Your student ID" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" value={form.password} onChange={onChange} placeholder="Your password" required />
          </div>
          <button type="submit" disabled={busy} className="btn-block">
            {busy ? 'LOGGING IN...' : 'LOGIN'}
          </button>
        </form>

        <p className="form-note">
          New here? <Link to="/register">Register yourself</Link>
        </p>
        <p className="form-note">
          <Link to="/">← Back to home</Link>
        </p>
      </div>
    </div>
  )
}
