import { createContext, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (student_id, password) => {
    const data = await api.login(student_id, password)
    setToken(data.token)
    setUser(data.user)
  }

  const register = async (formData) => {
    const data = await api.register(formData)
    setToken(data.token)
    setUser(data.user)
  }

  const updateUser = (u) => setUser(u)

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
