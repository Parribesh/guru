import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loginRequestSchema, registerRequestSchema, type AuthFormData } from '../../schemas/authSchemas'
import { login, register } from '../../api/auth_api'

interface LoginPageProps {
  onAuthSuccess: () => void
}

export function LoginPage({ onAuthSuccess }: LoginPageProps) {
  const [form, setForm] = useState<AuthFormData>({
    email: '',
    password: '',
    confirm_password: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isLogin, setIsLogin] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    try {
      setIsLoading(true)
      if (isLogin) {
        const data = loginRequestSchema.parse({ email: form.email, password: form.password })
        await login(data)
      } else {
        const data = registerRequestSchema.parse(form)
        await register(data)
      }
      onAuthSuccess()
      navigate('/courses', { replace: true })
    } catch (err: unknown) {
      setIsLoading(false)
      const e = err as { response?: { data?: { detail?: string } }; message?: string }
      setError(e?.response?.data?.detail ?? e?.message ?? 'Something went wrong')
    }
  }

  const toggleMode = () => {
    setIsLogin(!isLogin)
    setError(null)
    setForm({ email: '', password: '', confirm_password: '' })
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-slate-800">
              {isLogin ? 'Welcome back' : 'Create an account'}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {isLogin ? 'Sign in to continue to ML Guru' : 'Register to get started'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {!isLogin && (
              <div>
                <label htmlFor="confirm_password" className="block text-sm font-medium text-slate-700">
                  Confirm password
                </label>
                <input
                  id="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.confirm_password ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              {isLoading ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={toggleMode}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link to="/" className="hover:text-slate-700">Back to home</Link>
        </p>
      </div>
    </div>
  )
}
