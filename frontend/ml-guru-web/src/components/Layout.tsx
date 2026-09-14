import { useState } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface LayoutProps {
  isLoggedIn?: boolean
  userEmail?: string | null
  onLogout?: () => void
}

export function Layout({ isLoggedIn: propIsLoggedIn, userEmail: propUserEmail, onLogout: propOnLogout }: LayoutProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoggedIn: authIsLoggedIn, isAdmin, logoutUser } = useAuth()

  const isLoggedIn = propIsLoggedIn ?? authIsLoggedIn
  const userEmail = propUserEmail ?? user?.email ?? null

  const handleLogout = async () => {
    setUserMenuOpen(false)
    try {
      if (propOnLogout) {
        propOnLogout()
      } else {
        await logoutUser()
      }
      navigate('/login', { replace: true })
    } catch (e) {
      console.error('Logout failed', e)
      navigate('/login', { replace: true })
    }
  }

  const navLinks = [
    { to: '/courses', label: 'Courses' },
    { to: '/chat', label: 'Chat' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/profile', label: 'Profile' },
  ]

  const isLinkActive = (path: string) => {
    if (path === '/courses') {
      return location.pathname === '/courses' || location.pathname.startsWith('/courses/')
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5 font-bold text-slate-900 hover:text-indigo-600 transition">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-black text-base shadow-sm">
                ML
              </span>
              <span className="text-lg tracking-tight">Guru</span>
            </Link>

            {isLoggedIn && (
              <nav className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => {
                  const active = isLinkActive(link.to)
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'bg-slate-100 text-indigo-600 font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {link.label}
                    </Link>
                  )
                })}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                {isAdmin && (
                  <Link
                    to="/dashboard"
                    className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-700 border border-purple-200 hover:bg-purple-100 transition shadow-xs"
                    title="System Administrator Access"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-600 animate-pulse"></span>
                    Admin Console
                  </Link>
                )}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((o) => !o)}
                    className="flex items-center gap-2 rounded-lg p-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="true"
                  >
                    <span className="hidden sm:inline max-w-[160px] truncate text-slate-800">
                      {userEmail ?? 'Account'}
                    </span>
                    <span className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shadow-xs">
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
                      <div className="absolute right-0 top-full z-20 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
                        <div className="border-b border-slate-100 px-4 py-2">
                          <div className="text-xs font-semibold text-slate-900 truncate">{userEmail}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                                isAdmin
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {isAdmin ? 'ADMINISTRATOR' : 'STUDENT'}
                            </span>
                          </div>
                        </div>

                        <Link
                          to="/profile"
                          className="block px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          Profile & Preferences
                        </Link>

                        {isAdmin && (
                          <Link
                            to="/dashboard"
                            className="block px-4 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 transition"
                            onClick={() => setUserMenuOpen(false)}
                          >
                            Admin Asset Management
                          </Link>
                        )}

                        <div className="my-1 border-t border-slate-100" />

                        <button
                          type="button"
                          onClick={handleLogout}
                          className="block w-full px-4 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
                        >
                          Log out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <Link
                to="/login"
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm transition"
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
