import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { SyllabusBuilderCard } from '../../components/SyllabusBuilderCard'
import { axiosInstance } from '../../config/axiosConfig'
import { WS_URL } from '../../config/config'
import type { SyllabusBuilderPayload } from '../../types/syllabusBuilder'

interface AgentTask {
  agent_name: string
  stage: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at: string | null
  completed_at: string | null
  error: string | null
  metadata: {
    agent_name?: string
    agent_state?: {
      history_length: number
      intermediate_steps: number
    }
    system_prompt?: string
    system_prompt_tokens?: number
    input_tokens_estimate?: number
    input_preview?: string
    output_tokens_estimate?: number
    output_preview?: string
    [key: string]: any
  }
}

interface PipelineStatus {
  tasks: AgentTask[]
  current_stage: string | null
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  module_progress?: {
    current: number
    total: number
    current_module?: string
  }
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Syllabus: one step per graph node (generate_concepts, validate, add_concepts, add_module)
const STAGE_LABELS: Record<string, string> = {
  planning: 'Planning',
  generate_concepts: 'Generate concepts',
  validate: 'Validate',
  add_concepts: 'Add concepts',
  add_module: 'Add module',
  finalize: 'Finalize',
}
const STAGE_ORDER = ['planning', 'generate_concepts', 'validate', 'add_concepts', 'add_module', 'finalize']

function stageDisplayLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ')
}

export function AgentDashboard() {
  const { sessionId, runId } = useParams<{ sessionId?: string; runId?: string }>()
  const navigate = useNavigate()
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSessions, setActiveSessions] = useState<Array<{ id: string; course_id: string; phase: string }>>([])
  // Active syllabus run on main /dashboard (from list) – subscribe and show updates
  const [activeSyllabusRun, setActiveSyllabusRun] = useState<{ run_id: string; course_id: string } | null>(null)
  const [activeSyllabusRunsLoading, setActiveSyllabusRunsLoading] = useState(true)

  // Syllabus runs: step-by-step (no stream); sessions: stream
  const streamId = runId ?? sessionId
  const isSyllabusRun = Boolean(runId)
  // When on /dashboard use active run from list; when on /dashboard/syllabus-run/:runId use runId
  const effectiveSyllabusRunId = isSyllabusRun ? runId! : activeSyllabusRun?.run_id ?? null

  // Syllabus step-by-step: single card + Continue button; display driven by WebSocket when runId matches
  const [syllabusRunStatus, setSyllabusRunStatus] = useState<'loading' | 'running' | 'completed' | 'failed'>('loading')
  const [syllabusStep, setSyllabusStep] = useState<{
    stage: string
    data: Record<string, unknown>
    agent?: string
    inference_model?: string
  } | null>(null)
  const [syllabusStepVersion, setSyllabusStepVersion] = useState(0)
  const [syllabusStepBusy, setSyllabusStepBusy] = useState(false)
  const [syllabusWsConnected, setSyllabusWsConnected] = useState(false)
  const [syllabusRunCourseId, setSyllabusRunCourseId] = useState<string | null>(null)
  const syllabusWsRef = useRef<WebSocket | null>(null)

  // Fetch active syllabus runs when on main /dashboard – pick first running to subscribe
  useEffect(() => {
    if (streamId) {
      setActiveSyllabusRunsLoading(false)
      return
    }
    setActiveSyllabusRunsLoading(true)
    axiosInstance.get('/guru/syllabus/runs?status=running')
      .then((r) => {
        const data = r.data as { runs: Array<{ run_id: string; course_id: string; status: string; phase: string | null }> }
        const runs = data.runs ?? []
        const first = runs[0]
        setActiveSyllabusRun(first ? { run_id: first.run_id, course_id: first.course_id } : null)
      })
      .catch((err) => {
        console.error('Failed to load active syllabus runs', err)
      })
      .finally(() => setActiveSyllabusRunsLoading(false))
  }, [streamId])

  // Fetch syllabus run on mount (fallback for initial state before WebSocket sends)
  useEffect(() => {
    if (!effectiveSyllabusRunId) return
    setSyllabusRunStatus('loading')
    setSyllabusStep(null)
    axiosInstance.get(`/guru/syllabus/runs/${effectiveSyllabusRunId}`)
      .then((r) => {
        const d = r.data as { run_id: string; course_id?: string; status: string; state_snapshot?: Record<string, unknown> | null; result?: Record<string, unknown> | null }
        if (d.course_id) setSyllabusRunCourseId(d.course_id)
        setSyllabusRunStatus(d.status as 'running' | 'completed' | 'failed')
        if (d.status === 'running' && d.state_snapshot) {
          const snap = d.state_snapshot && typeof d.state_snapshot === 'object' ? { ...d.state_snapshot } : {}
          const stage = (snap.next_node as string) || (snap.phase as string) || 'running'
          setSyllabusStep({ stage, data: snap })
          setSyllabusStepVersion((v) => v + 1)
        } else if (d.status === 'completed' && d.result) {
          const result = d.result && typeof d.result === 'object' ? { ...d.result } : {}
          setSyllabusStep({ stage: 'finalize', data: result })
          setSyllabusStepVersion((v) => v + 1)
        }
        if (d.status === 'completed' || d.status === 'failed') setActiveSyllabusRun(null)
      })
      .catch((err) => {
        console.error('Failed to load syllabus run', err)
        setSyllabusRunStatus('failed')
        setError('Run not found')
        if (!isSyllabusRun) setActiveSyllabusRun(null)
      })
  }, [effectiveSyllabusRunId, isSyllabusRun])

  // WebSocket: subscribe when effectiveSyllabusRunId is set (URL run or dashboard active run)
  useEffect(() => {
    if (!effectiveSyllabusRunId) {
      syllabusWsRef.current?.close()
      syllabusWsRef.current = null
      setSyllabusWsConnected(false)
      return
    }
    const ws = new WebSocket(`${WS_URL}/guru/ws/syllabus/runs/${effectiveSyllabusRunId}`)
    syllabusWsRef.current = ws

    ws.onopen = () => setSyllabusWsConnected(true)

    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data as string) as {
          stage: string
          state: Record<string, unknown>
          done: boolean
          agent?: string
          inference_model?: string
        }
        const state = d.state && typeof d.state === 'object' ? { ...d.state } : {}
        setSyllabusStep({ stage: d.stage, data: state, agent: d.agent, inference_model: d.inference_model })
        setSyllabusStepVersion((v) => v + 1)
        setSyllabusRunStatus(d.done ? 'completed' : 'running')
        setError(null)
        if (d.done && !isSyllabusRun) setActiveSyllabusRun(null)
      } catch (e) {
        console.error('syllabus WS message parse error', e)
      }
    }

    ws.onclose = () => {
      if (syllabusWsRef.current === ws) syllabusWsRef.current = null
      setSyllabusWsConnected(false)
      // If we never got a message, connection was rejected (e.g. 401/404)
      setSyllabusRunStatus((prev) => (prev === 'loading' ? 'failed' : prev))
    }

    ws.onerror = () => {
      ws.close()
    }

    return () => {
      ws.close()
      if (syllabusWsRef.current === ws) syllabusWsRef.current = null
      setSyllabusWsConnected(false)
    }
  }, [runId, isSyllabusRun])

  const continueSyllabusStep = async () => {
    if (!effectiveSyllabusRunId || syllabusRunStatus !== 'running' || syllabusStepBusy) return
    setSyllabusStepBusy(true)
    try {
      const r = await axiosInstance.post(`/guru/syllabus/runs/${effectiveSyllabusRunId}/step`)
      const d = r.data as { stage: string; state: Record<string, unknown>; done: boolean }
      const state = d.state && typeof d.state === 'object' ? { ...d.state } : {}
      setSyllabusStep({ stage: d.stage, data: state })
      setSyllabusStepVersion((v) => v + 1)
      if (d.done) setSyllabusRunStatus('completed')
    } catch (e) {
      console.error('Syllabus step error', e)
      setSyllabusRunStatus('failed')
    } finally {
      setSyllabusStepBusy(false)
    }
  }

  const rerunSyllabusFromScratch = async () => {
    const courseId = activeSyllabusRun?.course_id ?? syllabusRunCourseId
    if (!courseId) return
    setSyllabusStepBusy(true)
    setError(null)
    try {
      if (effectiveSyllabusRunId) {
        await axiosInstance.delete(`/guru/syllabus/runs/${effectiveSyllabusRunId}`).catch(() => {})
      }
      const r = await axiosInstance.post(`/guru/courses/${courseId}/syllabus/run`)
      const d = r.data as { run_id: string }
      setActiveSyllabusRun({ run_id: d.run_id, course_id: courseId })
      setSyllabusRunStatus('running')
      setSyllabusStep(null)
      setSyllabusStepVersion(0)
      if (isSyllabusRun) {
        navigate(`/dashboard/syllabus-run/${d.run_id}`, { replace: true })
      }
    } catch (e) {
      console.error('Rerun syllabus error', e)
      setError('Failed to start new run')
    } finally {
      setSyllabusStepBusy(false)
    }
  }

  // Load active sessions if no stream id provided (learning/test/chat sessions only; syllabus uses Courses page)
  useEffect(() => {
    if (!streamId) {
      axiosInstance.get('/guru/sessions?status=active')
        .then((response) => {
          const data = response.data as { sessions: Array<{ id: string; course_id: string; phase: string }> }
          setActiveSessions(data.sessions || [])
        })
        .catch((err) => {
          console.error('Failed to load active sessions:', err)
        })
      return
    }

    // Syllabus runs: no stream — use step-by-step UI above
    if (isSyllabusRun) return

    const streamUrl = `${API_BASE}/guru/sessions/${sessionId}/stream`
    const eventSource = new EventSource(streamUrl, { withCredentials: true })

    eventSource.onopen = () => {
      console.log('SSE connection opened for', isSyllabusRun ? 'syllabus run' : 'session', streamId)
      setIsConnected(true)
      setError(null)
    }

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err)
      setIsConnected(false)
      setError('Connection error')
    }

    // Track all received events for debugging
    const receivedEvents: string[] = []
    
    // Listen for metadata_update events (which contain agent task updates)
    eventSource.addEventListener('metadata_update', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data)
        receivedEvents.push(`metadata_update: ${data.type || 'unknown'}`)
        console.log('📥 Dashboard received metadata_update event:', data.type, data)
        
        // State-derived events: state_update has graph state (current_stage, concepts_by_level, modules)
        if (data.type === 'state_update' && data.data) {
          const state = data.data as { current_stage?: string; concepts_by_level?: { beginner?: string[]; intermediate?: string[]; advanced?: string[] }; modules?: unknown[] }
          const concepts = state.concepts_by_level
          const conceptsCount = concepts
            ? (concepts.beginner?.length ?? 0) + (concepts.intermediate?.length ?? 0) + (concepts.advanced?.length ?? 0)
            : 0
          const taskData: AgentTask = {
            agent_name: 'concepts',
            stage: state.current_stage ?? 'concepts',
            status: 'completed',
            started_at: null,
            completed_at: null,
            error: null,
            metadata: { concepts_count: conceptsCount, concepts_by_level: concepts },
          }
          console.log('✅ Processing state_update (state-derived) for stage:', taskData.stage)
          setPipelineStatus((prev) => {
            if (!prev) {
              return {
                tasks: [taskData],
                current_stage: taskData.stage,
                total_tasks: 1,
                completed_tasks: 1,
                failed_tasks: 0,
              }
            }
            const existingIndex = prev.tasks.findIndex((t) => t.agent_name === taskData.agent_name && t.stage === taskData.stage)
            const updatedTasks = existingIndex >= 0
              ? [...prev.tasks].map((t, i) => (i === existingIndex ? { ...taskData, metadata: { ...t.metadata, ...taskData.metadata } } : t))
              : [...prev.tasks, taskData]
            return {
              tasks: updatedTasks,
              current_stage: taskData.stage || prev.current_stage,
              total_tasks: updatedTasks.length,
              completed_tasks: updatedTasks.filter((t) => t.status === 'completed').length,
              failed_tasks: updatedTasks.filter((t) => t.status === 'failed').length,
            }
          })
        } else if (data.type === 'task_update' && data.data) {
          const taskData = data.data as AgentTask
          console.log('✅ Processing task_update for agent:', taskData.agent_name, 'status:', taskData.status, 'stage:', taskData.stage)
          
          setPipelineStatus((prev) => {
            if (!prev) {
              return {
                tasks: [taskData],
                current_stage: taskData.stage,
                total_tasks: 1,
                completed_tasks: taskData.status === 'completed' ? 1 : 0,
                failed_tasks: taskData.status === 'failed' ? 1 : 0,
              }
            }

            // Find existing task - match by agent_name and stage
            const existingIndex = prev.tasks.findIndex(
              (t) => t.agent_name === taskData.agent_name && t.stage === taskData.stage
            )

            let updatedTasks: AgentTask[]
            if (existingIndex >= 0) {
              // Update existing task - always update with latest data
              updatedTasks = [...prev.tasks]
              const existingTask = updatedTasks[existingIndex]
              
              // Merge metadata to preserve all information
              const mergedMetadata = {
                ...existingTask.metadata,
                ...taskData.metadata, // New metadata overrides old
              }
              
              updatedTasks[existingIndex] = {
                ...taskData,
                metadata: mergedMetadata,
                // Keep existing started_at if new one is null
                started_at: taskData.started_at || existingTask.started_at,
              }
            } else {
              // Add new task
              updatedTasks = [...prev.tasks, taskData]
            }
            
            console.log(`📊 Updated task for ${taskData.agent_name}: status=${taskData.status}, stage=${taskData.stage}, total_tasks=${updatedTasks.length}`)

            return {
              tasks: updatedTasks,
              current_stage: taskData.stage || prev.current_stage,
              total_tasks: updatedTasks.length,
              completed_tasks: updatedTasks.filter((t) => t.status === 'completed').length,
              failed_tasks: updatedTasks.filter((t) => t.status === 'failed').length,
            }
          })
        } else if (data.type === 'node_result' && isSyllabusRun) {
          // Syllabus: one step per graph node (generate_concepts, validate, add_concepts, add_module)
          const stage = data.phase ?? 'node'
          const stepData = (data.data as Record<string, unknown>) ?? {}
          const taskData: AgentTask = {
            agent_name: 'syllabus',
            stage,
            status: 'completed',
            started_at: null,
            completed_at: null,
            error: null,
            metadata: {
              current_level: stepData.current_level,
              current_concepts: stepData.current_concepts,
              current_concepts_count: Array.isArray(stepData.current_concepts) ? (stepData.current_concepts as unknown[]).length : 0,
              meets_threshold: stepData.meets_threshold,
              needed_count: stepData.needed_count,
              add_concepts_rounds: stepData.add_concepts_rounds,
              modules_count: Array.isArray(stepData.modules) ? (stepData.modules as unknown[]).length : 0,
              concepts_by_level: stepData.concepts_by_level,
            },
          }
          setPipelineStatus((prev) => {
            const tasks = [...(prev?.tasks ?? []), taskData]
            return {
              tasks,
              current_stage: stage,
              total_tasks: tasks.length,
              completed_tasks: tasks.length,
              failed_tasks: prev?.failed_tasks ?? 0,
            }
          })
        } else if (data.type === 'module_generated') {
          const moduleData = data.data || {}
          setPipelineStatus((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              current_stage: 'generation',
              module_progress: {
                current: moduleData.module_index || 0,
                total: moduleData.total_modules || 0,
                current_module: moduleData.module_title,
              },
            }
          })
        } else if (data.type === 'phase_start') {
          // Handle phase start (SyllabusAgent: planning | finalize)
          const stage = data.phase || data.data?.stage
          console.log('🚀 Phase started:', stage)
          setPipelineStatus((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              current_stage: data.phase || data.data?.stage || prev.current_stage,
            }
          })
        } else if (data.type === 'done') {
          // SyllabusAgent stream complete: finalize
          console.log('✅ Syllabus generation done:', data.data)
          setPipelineStatus((prev) => ({
            ...prev || {
              tasks: [],
              current_stage: null,
              total_tasks: 0,
              completed_tasks: 0,
              failed_tasks: 0,
            },
            current_stage: 'finalize',
          }))
        }
      } catch (err) {
        console.error('❌ Error parsing metadata_update event:', err, event)
      }
    })

    eventSource.addEventListener('session_ended', () => {
      receivedEvents.push('session_ended')
      eventSource.close()
      setIsConnected(false)
    })
    eventSource.addEventListener('run_ended', () => {
      receivedEvents.push('run_ended')
      eventSource.close()
      setIsConnected(false)
    })

    // Fallback: listen to all messages
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        receivedEvents.push(`message: ${data.type || 'unknown'}`)
        console.log('📨 Dashboard received general message:', data)
      } catch (err) {
        console.error('Error parsing message:', err)
      }
    }
    
    // Log received events periodically for debugging
    const debugInterval = setInterval(() => {
      if (receivedEvents.length > 0) {
        console.log('📊 Total events received:', receivedEvents.length, 'Types:', [...new Set(receivedEvents)])
      }
    }, 5000)

    return () => {
      clearInterval(debugInterval)
      eventSource.close()
      setIsConnected(false)
    }
  }, [streamId, sessionId, runId])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'running':
        return 'bg-blue-100 text-blue-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'pending':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDuration = (started: string | null, completed: string | null) => {
    if (!started) return '-'
    const start = new Date(started)
    const end = completed ? new Date(completed) : new Date()
    const duration = Math.round((end.getTime() - start.getTime()) / 1000)
    return `${duration}s`
  }

  // While checking for active syllabus runs on /dashboard, show loading
  if (!streamId && activeSyllabusRunsLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-2">Agent Dashboard</h2>
          <p className="text-gray-600">Monitor agent activity in real-time</p>
        </div>
        <div className="mb-4">
          <Link to="/courses" className="text-sm text-blue-600 hover:text-blue-800">← Back to Courses</Link>
        </div>
        <div className="bg-white border rounded-lg p-6 text-center py-12 text-gray-500">
          Checking for active runs…
        </div>
      </div>
    )
  }

  // If no stream id and no active syllabus run, show session selector / empty state
  if (!streamId && !activeSyllabusRun) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-2">Agent Dashboard</h2>
          <p className="text-gray-600">Monitor agent activity in real-time</p>
        </div>
        <div className="mb-4">
          <Link
            to="/courses"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Back to Courses
          </Link>
        </div>
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Active Sessions</h3>
          {activeSessions.length > 0 ? (
            <div className="space-y-3">
              {activeSessions.map((session) => (
                <Link
                  key={session.id}
                  to={`/dashboard/${session.id}`}
                  className="block p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">Session: {session.id.substring(0, 12)}...</div>
                      <div className="text-sm text-gray-600 mt-1">Phase: <span className="font-medium capitalize">{session.phase || 'N/A'}</span></div>
                    </div>
                    <div className="text-blue-600">→</div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-2">No active sessions.</p>
              <p className="text-sm">
                <Link to="/courses" className="text-blue-600 hover:text-blue-800">
                  Start a learning session or syllabus generation from the Courses page
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Display id for header (syllabus run on dashboard or session/run from URL)
  const displayId = streamId ?? activeSyllabusRun?.run_id ?? ''
  const showSyllabusRun = Boolean(effectiveSyllabusRunId)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-3xl font-bold">Agent Dashboard</h2>
            <p className="text-sm text-gray-600 mt-1">{showSyllabusRun ? 'Syllabus run' : 'Session'}: {displayId ? `${displayId.substring(0, 12)}...` : '—'}</p>
          </div>
          <Link
            to="/dashboard"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← All Sessions
          </Link>
        </div>
      </div>
      
      <div className="mb-4 flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
        {showSyllabusRun ? (
          <>
            <div className={`w-3 h-3 rounded-full ${syllabusRunStatus === 'running' ? 'bg-blue-500' : syllabusRunStatus === 'completed' ? 'bg-green-500' : syllabusRunStatus === 'failed' ? 'bg-red-500' : 'bg-gray-400'}`} />
            <span className="text-sm font-medium text-gray-700">
              Syllabus run: {syllabusRunStatus}
              {syllabusRunStatus === 'running' && ' – click Continue to run the next node'}
            </span>
          </>
        ) : (
          <>
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-sm font-medium text-gray-700">
              {isConnected ? 'Connected to session stream' : 'Disconnected'}
            </span>
          </>
        )}
        {!showSyllabusRun && pipelineStatus && (
          <div className="ml-auto flex items-center gap-4 text-sm text-gray-600">
            <div>
              Stage: <span className="font-semibold">{stageDisplayLabel(pipelineStatus.current_stage || '') || 'N/A'}</span>
            </div>
            {pipelineStatus.module_progress && (
              <div className="px-3 py-1 bg-blue-100 rounded">
                Module {pipelineStatus.module_progress.current}/{pipelineStatus.module_progress.total}
                {pipelineStatus.module_progress.current_module && (
                  <span className="ml-2 text-xs text-gray-600">
                    ({pipelineStatus.module_progress.current_module})
                  </span>
                )}
              </div>
            )}
            <div>
              Tasks: {pipelineStatus.completed_tasks}/{pipelineStatus.total_tasks} completed
              {pipelineStatus.failed_tasks > 0 && (
                <span className="text-red-600"> ({pipelineStatus.failed_tasks} failed)</span>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded border border-red-200">{error}</div>
      )}

      {showSyllabusRun ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase text-gray-500">Syllabus run</span>
            {effectiveSyllabusRunId && (
              <span className="text-xs text-gray-500">Run ID: {effectiveSyllabusRunId.slice(0, 8)}…</span>
            )}
            {syllabusWsConnected && (
              <span className="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Listening to socket
              </span>
            )}
            {effectiveSyllabusRunId && !syllabusWsConnected && syllabusRunStatus === 'loading' && (
              <span className="text-xs text-amber-600">Connecting…</span>
            )}
          </div>
          <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
            {syllabusRunStatus === 'loading' && !syllabusStep && <div className="text-xs text-gray-500">Loading run…</div>}
            {syllabusRunStatus === 'running' && !syllabusStep && <div className="text-xs text-gray-500 mb-2">Click Continue to run the next node.</div>}
            {syllabusStep && (
              <SyllabusBuilderCard
                key={`${effectiveSyllabusRunId}-${syllabusStep.stage}-${syllabusStepVersion}`}
                payload={{
                  stage: syllabusStep.stage,
                  state: syllabusStep.data as SyllabusBuilderPayload['state'],
                  done: syllabusRunStatus === 'completed',
                  agent: syllabusStep.agent ?? undefined,
                  inference_model: syllabusStep.inference_model ?? undefined,
                }}
              />
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={!effectiveSyllabusRunId || syllabusRunStatus !== 'running' || syllabusStepBusy}
              onClick={continueSyllabusStep}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {syllabusStepBusy ? 'Running…' : 'Continue'}
            </button>
            {(activeSyllabusRun?.course_id ?? syllabusRunCourseId) && (
              <button
                type="button"
                disabled={syllabusStepBusy}
                onClick={rerunSyllabusFromScratch}
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                Rerun from scratch
              </button>
            )}
            {syllabusRunStatus === 'completed' && <span className="text-sm text-green-600 font-medium">Syllabus complete</span>}
            {syllabusRunStatus === 'failed' && <span className="text-sm text-red-600 font-medium">Run failed</span>}
            {effectiveSyllabusRunId && !isSyllabusRun && (
              <Link
                to={`/dashboard/syllabus-run/${effectiveSyllabusRunId}`}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                View full run →
              </Link>
            )}
          </div>
        </div>
      ) : pipelineStatus && pipelineStatus.tasks.length > 0 ? (
        <div className="space-y-4">
          {(() => {
            // Group tasks by agent_name and stage, but for module_generator, also include module info to show each module separately
            const taskMap = new Map<string, AgentTask>()
            
            pipelineStatus.tasks.forEach((task, index) => {
              // Syllabus: one row per node step (generate_concepts, validate, add_concepts, add_module per level)
              let key: string
              if (task.agent_name === 'syllabus') {
                key = `syllabus-${index}-${task.stage}-${task.metadata?.current_level ?? ''}`
              } else if (task.agent_name === 'module_generator' && task.metadata?.current_module) {
                key = `${task.agent_name}-${task.stage}-${task.metadata.current_module}-${task.metadata.module_index || 'unknown'}`
              } else {
                key = `${task.agent_name}-${task.stage}`
              }
              const existing = taskMap.get(key)
              
              if (!existing) {
                taskMap.set(key, task)
              } else {
                // Prefer completed > running > pending > failed
                const priority = { completed: 4, running: 3, pending: 2, failed: 1 }
                const existingPriority = priority[existing.status] || 0
                const newPriority = priority[task.status] || 0
                
                if (newPriority > existingPriority) {
                  taskMap.set(key, task)
                } else if (newPriority === existingPriority && task.status === 'running') {
                  // For running tasks, always update with latest
                  taskMap.set(key, { ...task, metadata: { ...existing.metadata, ...task.metadata } })
                } else if (newPriority === existingPriority && task.status === 'completed') {
                  // For completed tasks, merge metadata to preserve all info
                  taskMap.set(key, { ...task, metadata: { ...existing.metadata, ...task.metadata } })
                }
              }
            })
            
            // Sort: running first, then by stage order, then by agent_name, then by module_index for module_generator
            const sortedTasks = Array.from(taskMap.values()).sort((a, b) => {
              if (a.status === 'running' && b.status !== 'running') return -1
              if (a.status !== 'running' && b.status === 'running') return 1
              
              const aStageIdx = STAGE_ORDER.indexOf(a.stage)
              const bStageIdx = STAGE_ORDER.indexOf(b.stage)
              const aIdxFallback = aStageIdx < 0 ? 999 : aStageIdx
              const bIdxFallback = bStageIdx < 0 ? 999 : bStageIdx
              if (aStageIdx !== bStageIdx) return aStageIdx - bStageIdx
              
              // For module_generator, sort by module_index
              if (a.agent_name === 'module_generator' && b.agent_name === 'module_generator') {
                const aIdx = a.metadata?.module_index || 0
                const bIdx = b.metadata?.module_index || 0
                return aIdx - bIdx
              }
              
              return a.agent_name.localeCompare(b.agent_name)
            })
            
            return sortedTasks.map((task, index) => {
              // Create unique key for each task, especially for module_generator
              const taskKey = task.agent_name === 'module_generator' && task.metadata?.module_index
                ? `${task.agent_name}-${task.stage}-${task.metadata.module_index}-${task.status}`
                : `${task.agent_name}-${task.stage}-${task.status}`
              
              return (
              <div 
                key={taskKey} 
                className={`border rounded-lg p-4 shadow-sm ${
                task.status === 'running' 
                  ? 'bg-blue-50 border-blue-300 animate-pulse' 
                  : task.status === 'completed'
                  ? 'bg-green-50 border-green-300'
                  : task.status === 'failed'
                  ? 'bg-red-50 border-red-300'
                  : 'bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {task.status === 'running' && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  )}
                  <h3 className="text-lg font-semibold capitalize">{task.agent_name.replace('_', ' ')}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                    {task.status}
                  </span>
                  <span className="text-sm text-gray-500">{stageDisplayLabel(task.stage)}</span>
                  {task.agent_name === 'module_generator' && (
                    <span className="text-xs px-2 py-1 bg-blue-200 text-blue-800 rounded">
                      {task.status === 'running' && task.metadata?.current_module ? (
                        <>Generating: {task.metadata.current_module} ({task.metadata.module_position || '?'})</>
                      ) : task.status === 'completed' && task.metadata?.current_module ? (
                        <>Completed: {task.metadata.current_module} ({task.metadata.module_position || '?'})</>
                      ) : (
                        <>Module Generator</>
                      )}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {formatDuration(task.started_at, task.completed_at)}
                  {task.status === 'running' && task.started_at && (
                    <span className="ml-2 text-xs text-blue-600">⏱️ Running...</span>
                  )}
                </div>
              </div>

              {task.error && (
                <div className="mb-3 p-2 bg-red-50 text-red-800 rounded text-sm">{task.error}</div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                {task.metadata.system_prompt_tokens && (
                  <div>
                    <span className="font-medium text-gray-700">System Prompt Tokens:</span>{' '}
                    <span className="text-gray-600">{task.metadata.system_prompt_tokens.toLocaleString()}</span>
                  </div>
                )}
                {task.metadata.input_tokens_estimate && (
                  <div>
                    <span className="font-medium text-gray-700">Input Tokens:</span>{' '}
                    <span className="text-gray-600">{task.metadata.input_tokens_estimate.toLocaleString()}</span>
                  </div>
                )}
                {task.metadata.output_tokens_estimate && (
                  <div>
                    <span className="font-medium text-gray-700">Output Tokens:</span>{' '}
                    <span className="text-gray-600">{task.metadata.output_tokens_estimate.toLocaleString()}</span>
                  </div>
                )}
                {task.metadata.agent_state && (
                  <div>
                    <span className="font-medium text-gray-700">History Length:</span>{' '}
                    <span className="text-gray-600">{task.metadata.agent_state.history_length}</span>
                  </div>
                )}
                {task.metadata.total_modules && (
                  <div>
                    <span className="font-medium text-gray-700">Total Modules:</span>{' '}
                    <span className="text-gray-600 font-semibold">{task.metadata.total_modules}</span>
                  </div>
                )}
                {task.metadata.execution_time_seconds && task.agent_name === 'module_generator' && (
                  <div>
                    <span className="font-medium text-gray-700">Execution Time:</span>{' '}
                    <span className="text-gray-600 font-semibold">{task.metadata.execution_time_seconds}s</span>
                  </div>
                )}
                {task.metadata.module_position && task.agent_name === 'module_generator' && (
                  <div>
                    <span className="font-medium text-gray-700">Module Position:</span>{' '}
                    <span className="text-gray-600">{task.metadata.module_position}</span>
                  </div>
                )}
                {task.agent_name === 'syllabus' && (
                  <>
                    {task.metadata.current_level != null && task.metadata.current_level !== '' && (
                      <div>
                        <span className="font-medium text-gray-700">Level:</span>{' '}
                        <span className="text-gray-600">{String(task.metadata.current_level)}</span>
                      </div>
                    )}
                    {task.metadata.current_concepts_count != null && (
                      <div>
                        <span className="font-medium text-gray-700">Concepts:</span>{' '}
                        <span className="text-gray-600">{Number(task.metadata.current_concepts_count)}</span>
                      </div>
                    )}
                    {task.metadata.meets_threshold != null && (
                      <div>
                        <span className="font-medium text-gray-700">Meets threshold:</span>{' '}
                        <span className="text-gray-600">{String(task.metadata.meets_threshold)}</span>
                      </div>
                    )}
                    {task.metadata.needed_count != null && Number(task.metadata.needed_count) > 0 && (
                      <div>
                        <span className="font-medium text-gray-700">Needed:</span>{' '}
                        <span className="text-gray-600">{Number(task.metadata.needed_count)}</span>
                      </div>
                    )}
                    {task.metadata.add_concepts_rounds != null && Number(task.metadata.add_concepts_rounds) > 0 && (
                      <div>
                        <span className="font-medium text-gray-700">Add rounds:</span>{' '}
                        <span className="text-gray-600">{Number(task.metadata.add_concepts_rounds)}</span>
                      </div>
                    )}
                    {task.metadata.modules_count != null && (
                      <div>
                        <span className="font-medium text-gray-700">Modules so far:</span>{' '}
                        <span className="text-gray-600">{Number(task.metadata.modules_count)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Syllabus step: current_concepts list */}
              {task.agent_name === 'syllabus' && Array.isArray(task.metadata?.current_concepts) && (task.metadata.current_concepts as string[]).length > 0 && (
                <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-200 text-xs">
                  <span className="font-medium text-gray-700">current_concepts:</span>{' '}
                  <span className="text-gray-600">{(task.metadata.current_concepts as string[]).join(', ')}</span>
                </div>
              )}

              {/* System Prompt Display */}
              {task.metadata.system_prompt && (
                <div className="mt-3 mb-3">
                  <div className="text-xs font-medium text-gray-700 mb-1">System Prompt:</div>
                  <div className="p-3 bg-blue-50 rounded text-xs font-mono text-gray-800 max-h-64 overflow-y-auto whitespace-pre-wrap border border-blue-200">
                    {task.metadata.system_prompt}
                  </div>
                </div>
              )}

              {/* Planner-specific output */}
              {task.agent_name === 'planner' && task.metadata.output_data && (
                <div className="mb-3 p-3 bg-blue-50 rounded border border-blue-200">
                  <div className="text-sm font-semibold text-blue-900 mb-2">Curriculum Plan:</div>
                  {task.metadata.output_data.total_modules && (
                    <div className="text-sm mb-1">
                      <span className="font-medium">Modules:</span> {task.metadata.output_data.total_modules}
                    </div>
                  )}
                  {task.metadata.output_data.core_concepts && Array.isArray(task.metadata.output_data.core_concepts) && (
                    <div className="text-sm mb-1">
                      <span className="font-medium">Core Concepts:</span>{' '}
                      <span className="text-gray-700">{task.metadata.output_data.core_concepts.join(', ')}</span>
                    </div>
                  )}
                  {task.metadata.output_data.learning_path && Array.isArray(task.metadata.output_data.learning_path) && (
                    <div className="text-sm mb-1">
                      <span className="font-medium">Learning Path:</span>
                      <ul className="list-disc list-inside ml-2 mt-1 text-gray-700">
                        {task.metadata.output_data.learning_path.slice(0, 5).map((path: string, idx: number) => (
                          <li key={idx}>{path}</li>
                        ))}
                        {task.metadata.output_data.learning_path.length > 5 && (
                          <li className="text-gray-500">... and {task.metadata.output_data.learning_path.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {task.metadata.output_data.progression_strategy && (
                    <div className="text-sm mb-1">
                      <span className="font-medium">Progression:</span>{' '}
                      <span className="text-gray-700">{task.metadata.output_data.progression_strategy}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Module Generator specific output */}
              {task.agent_name === 'module_generator' && task.metadata?.module_output && (
                <div className="mb-3 p-3 bg-green-50 rounded border border-green-200">
                  <div className="text-sm font-semibold text-green-900 mb-2">
                    Module Generated: {task.metadata.module_output.title}
                  </div>
                  <div className="text-xs text-gray-700 space-y-1">
                    {task.metadata.execution_time_seconds && (
                      <div>
                        <span className="font-medium">Execution Time:</span> {task.metadata.execution_time_seconds}s
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Objectives:</span> {task.metadata.module_output.objectives_count}
                    </div>
                    <div>
                      <span className="font-medium">Estimated Time:</span> {task.metadata.module_output.estimated_minutes} minutes
                    </div>
                    {task.metadata.module_output.objectives && Array.isArray(task.metadata.module_output.objectives) && (
                      <div className="mt-2">
                        <span className="font-medium">Objectives:</span>
                        <ul className="list-disc list-inside ml-2 mt-1 text-gray-600">
                          {task.metadata.module_output.objectives.slice(0, 3).map((obj: string, idx: number) => (
                            <li key={idx} className="text-xs">{obj}</li>
                          ))}
                          {task.metadata.module_output.objectives.length > 3 && (
                            <li className="text-xs text-gray-500">... and {task.metadata.module_output.objectives.length - 3} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Other agent outputs */}
              {task.metadata.modules_count && task.agent_name !== 'planner' && task.agent_name !== 'module_generator' && (
                <div className="mb-3 p-3 bg-green-50 rounded border border-green-200">
                  <div className="text-sm font-semibold text-green-900">
                    Generated {task.metadata.modules_count} modules
                  </div>
                </div>
              )}

              {(task.metadata.input_preview || task.metadata.full_prompt) && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-700 mb-1">
                    {task.metadata.full_prompt ? 'Full Prompt:' : 'Input Preview:'}
                  </div>
                  <div className="p-3 bg-gray-50 rounded text-xs font-mono text-gray-700 max-h-64 overflow-y-auto whitespace-pre-wrap">
                    {task.metadata.full_prompt || task.metadata.input_preview}
                  </div>
                </div>
              )}

              {task.metadata.output_preview && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-700 mb-1">Output Preview:</div>
                  <div className="p-2 bg-gray-50 rounded text-xs font-mono text-gray-600 max-h-32 overflow-y-auto">
                    {task.metadata.output_preview}
                  </div>
                </div>
              )}

              {Object.keys(task.metadata).length > 0 && (
                <details className="mt-3">
                  <summary className="text-sm font-medium text-gray-700 cursor-pointer">
                    Full Metadata
                  </summary>
                  <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                    {JSON.stringify(task.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </div>
              )
            })
          })()}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          {isConnected ? 'Waiting for agent tasks...' : 'Not connected to session stream'}
        </div>
      )}
    </div>
  )
}

