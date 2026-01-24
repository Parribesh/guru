import { axiosInstance } from '../config/axiosConfig'
import { loginRequestSchema, registerRequestSchema, type LoginRequest, type LoginResponse, type RegisterRequest, type RegisterResponse } from '../schemas/authSchemas'

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