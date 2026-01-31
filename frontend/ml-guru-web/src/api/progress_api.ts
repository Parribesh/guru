import { axiosInstance } from '../config/axiosConfig'

export interface UserProgressModule {
  module_id: string
  title: string
  order_index: number
  passed: boolean
  best_score: number
  attempts_count: number
  passed_at: string | null
  updated_at: string | null
}

export interface UserProgressCourse {
  course_id: string
  course_title: string
  subject: string
  modules: UserProgressModule[]
}

export interface UserProgressResponse {
  courses: UserProgressCourse[]
}

export const get_user_progress = async (): Promise<UserProgressResponse> => {
  const response = await axiosInstance.get('/guru/user/progress')
  return response.data as UserProgressResponse
}
