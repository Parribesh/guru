import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { axiosInstance } from '../../config/axiosConfig'

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

export function AgentDashboard() {
  const { sessionId, runId } = useParams<{ sessionId?: string; runId?: string }>()
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSessions, setActiveSessions] = useState<Array<{ id: string; course_id: string; phase: string }>>([])

  // Syllabus runs use /guru/syllabus/runs/:runId/stream; sessions use /guru/sessions/:sessionId/stream
  const streamId = runId ?? sessionId
  const isSyllabusRun = Boolean(runId)

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

    const streamUrl = isSyllabusRun
      ? `${API_BASE}/guru/syllabus/runs/${runId}/stream`
      : `${API_BASE}/guru/sessions/${sessionId}/stream`
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
        
        // Handle different event types
        if (data.type === 'task_update' && data.data) {
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
        } else if (data.type === 'module_generated') {
          // Handle module generation progress
          const moduleData = data.data || {}
          console.log('📦 Module generated:', moduleData)
          setPipelineStatus((prev) => {
            if (!prev) return prev
            // Update module progress
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

  // If no stream id, show session selector
  if (!streamId) {
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-3xl font-bold">Agent Dashboard</h2>
            <p className="text-sm text-gray-600 mt-1">{isSyllabusRun ? 'Syllabus run' : 'Session'}: {streamId.substring(0, 12)}...</p>
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
        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-sm font-medium text-gray-700">
          {isConnected ? 'Connected to session stream' : 'Disconnected'}
        </span>
        {pipelineStatus && (
          <div className="ml-auto flex items-center gap-4 text-sm text-gray-600">
            <div>
              Stage: <span className="font-semibold capitalize">{pipelineStatus.current_stage || 'N/A'}</span>
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

      {pipelineStatus && pipelineStatus.tasks.length > 0 ? (
        <div className="space-y-4">
          {(() => {
            // Group tasks by agent_name and stage, but for module_generator, also include module info to show each module separately
            const taskMap = new Map<string, AgentTask>()
            
            pipelineStatus.tasks.forEach((task) => {
              // For module_generator, include module info in key to show each module separately
              let key = `${task.agent_name}-${task.stage}`
              if (task.agent_name === 'module_generator' && task.metadata?.current_module) {
                key = `${task.agent_name}-${task.stage}-${task.metadata.current_module}-${task.metadata.module_index || 'unknown'}`
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
              
              const stageOrder = ['planning', 'generation', 'finalization']
              const aStageIdx = stageOrder.indexOf(a.stage)
              const bStageIdx = stageOrder.indexOf(b.stage)
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
                  <span className="text-sm text-gray-500 capitalize">{task.stage}</span>
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
              </div>

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

