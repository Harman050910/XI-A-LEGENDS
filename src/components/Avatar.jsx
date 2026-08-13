export default function Avatar({ user, size = 36 }) {
  if (user && user.pfp) {
    return <img className="avatar" src={user.pfp} alt={user.name || 'avatar'} style={{ width: size, height: size }} />
  }
  const initials = (user && user.name ? user.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2) : '?').toUpperCase()
  return <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials}</div>
}
