import { useState, useMemo } from 'react'
import type { SyllabusBuilderPayload, SyllabusBuilderState } from '../types/syllabusBuilder'

export interface InteractiveCourseBuilderProps {
  courseId: string
  courseTitle: string
  subject: string
  goals?: string | null
  syllabusRunId: string | null
  syllabusStatus: 'idle' | 'running' | 'completed' | 'failed'
  syllabusPhase: string | null
  currentPayload: SyllabusBuilderPayload | null
  isStepBusy: boolean
  isAutoRunning: boolean
  availableOllamaModels: string[]
  onStep: () => Promise<void>
  onAutoRun: () => Promise<void>
  onRerun: (provider: string, model: string, agent: string) => Promise<void>
  onConfirm: () => Promise<void>
  onUpdateModules?: (modules: Array<{ title: string; objectives: string[]; estimated_minutes?: number }>) => void
}

const PIPELINE_STAGES = [
  { id: 'planning', label: 'Planning', desc: 'Curriculum structure & goals' },
  { id: 'beginner', label: 'Beginner', desc: 'Core foundational concepts' },
  { id: 'intermediate', label: 'Intermediate', desc: 'Practical implementation' },
  { id: 'advanced', label: 'Advanced', desc: 'Specialized topics & optimization' },
  { id: 'finalize', label: 'Finalize', desc: 'Syllabus compilation' },
]

export function InteractiveCourseBuilder({
  courseTitle,
  subject,
  goals,
  syllabusRunId,
  syllabusStatus,
  syllabusPhase,
  currentPayload,
  isStepBusy,
  isAutoRunning,
  availableOllamaModels,
  onStep,
  onAutoRun,
  onRerun,
  onConfirm,
  onUpdateModules,
}: InteractiveCourseBuilderProps) {
  // Modal state for Rerun configuration
  const [showRerunModal, setShowRerunModal] = useState(false)
  const [rerunProvider, setRerunProvider] = useState<'gemini' | 'ollama'>('gemini')
  const [rerunModel, setRerunModel] = useState<string>('gemini-3.6-flash')
  const [rerunAgent, setRerunAgent] = useState<string>('TutorAgent')
  const [isRerunning, setIsRerunning] = useState(false)

  // Agent inspection toggle
  const [showInspector, setShowInspector] = useState(false)
  const [activeInspectorTab, setActiveInspectorTab] = useState<'prompt' | 'output' | 'system' | 'concepts'>('output')

  // Editable objective state for inline additions
  const [newObjectiveText, setNewObjectiveText] = useState<{ [moduleIdx: number]: string }>({})

  const state: SyllabusBuilderState = currentPayload?.state || {}
  const modules = useMemo(() => {
    return (state.modules || []) as Array<{ title?: string; objectives?: string[]; estimated_minutes?: number }>
  }, [state.modules])

  const agentName = state.agent || currentPayload?.agent || 'TutorAgent'
  const provider = state.provider || currentPayload?.provider || 'gemini'
  const modelName = state.inference_model || currentPayload?.inference_model || 'gemini-3.6-flash'

  // Determine active stage index
  const currentStageId = useMemo(() => {
    const raw = (syllabusPhase || state.next_node || state.current_stage || '').toLowerCase()
    if (raw.includes('plan')) return 'planning'
    if (raw.includes('beginner') || state.current_level === 'beginner') return 'beginner'
    if (raw.includes('intermediate') || state.current_level === 'intermediate') return 'intermediate'
    if (raw.includes('advanced') || state.current_level === 'advanced') return 'advanced'
    if (raw.includes('final') || syllabusStatus === 'completed') return 'finalize'
    return 'planning'
  }, [syllabusPhase, state.next_node, state.current_stage, state.current_level, syllabusStatus])

  const activeStageIndex = useMemo(() => {
    if (syllabusStatus === 'completed') return 4
    const idx = PIPELINE_STAGES.findIndex((s) => s.id === currentStageId)
    return idx >= 0 ? idx : 0
  }, [currentStageId, syllabusStatus])

  const progressPercent = useMemo(() => {
    if (syllabusStatus === 'completed') return 100
    if (syllabusStatus === 'idle') return 0
    return Math.round(((activeStageIndex + 0.5) / PIPELINE_STAGES.length) * 100)
  }, [activeStageIndex, syllabusStatus])

  const handleTriggerRerun = async () => {
    setIsRerunning(true)
    try {
      await onRerun(rerunProvider, rerunModel, rerunAgent)
      setShowRerunModal(false)
    } finally {
      setIsRerunning(false)
    }
  }

  const handleAddObjective = (modIdx: number) => {
    const text = (newObjectiveText[modIdx] || '').trim()
    if (!text || !onUpdateModules) return
    const updated = modules.map((m, i) => {
      if (i !== modIdx) return { title: m.title || `Module ${i + 1}`, objectives: m.objectives || [] }
      return {
        title: m.title || `Module ${i + 1}`,
        objectives: [...(m.objectives || []), text],
        estimated_minutes: m.estimated_minutes,
      }
    })
    onUpdateModules(updated)
    setNewObjectiveText((prev) => ({ ...prev, [modIdx]: '' }))
  }

  const handleRemoveObjective = (modIdx: number, objIdx: number) => {
    if (!onUpdateModules) return
    const updated = modules.map((m, i) => {
      if (i !== modIdx) return { title: m.title || `Module ${i + 1}`, objectives: m.objectives || [] }
      return {
        title: m.title || `Module ${i + 1}`,
        objectives: (m.objectives || []).filter((_, j) => j !== objIdx),
        estimated_minutes: m.estimated_minutes,
      }
    })
    onUpdateModules(updated)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden text-slate-800">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-semibold text-indigo-300 ring-1 ring-inset ring-indigo-500/40">
                AI Curriculum Builder
              </span>
              <span className="text-xs text-slate-400">{syllabusRunId ? `Run: ${syllabusRunId.slice(0, 8)}…` : 'New Run'}</span>
            </div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>{courseTitle}</span>
              <span className="text-sm font-normal text-slate-300">({subject})</span>
            </h2>
            {goals && <p className="mt-1 text-xs text-slate-300 line-clamp-1 max-w-xl">Goals: {goals}</p>}
          </div>

          {/* Model & Agent Pill */}
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-800/80 px-3 py-1.5 border border-slate-700 text-xs">
              <div className="text-[10px] uppercase font-semibold text-slate-400">Agent & Model</div>
              <div className="font-mono font-medium text-emerald-400 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {agentName} <span className="text-slate-500">|</span> {provider} <span className="text-slate-500">|</span> {modelName}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowRerunModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:scale-105 border border-indigo-400/30"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Rerun Config
            </button>
          </div>
        </div>

        {/* Visual Progression Stepper */}
        <div className="mt-6 pt-5 border-t border-slate-800">
          <div className="relative">
            {/* Background Line */}
            <div className="absolute top-1/2 left-0 w-full -translate-y-1/2 h-1 bg-slate-800 rounded-full">
              <div
                className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Stepper Nodes */}
            <div className="relative flex justify-between">
              {PIPELINE_STAGES.map((stage, idx) => {
                const isPast = idx < activeStageIndex || syllabusStatus === 'completed'
                const isCurrent = idx === activeStageIndex && syllabusStatus !== 'completed'
                return (
                  <div key={stage.id} className="flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-4 transition-all duration-300 ${
                        isPast
                          ? 'bg-emerald-500 text-white ring-slate-900'
                          : isCurrent
                          ? 'bg-indigo-600 text-white ring-indigo-400/40 animate-pulse'
                          : 'bg-slate-800 text-slate-400 ring-slate-900'
                      }`}
                    >
                      {isPast ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span
                      className={`mt-2 text-xs font-medium ${
                        isCurrent ? 'text-indigo-300 font-semibold' : isPast ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {stage.label}
                    </span>
                    <span className="hidden sm:block text-[10px] text-slate-400 max-w-[90px] text-center truncate">
                      {stage.desc}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
              syllabusStatus === 'completed'
                ? 'bg-emerald-100 text-emerald-800'
                : syllabusStatus === 'running'
                ? 'bg-blue-100 text-blue-800'
                : syllabusStatus === 'failed'
                ? 'bg-rose-100 text-rose-800'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {syllabusStatus === 'running' && <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />}
            Status: {syllabusStatus.toUpperCase()}
          </span>

          {syllabusPhase && (
            <span className="text-xs text-slate-600 font-mono bg-white px-2 py-0.5 rounded border border-slate-300">
              Stage: {syllabusPhase}
            </span>
          )}

          {state.current_level && (
            <span className="text-xs uppercase font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              Tier: {state.current_level}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* 1-Click Auto-Generate */}
          <button
            type="button"
            disabled={isAutoRunning || isStepBusy || syllabusStatus === 'completed'}
            onClick={onAutoRun}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isAutoRunning ? (
              <>
                <svg className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Auto-Generating Syllabus…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                Auto-Generate Full Syllabus
              </>
            )}
          </button>

          {/* Next Step Button */}
          <button
            type="button"
            disabled={isAutoRunning || isStepBusy || syllabusStatus === 'completed'}
            onClick={onStep}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStepBusy ? 'Processing…' : 'Next Step ⏭️'}
          </button>

          {/* Confirm Syllabus Button */}
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold shadow-sm transition-all ${
              syllabusStatus === 'completed'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Confirm & Save Syllabus
          </button>

          {/* Toggle Agent Inspector */}
          <button
            type="button"
            onClick={() => setShowInspector(!showInspector)}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium border ${
              showInspector ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
            title="Inspect Agent Reasoning & Prompts"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Inspector
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 space-y-6">
        {/* Agent Inspector Panel (Collapsible) */}
        {showInspector && (
          <div className="rounded-lg border border-slate-300 bg-slate-900 text-slate-100 overflow-hidden shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Agent Telemetry</span>
                <span className="text-xs font-mono text-emerald-400">[{agentName}]</span>
              </div>
              <div className="flex gap-1">
                {(['output', 'prompt', 'system', 'concepts'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveInspectorTab(tab)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                      activeInspectorTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 max-h-72 overflow-y-auto font-mono text-xs leading-relaxed text-slate-200">
              {activeInspectorTab === 'output' && (
                <div>
                  <div className="text-[11px] text-slate-400 mb-1">// Latest Agent LLM Response</div>
                  {state.step_output ? (
                    <pre className="whitespace-pre-wrap text-emerald-300">{state.step_output}</pre>
                  ) : (
                    <div className="text-slate-500 italic">No output captured yet. Step or Auto-Generate to begin.</div>
                  )}
                </div>
              )}

              {activeInspectorTab === 'prompt' && (
                <div>
                  <div className="text-[11px] text-slate-400 mb-1">// User Prompt Dispatched to LLM</div>
                  {state.step_prompt ? (
                    <pre className="whitespace-pre-wrap text-blue-300">{state.step_prompt}</pre>
                  ) : (
                    <div className="text-slate-500 italic">No user prompt recorded.</div>
                  )}
                </div>
              )}

              {activeInspectorTab === 'system' && (
                <div>
                  <div className="text-[11px] text-slate-400 mb-1">// System Prompt & Agent Persona Instructions</div>
                  {state.system_prompt ? (
                    <pre className="whitespace-pre-wrap text-amber-200">{state.system_prompt}</pre>
                  ) : (
                    <div className="text-slate-500 italic">No system prompt recorded.</div>
                  )}
                </div>
              )}

              {activeInspectorTab === 'concepts' && (
                <div>
                  <div className="text-[11px] text-slate-400 mb-2">// Discovered Concepts Across Learning Tiers</div>
                  {state.concepts_by_level && Object.keys(state.concepts_by_level).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(state.concepts_by_level).map(([lvl, list]) => (
                        <div key={lvl} className="bg-slate-950 p-2.5 rounded border border-slate-800">
                          <div className="font-bold text-indigo-400 uppercase text-[11px]">{lvl}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {Array.isArray(list) &&
                              list.map((c, idx) => (
                                <span key={idx} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200">
                                  {c}
                                </span>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-500 italic">No concepts generated yet.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Curriculum Board */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Generated Curriculum Modules</h3>
              <p className="text-xs text-slate-500">
                Review and refine learning objectives generated by {agentName}.
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
              {modules.length} {modules.length === 1 ? 'Module' : 'Modules'} Formulated
            </div>
          </div>

          {modules.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h4 className="text-sm font-bold text-slate-800">Syllabus Not Formulated Yet</h4>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                Click <strong>"Auto-Generate Full Syllabus"</strong> above to let {agentName} construct the complete multi-tier curriculum in seconds.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {modules.map((module, mIdx) => {
                const objectives = module.objectives || []
                return (
                  <div
                    key={mIdx}
                    className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="inline-flex items-center rounded bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                        Module {mIdx + 1}
                      </span>
                      {module.estimated_minutes && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          ⏱️ ~{module.estimated_minutes} mins
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 leading-snug">{module.title || 'Untitled Module'}</h4>

                    <div className="mt-3 flex-1">
                      <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1.5">Learning Objectives</div>
                      <div className="space-y-1.5">
                        {objectives.map((obj, oIdx) => (
                          <div
                            key={oIdx}
                            className="group flex items-start justify-between gap-1 rounded bg-slate-50 p-1.5 text-xs text-slate-700 hover:bg-slate-100"
                          >
                            <span className="flex-1 leading-relaxed">• {obj}</span>
                            {onUpdateModules && (
                              <button
                                type="button"
                                onClick={() => handleRemoveObjective(mIdx, oIdx)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 text-xs px-1"
                                title="Remove objective"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Inline Add Objective */}
                    {onUpdateModules && (
                      <div className="mt-3 pt-2 border-t border-slate-100 flex gap-1.5">
                        <input
                          type="text"
                          placeholder="Add objective…"
                          value={newObjectiveText[mIdx] || ''}
                          onChange={(e) => setNewObjectiveText({ ...newObjectiveText, [mIdx]: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddObjective(mIdx)
                          }}
                          className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddObjective(mIdx)}
                          className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rerun Configuration Modal */}
      {showRerunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🔄 Rerun Syllabus Generation</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowRerunModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-600">
              Customize the autonomous agent and AI inference model for this course curriculum. This will reset the existing run and generate fresh learning objectives.
            </p>

            <div className="mt-4 space-y-4">
              {/* Agent Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Agent</label>
                <select
                  value={rerunAgent}
                  onChange={(e) => setRerunAgent(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="TutorAgent">TutorAgent (Full LangGraph Curriculum Orchestrator)</option>
                  <option value="CourseArchitect">CourseArchitect (Structural Syllabus Designer)</option>
                  <option value="CurriculumSpecialist">CurriculumSpecialist (Fine-grained Pedagogical Spec)</option>
                </select>
              </div>

              {/* Provider Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Inference Provider</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRerunProvider('gemini')
                      setRerunModel('gemini-3.6-flash')
                    }}
                    className={`rounded-lg border p-2.5 text-center text-xs font-semibold transition-all ${
                      rerunProvider === 'gemini'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Google Gemini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRerunProvider('ollama')
                      if (availableOllamaModels.length > 0) {
                        setRerunModel(availableOllamaModels[0])
                      }
                    }}
                    className={`rounded-lg border p-2.5 text-center text-xs font-semibold transition-all ${
                      rerunProvider === 'ollama'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Local Ollama
                  </button>
                </div>
              </div>

              {/* Model Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Model Selection</label>
                {rerunProvider === 'gemini' ? (
                  <select
                    value={rerunModel}
                    onChange={(e) => setRerunModel(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="gemini-3.6-flash">gemini-3.6-flash (Recommended Default)</option>
                    <option value="gemini-3.7-flash">gemini-3.7-flash (Latest Flash)</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash (Fast & Stable)</option>
                  </select>
                ) : (
                  <select
                    value={rerunModel}
                    onChange={(e) => setRerunModel(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {availableOllamaModels.length === 0 ? (
                      <option value="">No Ollama models detected locally</option>
                    ) : (
                      availableOllamaModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setShowRerunModal(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRerunning || (rerunProvider === 'ollama' && !rerunModel)}
                onClick={handleTriggerRerun}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-50"
              >
                {isRerunning ? 'Starting Run…' : 'Start Fresh Run'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
