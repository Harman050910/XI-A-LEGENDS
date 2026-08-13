import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useEffect } from 'react'

export default function Landing() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/home', { replace: true })
  }, [user])

  return (
    <div className="landing">
      <header className="landing-top">
        <span className="landing-brand">GNMPS</span>
        <Link to="/login" className="ghost btn-login">LOGIN</Link>
      </header>

      <main className="landing-hero">
        <div className="hero-badge">CLASS XI - A</div>
        <h1 className="hero-school">GURU NANAK MISSION<br />PUBLIC SCHOOL</h1>
        <h2 className="hero-class">
          {`{L.E.G.E.N.D.S}`}
        </h2>
        <p className="hero-tag">
          Share homework. Ask for homework. Solve doubts together.
          Homework auto-deletes in 3 days. Doubts &amp; discussions live forever.
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn-register">REGISTER YOURSELF</Link>
          <Link to="/login" className="ghost btn-register ghost2">ALREADY REGISTERED? LOGIN</Link>
        </div>
      </main>

      <footer className="landing-foot">
        <p className="developed-by">Developed By <span>Harman</span></p>
      </footer>
    </div>
  )
}
