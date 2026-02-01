import { axiosInstance } from '../config/axiosConfig'
import { loginRequestSchema, registerRequestSchema, type LoginRequest, type LoginResponse, type RegisterRequest, type RegisterResponse } from '../schemas/authSchemas'

export type UserInfo = { email: string; preferences?: Record<string, unknown> }

export const getMe = async (): Promise<UserInfo> => {
  const response = await axiosInstance.get('/auth/me')
  const data = response.data as { email: string; preferences?: Record<string, unknown> }
  return { email: data.email, preferences: data.preferences }
}

export const login = async (loginRequest: LoginRequest): Promise<LoginResponse> => {
    const validatedRequest = loginRequestSchema.parse(loginRequest)
    const response = await axiosInstance.post('/auth/login', validatedRequest)
    return response.data as LoginResponse
}

export const register = async (registerRequest: RegisterRequest): Promise<RegisterResponse> => {
    const validatedRequest = registerRequestSchema.parse(registerRequest)
    const response = await axiosInstance.post('/auth/register', validatedRequest)
    return response.data as RegisterResponse
}

export const logout = async (): Promise<void> => {
  await axiosInstance.post('/auth/logout')
}

export const updateUserPreferences = async (preferences: Record<string, unknown>): Promise<{ preferences: Record<string, unknown> }> => {
  const response = await axiosInstance.patch('/guru/user/preferences', { preferences })
  return response.data as { preferences: Record<string, unknown> }
}

export type UpdateEmailRequest = { email: string; password: string }
export type UpdateEmailResponse = { message: string; email: string }

export const updateUserEmail = async (body: UpdateEmailRequest): Promise<UpdateEmailResponse> => {
  const response = await axiosInstance.patch('/guru/user/email', body)
  return response.data as UpdateEmailResponse
}

export type UpdatePasswordRequest = {
  current_password: string
  new_password: string
  confirm_new_password: string
}
export type UpdatePasswordResponse = { message: string }

export const updateUserPassword = async (body: UpdatePasswordRequest): Promise<UpdatePasswordResponse> => {
  const response = await axiosInstance.patch('/guru/user/password', body)
  return response.data as UpdatePasswordResponse
}