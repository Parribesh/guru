import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getMe,
  updateUserPreferences,
  updateUserEmail,
  updateUserPassword,
  type UserInfo,
} from '../../api/auth_api'
import { getOllamaModels, type OllamaModelItem } from '../../api/ollama_api'
import { get_user_progress, type UserProgressCourse } from '../../api/progress_api'

export function ProfilePage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ollamaModels, setOllamaModels] = useState<OllamaModelItem[]>([])
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null)
  const [savingModel, setSavingModel] = useState(false)
  const [progress, setProgress] = useState<UserProgressCourse[]>([])

  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailForm, setEmailForm] = useState({ email: '', password: '' })
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_new_password: '',
  })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch((e) => {
        console.error('Failed to load profile', e)
        setError('Could not load profile')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getOllamaModels()
      .then((res) => setOllamaModels(res.models ?? []))
      .catch((e) => {
        console.error('Failed to load Ollama models', e)
        setOllamaModelsError('Could not load model list. Is Ollama running?')
      })
  }, [])

  useEffect(() => {
    get_user_progress()
      .then((res) => setProgress(res.courses ?? []))
      .catch((e) => {
        console.error('Failed to load progress', e)
        setProgress([])
      })
  }, [])

  const currentModel = (user?.preferences?.ollama_model as string) ?? ''

  const onModelChange = useCallback(
    async (modelName: string) => {
      if (!user) return
      setSavingModel(true)
      try {
        const { preferences } = await updateUserPreferences({ ollama_model: modelName || null })
        setUser((u) => (u ? { ...u, preferences } : u))
      } catch (e) {
        console.error('Failed to save model preference', e)
      } finally {
        setSavingModel(false)
      }
    },
    [user]
  )

  const onSubmitEmail = useCallback(async () => {
    setEmailError(null)
    if (!emailForm.email.trim() || !emailForm.password) {
      setEmailError('Enter new email and current password')
      return
    }
    setEmailLoading(true)
    try {
      const res = await updateUserEmail({ email: emailForm.email.trim(), password: emailForm.password })
      setUser((u) => (u ? { ...u, email: res.email } : u))
      setEmailForm({ email: '', password: '' })
      setShowEmailForm(false)
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : 'Failed to update email'
      setEmailError(typeof msg === 'string' ? msg : 'Failed to update email')
    } finally {
      setEmailLoading(false)
    }
  }, [emailForm])

  const onSubmitPassword = useCallback(async () => {
    setPasswordError(null)
    setPasswordSuccess(false)
    if (!passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_new_password) {
      setPasswordError('Fill all password fields')
      return
    }
    if (passwordForm.new_password !== passwordForm.confirm_new_password) {
      setPasswordError('New password and confirmation do not match')
      return
    }
    setPasswordLoading(true)
    try {
      await updateUserPassword(passwordForm)
      setPasswordForm({ current_password: '', new_password: '', confirm_new_password: '' })
      setShowPasswordForm(false)
      setPasswordSuccess(true)
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : 'Failed to update password'
      setPasswordError(typeof msg === 'string' ? msg : 'Failed to update password')
    } finally {
      setPasswordLoading(false)
    }
  }, [passwordForm])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-slate-500">Loading profile…</p>
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-700">
          {error ?? 'Profile not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-slate-800">Profile</h1>
      <p className="mt-1 text-sm text-slate-500">Your account information</p>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Account</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-500">Email</label>
            <p className="mt-1 text-slate-900">{user.email}</p>
            {!showEmailForm ? (
              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Change email
              </button>
            ) : (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div>
                  <label htmlFor="new-email" className="block text-xs font-medium text-slate-600">New email</label>
                  <input
                    id="new-email"
                    type="email"
                    value={emailForm.email}
                    onChange={(e) => setEmailForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="new@example.com"
                    className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="email-password" className="block text-xs font-medium text-slate-600">Current password</label>
                  <input
                    id="email-password"
                    type="password"
                    value={emailForm.password}
                    onChange={(e) => setEmailForm((f) => ({ ...f, password: e.target.value }))}
                    className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                {emailError && <p className="text-sm text-red-600">{emailError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onSubmitEmail}
                    disabled={emailLoading}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60"
                  >
                    {emailLoading ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowEmailForm(false); setEmailError(null); setEmailForm({ email: '', password: '' }) }}
                    disabled={emailLoading}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-500">Password</label>
            <p className="mt-0.5 text-xs text-slate-400">Change your account password.</p>
            {!showPasswordForm ? (
              <button
                type="button"
                onClick={() => { setShowPasswordForm(true); setPasswordError(null); setPasswordSuccess(false) }}
                className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Change password
              </button>
            ) : (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div>
                  <label htmlFor="current-password" className="block text-xs font-medium text-slate-600">Current password</label>
                  <input
                    id="current-password"
                    type="password"
                    value={passwordForm.current_password}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, current_password: e.target.value }))}
                    className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="new-password" className="block text-xs font-medium text-slate-600">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, new_password: e.target.value }))}
                    className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-xs font-medium text-slate-600">Confirm new password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={passwordForm.confirm_new_password}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, confirm_new_password: e.target.value }))}
                    className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
                {passwordSuccess && <p className="text-sm text-green-600">Password updated.</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onSubmitPassword}
                    disabled={passwordLoading}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60"
                  >
                    {passwordLoading ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowPasswordForm(false); setPasswordError(null); setPasswordForm({ current_password: '', new_password: '', confirm_new_password: '' }) }}
                    disabled={passwordLoading}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          <div>
            <label htmlFor="ollama-model" className="block text-sm font-medium text-slate-500">
              Ollama model
            </label>
            <p className="mt-0.5 text-xs text-slate-400">Used for syllabus, tutor, and chat agents.</p>
            {ollamaModelsError ? (
              <p className="mt-1 text-sm text-amber-600">{ollamaModelsError}</p>
            ) : (
              <select
                id="ollama-model"
                value={currentModel}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={savingModel}
                className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
              >
                <option value="">Default (server)</option>
                {ollamaModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            {savingModel && <p className="mt-1 text-xs text-slate-500">Saving…</p>}
          </div>
          {user.preferences && Object.keys(user.preferences).length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-500">All preferences</label>
              <pre className="mt-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 overflow-x-auto">
                {JSON.stringify(user.preferences, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Learning progress</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Your progress per course. Learning sessions use this to guide you through modules.
          </p>
        </div>
        <div className="px-6 py-5">
          {progress.length === 0 ? (
            <p className="text-sm text-slate-500">
              No course progress yet. Start a course and complete modules to see your learning state here.
            </p>
          ) : (
            <ul className="space-y-4">
              {progress.map((c) => (
                <li key={c.course_id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <Link
                    to={`/courses/${c.course_id}`}
                    className="font-medium text-slate-800 hover:text-indigo-600"
                  >
                    {c.course_title}
                  </Link>
                  <span className="ml-2 text-sm text-slate-500">({c.subject})</span>
                  <ul className="mt-3 space-y-2">
                    {c.modules.map((m) => (
                      <li
                        key={m.module_id}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span
                          className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded px-1.5 text-xs font-medium ${
                            m.passed ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {m.order_index}
                        </span>
                        <span className="flex-1 text-slate-700">{m.title}</span>
                        {m.passed ? (
                          <span className="text-green-600 font-medium">Passed</span>
                        ) : (
                          <span className="text-slate-500">Not passed</span>
                        )}
                        <span className="text-slate-500">
                          best {Math.round(m.best_score * 100)}% · {m.attempts_count} attempt{m.attempts_count !== 1 ? 's' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
