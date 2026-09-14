import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { Layout } from './components/Layout'
import { GuruChat } from './views/guru/GuruChat'
import { LoginPage } from './views/auth/LoginPage'
import { Courses } from './views/courses/Courses'
import { CourseSettings } from './views/courses/CourseSettings'
import LearningSessionChat from './views/learn/LearningSessionChat'
import { AgentDashboard } from './views/dashboard/AgentDashboard'
import { ProfilePage } from './views/profile/ProfilePage'
import { AuthProvider, useAuth } from './context/AuthContext'

function AppRoutes() {
  const { isLoggedIn, loading, refreshAuth } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mb-3" />
          <p className="text-xs font-semibold text-slate-500">Loading ML Guru…</p>
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
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to={isLoggedIn ? '/courses' : '/login'} replace />} />

        <Route
          path="login"
          element={isLoggedIn ? <Navigate to="/courses" replace /> : <LoginPage onAuthSuccess={refreshAuth} />}
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
          path="courses/:courseId/settings"
          element={
            <Protected>
              <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
                <CourseSettings />
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

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
