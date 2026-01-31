import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { Layout } from './components/Layout'
import { GuruChat } from './views/guru/GuruChat'
import { LoginPage } from './views/auth/LoginPage'
import { getMe } from './api/auth_api'
import { Courses } from './views/courses/Courses'
import LearningSessionChat from './views/learn/LearningSessionChat'
import { AgentDashboard } from './views/dashboard/AgentDashboard'
import { ProfilePage } from './views/profile/ProfilePage'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const refreshAuth = useCallback(async () => {
    try {
      const user = await getMe()
      setIsLoggedIn(true)
      setUserEmail(user.email)
    } catch {
      setIsLoggedIn(false)
      setUserEmail(null)
    } finally {
      setAuthChecked(true)
    }
  }, [])

  useEffect(() => {
    refreshAuth()
  }, [refreshAuth])

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-600">Loading…</p>
        </div>
      </div>
    )
  }

  const Protected = ({ children }: { children: React.ReactNode }) => {
    if (!isLoggedIn) return <Navigate to="/login" replace />
    return <>{children}</>
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout
            isLoggedIn={isLoggedIn}
            userEmail={userEmail}
            onLogout={() => {
              setIsLoggedIn(false)
              setUserEmail(null)
            }}
          />
        }
      >
        <Route index element={<Navigate to={isLoggedIn ? '/courses' : '/login'} replace />} />

        <Route
          path="login"
          element={
            isLoggedIn ? (
              <Navigate to="/courses" replace />
            ) : (
              <LoginPage onAuthSuccess={refreshAuth} />
            )
          }
        />

        <Route
          path="courses"
          element={
            <Protected>
              <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                <Courses />
              </div>
            </Protected>
          }
        />
        <Route
          path="courses/:courseId"
          element={
            <Protected>
              <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                <Courses />
              </div>
            </Protected>
          }
        />

        <Route
          path="chat"
          element={
            <Protected>
              <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                <GuruChat />
              </div>
            </Protected>
          }
        />

        <Route
          path="learn/:conversationId"
          element={
            <Protected>
              <LearningSessionChat />
            </Protected>
          }
        />

        <Route
          path="dashboard"
          element={
            <Protected>
              <AgentDashboard />
            </Protected>
          }
        />
        <Route
          path="dashboard/syllabus-run/:runId"
          element={
            <Protected>
              <AgentDashboard />
            </Protected>
          }
        />
        <Route
          path="dashboard/:sessionId"
          element={
            <Protected>
              <AgentDashboard />
            </Protected>
          }
        />

        <Route
          path="profile"
          element={
            <Protected>
              <ProfilePage />
            </Protected>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
