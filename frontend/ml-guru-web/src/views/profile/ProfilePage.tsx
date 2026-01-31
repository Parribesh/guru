import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMe, updateUserPreferences, type UserInfo } from '../../api/auth_api'
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
          </div>
          <div>
            <label htmlFor="ollama-model" className="block text-sm font-medium text-slate-500">
              Ollama model
            </label>
            <p className="mt-0.5 text-xs text-slate-400">Used for syllabus and inference.</p>
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
