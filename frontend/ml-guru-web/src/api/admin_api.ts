import { axiosInstance } from '../config/axiosConfig'

export interface AdminStats {
  total_courses: number
  total_modules: number
  total_syllabus_runs: number
  total_learning_sessions: number
  total_users: number
  total_admins: number
  system_status: string
  active_llm_provider: string
  active_gemini_model: string
  active_ollama_model: string
}

export interface AdminEndpointDoc {
  method: string
  path: string
  category: string
  summary: string
  description: string
  auth_required: string
  sample_body?: Record<string, unknown>
}

export interface AdminCourseItem {
  id: string
  user_id: number
  user_email: string
  title: string
  subject: string
  goals?: string
  syllabus_confirmed: boolean
  modules_count: number
  created_at: string
}

export interface AdminModuleDetail {
  id: string
  course_id: string
  title: string
  order_index: number
  objectives: string[]
  estimated_minutes?: number
  created_at: string
}

export interface AdminCourseDetail {
  id: string
  user_id: number
  user_email: string
  title: string
  subject: string
  goals?: string
  syllabus_draft?: unknown
  syllabus_confirmed: boolean
  created_at: string
  modules: AdminModuleDetail[]
}

export interface AdminUserItem {
  id: number
  email: string
  role: string
  is_admin: boolean
  courses_count: number
}

export const getAdminStats = async (): Promise<AdminStats> => {
  const res = await axiosInstance.get('/guru/admin/stats')
  return res.data
}

export const getAdminEndpoints = async (): Promise<AdminEndpointDoc[]> => {
  const res = await axiosInstance.get('/guru/admin/endpoints')
  return res.data.endpoints || []
}

export const getAdminCourses = async (): Promise<AdminCourseItem[]> => {
  const res = await axiosInstance.get('/guru/admin/courses')
  return res.data
}

export const getAdminCourseDetail = async (courseId: string): Promise<AdminCourseDetail> => {
  const res = await axiosInstance.get(`/guru/admin/courses/${courseId}`)
  return res.data
}

export const createAdminCourse = async (data: {
  title: string
  subject: string
  goals?: string
  user_id?: number
  syllabus_confirmed?: boolean
}): Promise<AdminCourseDetail> => {
  const res = await axiosInstance.post('/guru/admin/courses', data)
  return res.data
}

export const updateAdminCourse = async (
  courseId: string,
  data: {
    title?: string
    subject?: string
    goals?: string
    syllabus_confirmed?: boolean
  }
): Promise<AdminCourseDetail> => {
  const res = await axiosInstance.put(`/guru/admin/courses/${courseId}`, data)
  return res.data
}

export const deleteAdminCourse = async (courseId: string): Promise<{ message: string }> => {
  const res = await axiosInstance.delete(`/guru/admin/courses/${courseId}`)
  return res.data
}

export const getAdminSyllabus = async (courseId: string): Promise<{
  course_id: string
  title: string
  syllabus_confirmed: boolean
  syllabus_draft: unknown[]
  modules: AdminModuleDetail[]
}> => {
  const res = await axiosInstance.get(`/guru/admin/courses/${courseId}/syllabus`)
  return res.data
}

export const updateAdminSyllabus = async (
  courseId: string,
  data: {
    syllabus_draft: unknown[]
    sync_modules?: boolean
    confirm?: boolean
  }
): Promise<unknown> => {
  const res = await axiosInstance.put(`/guru/admin/courses/${courseId}/syllabus`, data)
  return res.data
}

export const createAdminModule = async (
  courseId: string,
  data: {
    title: string
    objectives: string[]
    estimated_minutes?: number
    order_index?: number
  }
): Promise<AdminModuleDetail> => {
  const res = await axiosInstance.post(`/guru/admin/courses/${courseId}/modules`, data)
  return res.data
}

export const updateAdminModule = async (
  courseId: string,
  moduleId: string,
  data: {
    title?: string
    objectives?: string[]
    estimated_minutes?: number
    order_index?: number
  }
): Promise<AdminModuleDetail> => {
  const res = await axiosInstance.put(`/guru/admin/courses/${courseId}/modules/${moduleId}`, data)
  return res.data
}

export const deleteAdminModule = async (
  courseId: string,
  moduleId: string
): Promise<{ message: string }> => {
  const res = await axiosInstance.delete(`/guru/admin/courses/${courseId}/modules/${moduleId}`)
  return res.data
}

export const getAdminUsers = async (): Promise<AdminUserItem[]> => {
  const res = await axiosInstance.get('/guru/admin/users')
  return res.data
}

export const updateAdminUserRole = async (
  userId: number,
  role: 'admin' | 'user'
): Promise<AdminUserItem> => {
  const res = await axiosInstance.patch(`/guru/admin/users/${userId}/role`, { role })
  return res.data
}
