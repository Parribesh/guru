/**
 * Syllabus builder state: full agent state sent over WebSocket and step response.
 * Single source of truth for frontend card display.
 */

export interface SyllabusBuilderState {
  // Course context
  course_title?: string
  subject?: string
  goals?: string
  target_level?: string
  // Pipeline
  next_node?: string
  current_level?: string
  current_concepts?: string[]
  meets_threshold?: boolean
  needed_count?: number
  add_concepts_rounds?: number
  // Syllabus result
  modules?: Array<{ title?: string; objectives?: string[]; estimated_minutes?: number; dependencies?: unknown[] }>
  concepts_by_level?: Record<string, string[]>
  // Step visibility (last node run)
  step_prompt?: string | null
  step_output?: string | null
  /** Base agent system prompt (scenario); single system prompt for the run */
  system_prompt?: string | null
  /** Agent info (which agent and model used for inference) */
  agent?: string | null
  inference_model?: string | null
  // Misc
  current_stage?: string
  error?: string | null
}

/**
 * Payload from WebSocket and POST .../step. Contains full builder state + agent metadata.
 */
export interface SyllabusBuilderPayload {
  stage: string
  state: SyllabusBuilderState
  done: boolean
  agent?: string | null
  inference_model?: string | null
}
