import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getMe, logout, type UserInfo } from '../api/auth_api'

interface AuthContextType {
  user: UserInfo | null
  isLoggedIn: boolean
  isAdmin: boolean
  loading: boolean
  refreshAuth: () => Promise<void>
  logoutUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const refreshAuth = useCallback(async () => {
    try {
      const userInfo = await getMe()
      setUser(userInfo)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const logoutUser = useCallback(async () => {
    try {
      await logout()
    } catch (e) {
      console.error('Logout error', e)
    } finally {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  const value: AuthContextType = {
    user,
    isLoggedIn: Boolean(user),
    isAdmin: Boolean(user?.is_admin || user?.role === 'admin'),
    loading,
    refreshAuth,
    logoutUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
