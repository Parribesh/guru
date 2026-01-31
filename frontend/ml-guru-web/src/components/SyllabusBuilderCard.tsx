import type { SyllabusBuilderPayload } from '../types/syllabusBuilder'

const STAGE_LABELS: Record<string, string> = {
  generate_concepts: 'Generate concepts',
  validate: 'Validate count',
  add_concepts: 'Add concepts',
  add_module: 'Add module',
  planning: 'Planning',
  finalize: 'Finalize',
}

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ')
}

interface SyllabusBuilderCardProps {
  payload: SyllabusBuilderPayload
  /** Optional index for Courses view (e.g. "1. Generate concepts") */
  index?: number
}

export function SyllabusBuilderCard({ payload, index }: SyllabusBuilderCardProps) {
  const { stage, state, done } = payload
  const agent = state.agent ?? payload.agent
  const inference_model = state.inference_model ?? payload.inference_model
  const level = state.current_level
  const concepts = state.current_concepts ?? []
  const meets = state.meets_threshold
  const needed = state.needed_count
  const rounds = state.add_concepts_rounds
  const modules = state.modules ?? []
  const conceptsByLevel = state.concepts_by_level ?? {}
  const stepPrompt = typeof state.step_prompt === 'string' ? state.step_prompt : (state.step_prompt != null ? String(state.step_prompt) : '')
  const stepOutput = typeof state.step_output === 'string' ? state.step_output : (state.step_output != null ? String(state.step_output) : '')
  const systemPrompt = typeof state.system_prompt === 'string' ? state.system_prompt : (state.system_prompt != null ? String(state.system_prompt) : '')
  const hasPrompt = stepPrompt.length > 0
  const hasSystemPrompt = systemPrompt.length > 0
  const hasOutput = stepOutput.length > 0

  return (
    <details className="rounded border border-gray-200 bg-white text-left" open>
      <summary className="cursor-pointer px-2 py-1.5 text-sm font-medium">
        {index != null ? `${index}. ` : ''}{stageLabel(stage)}
        {level ? ` (${level})` : ''}
        {done && <span className="ml-2 text-green-600">Done</span>}
        {(agent || inference_model) && (
          <span className="ml-2 text-slate-500 font-normal">
            {[agent, inference_model].filter(Boolean).join(' · ')}
          </span>
        )}
        {hasPrompt && <span className="ml-2 text-blue-600">Prompt ✓</span>}
        {hasSystemPrompt && <span className="ml-2 text-slate-600">System ✓</span>}
        {hasOutput && <span className="ml-2 text-green-600">Output ✓</span>}
        {concepts.length > 0 && <span className="ml-2 text-gray-500">concepts: {concepts.length}</span>}
        {typeof meets === 'boolean' && <span className="ml-2 text-gray-500">ok: {String(meets)}</span>}
        {modules.length > 0 && <span className="ml-2 text-gray-500">modules: {modules.length}</span>}
      </summary>
      <div className="border-t border-gray-100 px-2 py-2 text-xs text-gray-700 space-y-3">
        {/* Agent info (from state) */}
        {(agent || inference_model) && (
          <section>
            <div className="font-semibold text-gray-700 mb-1">Agent (in state)</div>
            <div className="pl-2 space-y-0.5">
              {agent && <div>agent: {agent}</div>}
              {inference_model && <div>inference_model: {inference_model}</div>}
            </div>
          </section>
        )}

        {/* Current node / pipeline */}
        <section>
          <div className="font-semibold text-gray-700 mb-1">Pipeline</div>
          <div className="pl-2 space-y-0.5">
            <div>stage: {stage}</div>
            {state.next_node != null && <div>next_node: {state.next_node}</div>}
            {level && <div>current_level: {level}</div>}
            {typeof rounds === 'number' && <div>add_concepts_rounds: {rounds}</div>}
          </div>
        </section>

        {/* Course context */}
        {(state.course_title || state.subject || state.goals) && (
          <section>
            <div className="font-semibold text-gray-700 mb-1">Course context</div>
            <div className="pl-2 space-y-0.5">
              {state.course_title && <div>course_title: {state.course_title}</div>}
              {state.subject && <div>subject: {state.subject}</div>}
              {state.goals && <div className="whitespace-pre-wrap break-words">goals: {state.goals}</div>}
            </div>
          </section>
        )}

        {/* Base system prompt (scenario) – in state */}
        {state.system_prompt && (
          <section>
            <div className="font-semibold text-gray-700 mb-1">System prompt (in state)</div>
            <pre className="p-3 bg-slate-100 rounded border border-slate-200 text-xs whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
              {state.system_prompt}
            </pre>
          </section>
        )}

        {/* Step: user prompt */}
        {hasPrompt && (
          <section>
            <div className="font-semibold text-gray-700 mb-1">Step prompt (user)</div>
            <pre className="p-3 bg-blue-50 rounded border border-blue-200 text-xs whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
              {stepPrompt}
            </pre>
          </section>
        )}

        {/* Step: output */}
        {hasOutput && (
          <section>
            <div className="font-semibold text-gray-700 mb-1">Step output</div>
            <pre className="p-3 bg-green-50 rounded border border-green-200 text-xs whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
              {stepOutput}
            </pre>
          </section>
        )}

        {/* Validation state */}
        {(concepts.length > 0 || typeof needed === 'number' || typeof meets === 'boolean') && (
          <section>
            <div className="font-semibold text-gray-700 mb-1">Validation</div>
            <div className="pl-2 space-y-0.5">
              {concepts.length > 0 && <div>current_concepts: {concepts.join(', ')}</div>}
              {typeof needed === 'number' && <div>needed_count: {needed}</div>}
              {typeof meets === 'boolean' && <div>meets_threshold: {String(meets)}</div>}
            </div>
          </section>
        )}

        {/* concepts_by_level */}
        {Object.keys(conceptsByLevel).length > 0 && (
          <section>
            <div className="font-semibold text-gray-700 mb-1">concepts_by_level</div>
            {Object.entries(conceptsByLevel).map(([k, v]) => (
              <div key={k} className="pl-2">{k}: [{Array.isArray(v) ? v.join(', ') : ''}]</div>
            ))}
          </section>
        )}

        {/* modules */}
        {modules.length > 0 && (
          <section>
            <div className="font-semibold text-gray-700 mb-1">modules</div>
            {modules.map((m, j) => (
              <div key={j} className="pl-2">
                {m.title}: {Array.isArray(m.objectives) ? m.objectives.length : 0} objectives
                {Array.isArray(m.objectives) && m.objectives.length > 0 && (
                  <div className="pl-2 text-gray-600">[{m.objectives.join(', ')}]</div>
                )}
              </div>
            ))}
          </section>
        )}

        {state.error && (
          <section>
            <div className="font-semibold text-red-700 mb-1">Error</div>
            <pre className="p-2 bg-red-50 rounded text-red-800 text-xs">{state.error}</pre>
          </section>
        )}
      </div>
    </details>
  )
}
