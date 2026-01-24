import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import { GuruChat } from './views/guru/GuruChat'
import { AuthForm } from './views/auth/AuthForm'
import { axiosInstance } from './config/axiosConfig'
import { Courses } from './views/courses/Courses'
import LearningSessionChat from './views/learn/LearningSessionChat'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const refreshAuth = useCallback(async () => {
    try {
      await axiosInstance.get('/auth/me')
      setIsLoggedIn(true)
    } catch {
      setIsLoggedIn(false)
    } finally {
      setAuthChecked(true)
    }
  }, [])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  // Small guard so we don't flicker routes before auth check finishes.
  if (!authChecked) {
    return (
      <div className="app">
        <h1 className="mb-4 text-left text-2xl font-bold">ML Guru</h1>
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    )
  }

  const Protected = ({ children }: { children: React.ReactNode }) => {
    if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />
    return <>{children}</>
  }

  const onAuthSuccess = async () => {
    await refreshAuth()
    navigate('/courses', { replace: true })
  }

  return (
    <div className="app">
      <h1 className="mb-4 text-left text-2xl font-bold">ML Guru</h1>
      <div className="mb-4 flex gap-2">
        <Link
          to="/chat"
          className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200"
        >
          Chat
        </Link>
        <Link
          to="/courses"
          className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-200"
        >
          Courses
        </Link>
      </div>

      <Routes>
        <Route
          path="/"
          element={<Navigate to={isLoggedIn ? '/courses' : '/login'} replace />}
        />

        <Route
          path="/login"
          element={isLoggedIn ? <Navigate to="/courses" replace /> : <AuthForm onAuthSuccess={onAuthSuccess} />}
        />

        <Route
          path="/chat"
          element={
            <Protected>
              <GuruChat />
            </Protected>
          }
        />

        <Route
          path="/courses"
          element={
            <Protected>
              <Courses />
            </Protected>
          }
        />
        <Route
          path="/courses/:courseId"
          element={
            <Protected>
              <Courses />
            </Protected>
          }
        />

        <Route
          path="/learn/:conversationId"
          element={
            <Protected>
              <LearningSessionChat />
            </Protected>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
