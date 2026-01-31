import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { logout } from '../api/auth_api'

interface LayoutProps {
  isLoggedIn: boolean
  userEmail: string | null
  onLogout: () => void
}

export function Layout({ isLoggedIn, userEmail, onLogout }: LayoutProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navigate = useNavigate()

  const handleLogout = async () => {
    setUserMenuOpen(false)
    try {
      await logout()
      onLogout()
      navigate('/login', { replace: true })
    } catch (e) {
      console.error('Logout failed', e)
      onLogout()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-slate-800 hover:text-slate-600">
            <span className="text-xl">ML Guru</span>
          </Link>

          <nav className="flex items-center gap-1">
            {isLoggedIn && (
              <>
                <Link
                  to="/courses"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Courses
                </Link>
                <Link
                  to="/chat"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Chat
                </Link>
                <Link
                  to="/dashboard"
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  Dashboard
                </Link>
              </>
            )}
          </nav>

          <div className="relative flex items-center gap-2">
            {isLoggedIn ? (
              <>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                >
                  <span className="hidden sm:inline">{userEmail ?? 'Account'}</span>
                  <span className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-medium">
                    {(userEmail ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                </button>
                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      aria-hidden="true"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      <Link
                        to="/profile"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Profile
                      </Link>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Log out
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <Link
                to="/login"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
