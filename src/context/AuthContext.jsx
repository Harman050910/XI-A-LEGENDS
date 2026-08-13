import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { api } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      if (data.session) {
        try {
          const { user } = await api.me()
          if (active) setUser(user)
        } catch (e) {
          await supabase.auth.signOut()
        }
      }
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && !session) setUser(null)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const login = async (student_id, password) => {
    const data = await api.login(student_id, password)
    setUser(data.user)
    return data
  }

  const register = async (formData) => {
    const data = await api.register(formData)
    setUser(data.user)
    return data
  }

  const updateUser = (u) => setUser(u)

  const logout = async () => {
    await supabase.auth.signOut()
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
