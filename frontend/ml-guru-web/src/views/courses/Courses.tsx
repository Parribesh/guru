import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { SyllabusBuilderCard } from '../../components/SyllabusBuilderCard'
import { axiosInstance } from '../../config/axiosConfig'
import { API_URL, WS_URL } from '../../config/config'
import type { SyllabusBuilderPayload } from '../../types/syllabusBuilder'

type Course = {
  id: string
  title: string
  subject: string
  goals: string | null
  syllabus_confirmed: boolean
  created_at: string
}

type DraftModule = { title: string; objectives: string[]; estimated_minutes?: number | null }
type SyllabusDraftResponse = { course_id: string; modules: DraftModule[] }

type Module = {
  id: string
  course_id: string
  title: string
  order_index: number
  objectives: string[]
  estimated_minutes?: number | null
  created_at: string
  passed: boolean
  best_score: number
  attempts_count: number
}

type CourseDetail = { course: Course; modules: Module[] }

export const Courses = () => {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [courseDetail, setCourseDetail] = useState<CourseDetail | null>(null)
  const navigate = useNavigate()
  const params = useParams<{ courseId?: string }>()

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [goals, setGoals] = useState('')
  const [draft, setDraft] = useState<SyllabusDraftResponse | null>(null)
  const [busy, setBusy] = useState(false)

  // Syllabus builder: step-by-step (Continue button); one card updated in place
  const [syllabusRunId, setSyllabusRunId] = useState<string | null>(null)
  const [syllabusPhase, setSyllabusPhase] = useState<string | null>(null)
  const [syllabusStatus, setSyllabusStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle')
  const [syllabusCurrentStep, setSyllabusCurrentStep] = useState<{
    stage: string
    data: Record<string, unknown>
    agent?: string
    inference_model?: string
  } | null>(null)
  const [syllabusStepVersion, setSyllabusStepVersion] = useState(0)
  const [syllabusModules, setSyllabusModules] = useState<DraftModule[]>([])
  const [syllabusStepBusy, setSyllabusStepBusy] = useState(false)
  const syllabusWsRef = useRef<WebSocket | null>(null)

  // Test UI
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const [testStream, setTestStream] = useState('')
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [testSystemPrompt, setTestSystemPrompt] = useState<string>('')
  const esRef = useRef<EventSource | null>(null)

  // Learning UI - removed (now handled by LearningSessionChat component)

  const loadCourses = () =>
    axiosInstance
      .get('/guru/courses')
      .then((r) => setCourses((r.data as { courses: Course[] }).courses))
      .catch((e) => console.error('loadCourses failed', e))

  const loadCourseDetail = (courseId: string) =>
    axiosInstance
      .get(`/guru/courses/${courseId}`)
      .then((r) => setCourseDetail(r.data as CourseDetail))
      .catch((e) => console.error('loadCourseDetail failed', e))

  useEffect(() => {
    loadCourses()
  }, [])

  useEffect(() => {
    if (params.courseId) setSelectedCourseId(params.courseId)
  }, [params.courseId])

  useEffect(() => {
    if (!selectedCourseId) {
      setCourseDetail(null)
      return
    }
    loadCourseDetail(selectedCourseId)
    if (params.courseId !== selectedCourseId) {
      navigate(`/courses/${selectedCourseId}`, { replace: false })
    }
    const storedRunId = (() => {
      try {
        return sessionStorage.getItem(`syllabusRun-${selectedCourseId}`)
      } catch {
        return null
      }
    })()
    if (storedRunId) {
      axiosInstance
        .get(`/guru/syllabus/runs/${storedRunId}`)
        .then((r) => {
          const d = r.data as { status: string; state_snapshot?: Record<string, unknown> | null }
          if (d.status === 'running') {
            setSyllabusRunId(storedRunId)
            setSyllabusStatus('running')
            if (d.state_snapshot) {
              const snap = d.state_snapshot && typeof d.state_snapshot === 'object' ? { ...d.state_snapshot } : {}
              const stage = (snap.next_node as string) || (snap.phase as string) || 'running'
              setSyllabusPhase(stage)
              setSyllabusCurrentStep({ stage, data: snap })
              setSyllabusStepVersion((v) => v + 1)
            }
          } else {
            try {
              sessionStorage.removeItem(`syllabusRun-${selectedCourseId}`)
            } catch (_) {}
          }
        })
        .catch(() => {
          try {
            sessionStorage.removeItem(`syllabusRun-${selectedCourseId}`)
          } catch (_) {}
        })
    }
  }, [selectedCourseId, navigate, params.courseId])

  // WebSocket: subscribe to syllabus run so every run is visible (e.g. other tab clicks Continue)
  useEffect(() => {
    if (!syllabusRunId || syllabusStatus !== 'running') {
      syllabusWsRef.current?.close()
      syllabusWsRef.current = null
      return
    }
    const ws = new WebSocket(`${WS_URL}/guru/ws/syllabus/runs/${syllabusRunId}`)
    syllabusWsRef.current = ws
    ws.onmessage = (ev) => {
      try {
        const body = JSON.parse(ev.data as string) as SyllabusBuilderPayload
        const state = body.state ?? {}
        setSyllabusPhase(body.stage)
        setSyllabusCurrentStep({
          stage: body.stage,
          data: state,
          agent: body.agent,
          inference_model: body.inference_model,
        })
        if (body.done) {
          setSyllabusStatus('completed')
          if (Array.isArray(state.modules)) setSyllabusModules(state.modules as DraftModule[])
          if (selectedCourseId) {
            try {
              sessionStorage.removeItem(`syllabusRun-${selectedCourseId}`)
            } catch (_) {}
            loadCourseDetail(selectedCourseId)
            loadCourses()
          }
        }
      } catch (e) {
        console.error('syllabus WS message parse error', e)
      }
    }
    ws.onclose = () => {
      if (syllabusWsRef.current === ws) syllabusWsRef.current = null
    }
    ws.onerror = () => {
      ws.close()
    }
    return () => {
      ws.close()
      if (syllabusWsRef.current === ws) syllabusWsRef.current = null
    }
  }, [syllabusRunId, syllabusStatus, selectedCourseId])

  useEffect(() => {
    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [])

  const canCreate = useMemo(() => title.trim() && subject.trim(), [title, subject])

  const createCourse = async () => {
    if (!canCreate) return
    setBusy(true)
    try {
      const r = await axiosInstance.post('/guru/courses', { title: title.trim(), subject: subject.trim(), goals: goals.trim() || null })
      const d = r.data as SyllabusDraftResponse
      setDraft(d)
      setSyllabusModules(d.modules ?? [])
      setSelectedCourseId(d.course_id)
      await loadCourses()
      await loadCourseDetail(d.course_id)
      // Auto-start the streamed syllabus builder so progress is visible in real time.
      await startSyllabusRunFor(d.course_id)
    } finally {
      setBusy(false)
    }
  }

  const confirmSyllabus = async () => {
    if (!selectedCourseId) return
    setBusy(true)
    try {
      await axiosInstance.post(`/guru/courses/${selectedCourseId}/syllabus/confirm`)
      await loadCourseDetail(selectedCourseId)
      await loadCourses()
    } finally {
      setBusy(false)
    }
  }

  const startSyllabusRunFor = async (courseId: string) => {
    setBusy(true)
    try {
      const runToDelete = syllabusRunId
      setSyllabusRunId(null)
      setSyllabusPhase(null)
      setSyllabusStatus('running')
      setSyllabusCurrentStep(null)
      if (runToDelete) {
        await axiosInstance.delete(`/guru/syllabus/runs/${runToDelete}`).catch(() => {})
      }
      const r = await axiosInstance.post(`/guru/courses/${courseId}/syllabus/run`)
      const runId = (r.data as { run_id: string }).run_id
      setSyllabusRunId(runId)
      try {
        sessionStorage.setItem(`syllabusRun-${courseId}`, runId)
      } catch (_) {}
    } finally {
      setBusy(false)
    }
  }

  const continueSyllabusStep = async () => {
    if (!syllabusRunId || syllabusStatus === 'completed' || syllabusStatus === 'failed') return
    setSyllabusStepBusy(true)
    try {
      const r = await axiosInstance.post(`/guru/syllabus/runs/${syllabusRunId}/step`)
      const body = r.data as SyllabusBuilderPayload
      const state = body.state && typeof body.state === 'object' ? { ...body.state } : {}
      setSyllabusPhase(body.stage)
      setSyllabusCurrentStep({
        stage: body.stage,
        data: state,
        agent: body.agent ?? undefined,
        inference_model: body.inference_model ?? undefined,
      })
      setSyllabusStepVersion((v) => v + 1)
      if (body.done) {
        setSyllabusStatus('completed')
        if (Array.isArray(state.modules)) setSyllabusModules(state.modules as DraftModule[])
        if (selectedCourseId) {
          try {
            sessionStorage.removeItem(`syllabusRun-${selectedCourseId}`)
          } catch (_) {}
          loadCourseDetail(selectedCourseId)
          loadCourses()
        }
      }
    } catch (e) {
      console.error('syllabus step error', e)
      setSyllabusStatus('failed')
      if (selectedCourseId) {
        try {
          sessionStorage.removeItem(`syllabusRun-${selectedCourseId}`)
        } catch (_) {}
      }
    } finally {
      setSyllabusStepBusy(false)
    }
  }

  const startSyllabusRun = async () => {
    if (!selectedCourseId) return
    return startSyllabusRunFor(selectedCourseId)
  }

  const startTest = async (moduleId: string) => {
    setBusy(true)
    try {
      const r = await axiosInstance.post(`/guru/modules/${moduleId}/test/start`)
      const data = r.data as { attempt_id: string; conversation_id: string; greeting?: string }
      setActiveAttemptId(data.attempt_id)
      setTestStream(data.greeting ? `${data.greeting}\n\n` : '')
      setTestStatus('started')
      setTestSystemPrompt('')
    } finally {
      setBusy(false)
    }
  }

  const startLearning = async (moduleId: string) => {
    setBusy(true)
    try {
      const r = await axiosInstance.post(`/guru/sessions?session_type=learning&module_id=${moduleId}`)
      const data = r.data as { session_id: string; conversation_id: string; context?: any }
      // Redirect to dedicated learning session chat view
      navigate(`/learn/${data.conversation_id}`, { replace: false })
    } finally {
      setBusy(false)
    }
  }

  // sendLearn removed - now handled by LearningSessionChat component

  const sendTest = async () => {
    if (!activeAttemptId) return
    const trimmed = testMessage.trim()
    if (!trimmed) return

    esRef.current?.close()
    setTestMessage('')
    setTestStatus('streaming')
    const payload = encodeURIComponent(JSON.stringify({ message: trimmed, conversation_id: null }))
    const url = `${API_URL}/guru/tests/${activeAttemptId}/stream?payload=${payload}`
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es
    es.addEventListener('system_prompt', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data as string) as { system_prompt?: string }
        setTestSystemPrompt(payload.system_prompt ?? '')
      } catch (e) {
        console.error('failed to parse test system_prompt', e)
      }
    })
    es.onmessage = (ev) => setTestStream((p) => p + (ev.data as string))
    es.addEventListener('end', () => {
      es.close()
      if (esRef.current === es) esRef.current = null
      setTestStatus('idle')
    })
    es.onerror = (e) => {
      console.error('test stream error', e)
      es.close()
      if (esRef.current === es) esRef.current = null
      setTestStatus('error')
    }
  }

  const gradeTest = async () => {
    if (!activeAttemptId) return
    setBusy(true)
    try {
      const r = await axiosInstance.post(`/guru/tests/${activeAttemptId}/grade`)
      const data = r.data as { score: number; passed: boolean }
      setTestStatus(`graded: score=${data.score.toFixed(2)} passed=${data.passed}`)
      if (selectedCourseId) await loadCourseDetail(selectedCourseId)
    } finally {
      setBusy(false)
    }
  }

  const moduleProgress = useMemo(() => {
    const mods = courseDetail?.modules ?? []
    const total = mods.length
    const passed = mods.filter((m) => m.passed).length
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0
    return { total, passed, pct }
  }, [courseDetail])

  const syllabusProgressPct = useMemo(() => {
    if (syllabusStatus === 'idle') return 0
    if (syllabusStatus === 'failed') return 100
    if (syllabusStatus === 'completed') return 100
    if (syllabusCurrentStep) return 50
    return 10
  }, [syllabusPhase, syllabusStatus, syllabusCurrentStep])

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      <div className="w-[320px] rounded-lg border border-gray-200 bg-white p-4">
        <div className="text-lg font-semibold">Courses</div>
        <div className="mt-3 space-y-2">
          {courses.map((c) => (
            <button
              key={c.id}
              className={[
                'w-full rounded-md border px-3 py-2 text-left text-sm',
                selectedCourseId === c.id ? 'border-blue-500 bg-blue-50 font-semibold' : 'border-gray-200 bg-white hover:bg-gray-50',
              ].join(' ')}
              onClick={() => {
                setSelectedCourseId(c.id)
                setDraft(null)
              }}
              type="button"
            >
              <div className="flex items-center justify-between">
                <span>{c.title}</span>
                <span className="text-xs text-gray-500">{c.syllabus_confirmed ? 'active' : 'draft'}</span>
              </div>
              <div className="text-xs text-gray-500">{c.subject}</div>
            </button>
          ))}
        </div>

        <div className="mt-6 border-t pt-4">
          <div className="text-sm font-semibold">Create course</div>
          <div className="mt-2 space-y-2">
            <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (e.g., Python)" />
            <textarea className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm" value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="Goals (optional)" />
            <button disabled={!canCreate || busy} className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-300" onClick={createCourse} type="button">
              Create + Generate syllabus
            </button>
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white p-4">
        {!selectedCourseId ? (
          <div className="text-sm text-gray-500">Select a course to view modules.</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">{courseDetail?.course.title}</div>
                <div className="text-sm text-gray-500">{courseDetail?.course.subject}</div>
              </div>
              <div className="flex items-center gap-2">
                {selectedCourseId && (
                  <Link
                    to={`/courses/${selectedCourseId}/settings`}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Settings
                  </Link>
                )}
                {!courseDetail?.course.syllabus_confirmed && (
                <button disabled={busy} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:bg-gray-100" onClick={confirmSyllabus} type="button">
                  Confirm syllabus
                </button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-semibold uppercase text-gray-500">Modules passed</div>
                <div className="mt-1 text-2xl font-bold">{moduleProgress.passed}/{moduleProgress.total}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-semibold uppercase text-gray-500">Course progress</div>
                <div className="mt-1 text-2xl font-bold">{moduleProgress.pct}%</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-semibold uppercase text-gray-500">Syllabus run</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{syllabusStatus}{syllabusPhase ? ` • ${syllabusPhase}` : ''}</div>
              </div>
            </div>

            {!courseDetail?.course.syllabus_confirmed && (
              <div className="mt-4 rounded-md border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Syllabus Builder</div>
                    <div className="text-xs text-gray-500">generate_concepts → validate → add_concepts (retry) → add_module per level</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={!selectedCourseId || busy}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-300"
                      onClick={startSyllabusRun}
                      type="button"
                    >
                      {syllabusStatus === 'running' ? 'Running…' : 'Run syllabus builder'}
                    </button>
                    {syllabusRunId && (
                      <Link
                        to={`/dashboard/syllabus-run/${syllabusRunId}`}
                        className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                      >
                        View Dashboard
                      </Link>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-blue-600" style={{ width: `${syllabusProgressPct}%` }} />
                  </div>
                </div>

                <div className="mt-3">
                  {syllabusStatus === 'running' && (
                    <div className="mb-2 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-800">
                      <span className="font-semibold">Syllabus run in progress</span>
                      {syllabusRunId && <span className="text-blue-600">Run ID: {syllabusRunId.slice(0, 8)}…</span>}
                      {syllabusPhase && <span>Stage: {syllabusPhase}</span>}
                    </div>
                  )}
                  <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Current step (updates when you click Continue)</div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
                    {!syllabusCurrentStep && syllabusStatus === 'running' && (
                      <div className="text-xs text-gray-500 mb-2">Click Continue to run the next node.</div>
                    )}
                    {syllabusCurrentStep && (
                      <SyllabusBuilderCard
                        key={`${syllabusRunId ?? ''}-${syllabusCurrentStep.stage}-${syllabusStepVersion}`}
                        index={1}
                        payload={{
                          stage: syllabusCurrentStep.stage,
                          state: syllabusCurrentStep.data as SyllabusBuilderPayload['state'],
                          done: syllabusStatus === 'completed',
                          agent: syllabusCurrentStep.agent ?? undefined,
                          inference_model: syllabusCurrentStep.inference_model ?? undefined,
                        }}
                      />
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={!syllabusRunId || syllabusStatus !== 'running' || syllabusStepBusy}
                      onClick={continueSyllabusStep}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {syllabusStepBusy ? 'Running…' : 'Continue'}
                    </button>
                    {selectedCourseId && (syllabusRunId || syllabusStatus === 'running' || syllabusStatus === 'completed') && (
                      <button
                        type="button"
                        disabled={busy || syllabusStepBusy}
                        onClick={() => startSyllabusRunFor(selectedCourseId)}
                        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      >
                        Rerun from scratch
                      </button>
                    )}
                    {syllabusStatus === 'completed' && (
                      <span className="text-sm text-green-600 font-medium">Syllabus complete</span>
                    )}
                  </div>
                </div>

                {syllabusModules.length > 0 ? (
                  <div className="mt-3 rounded-md border border-gray-200 p-3">
                    <div className="text-sm font-semibold">Draft modules</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {syllabusModules.map((m, i) => (
                        <div key={i} className="rounded-md border border-gray-200 bg-white p-2 text-sm">
                          <div className="font-semibold">{i + 1}. {m.title}</div>
                          <div className="mt-1 text-xs text-gray-600">{m.objectives.slice(0, 3).join(' • ')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {draft && (
              <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-50 p-3">
                <div className="text-sm font-semibold">Syllabus draft</div>
                <div className="mt-2 space-y-2">
                  {draft.modules.map((m, i) => (
                    <div key={i} className="rounded-md border border-yellow-200 bg-white p-2 text-sm">
                      <div className="font-semibold">{m.title}</div>
                      <ul className="mt-1 list-disc pl-5 text-xs text-gray-700">
                        {m.objectives.slice(0, 5).map((o, j) => (
                          <li key={j}>{o}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="text-sm font-semibold">Modules</div>
              <div className="mt-2 space-y-2">
                {courseDetail?.modules?.map((m) => (
                  <div key={m.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">
                          {m.order_index}. {m.title}
                        </div>
                        <div className="text-xs text-gray-500">
                          best={m.best_score.toFixed(2)} attempts={m.attempts_count} {m.passed ? '• passed' : ''}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={busy}
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 disabled:bg-gray-100"
                          onClick={() => startLearning(m.id)}
                          type="button"
                        >
                          Start learning
                        </button>
                        <button disabled={busy} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-300" onClick={() => startTest(m.id)} type="button">
                          Start test
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-700">
                      <div className="font-semibold">Objectives</div>
                      <ul className="list-disc pl-5">
                        {m.objectives.slice(0, 6).map((o, i) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>


            <div className="mt-6 rounded-md border border-gray-200 p-3">
              <div className="text-sm font-semibold">Module Test</div>
              <div className="mt-2 text-xs text-gray-500">attempt: {activeAttemptId ?? '(none)'} {testStatus ? `• ${testStatus}` : ''}</div>
              {testSystemPrompt ? (
                <details className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-gray-700">Agent system prompt (source of truth)</summary>
                  <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap text-xs">{testSystemPrompt}</pre>
                </details>
              ) : null}
              <div className="mt-2 flex gap-2">
                <input className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder="Answer…" />
                <button disabled={!activeAttemptId} className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-300" onClick={sendTest} type="button">
                  Send
                </button>
                <button disabled={!activeAttemptId || busy} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold disabled:bg-gray-100" onClick={gradeTest} type="button">
                  Grade
                </button>
              </div>
              <pre className="mt-3 max-h-[220px] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs whitespace-pre-wrap">{testStream}</pre>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Courses

