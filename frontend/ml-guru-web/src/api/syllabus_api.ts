import { axiosInstance } from '../config/axiosConfig'
import type { SyllabusBuilderPayload, SyllabusBuilderState } from '../types/syllabusBuilder'

export interface AutoRunResult {
  run_id: string
  status: string
  done: boolean
  stage?: string
  steps_executed: number
  modules_count: number
  agent?: string
  provider?: string
  inference_model?: string
  error?: string
}

export async function startSyllabusRun(
  courseId: string,
  provider?: string,
  model?: string,
  agent: string = 'TutorAgent'
): Promise<{ run_id: string }> {
  const res = await axiosInstance.post<{ run_id: string }>(`/guru/courses/${courseId}/syllabus/run`, {
    provider,
    model,
    agent,
  })
  return res.data
}

export async function rerunSyllabus(
  courseId: string,
  provider?: string,
  model?: string,
  agent: string = 'TutorAgent'
): Promise<{ run_id: string }> {
  const res = await axiosInstance.post<{ run_id: string }>(`/guru/courses/${courseId}/syllabus/rerun`, {
    provider,
    model,
    agent,
  })
  return res.data
}

export async function stepSyllabus(runId: string): Promise<SyllabusBuilderPayload> {
  const res = await axiosInstance.post<SyllabusBuilderPayload>(`/guru/syllabus/runs/${runId}/step`)
  return res.data
}

export async function autoRunSyllabus(runId: string, maxSteps: number = 30): Promise<AutoRunResult> {
  const res = await axiosInstance.post<AutoRunResult>(`/guru/syllabus/runs/${runId}/auto-run?max_steps=${maxSteps}`)
  return res.data
}

export async function getSyllabusRun(runId: string): Promise<{
  run_id: string
  course_id: string
  status: string
  state_snapshot?: SyllabusBuilderState | null
  result?: Record<string, unknown> | null
  agent?: string
  provider?: string
  inference_model?: string
}> {
  const res = await axiosInstance.get(`/guru/syllabus/runs/${runId}`)
  return res.data
}

export async function confirmSyllabus(courseId: string): Promise<void> {
  await axiosInstance.post(`/guru/courses/${courseId}/syllabus/confirm`)
}

export async function deleteSyllabusRun(runId: string): Promise<void> {
  await axiosInstance.delete(`/guru/syllabus/runs/${runId}`).catch(() => {})
}
