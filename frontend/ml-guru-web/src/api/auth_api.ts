import { axiosInstance } from '../config/axiosConfig'
import { loginRequestSchema, registerRequestSchema, type LoginRequest, type LoginResponse, type RegisterRequest, type RegisterResponse } from '../schemas/authSchemas'

export const login = async (loginRequest: LoginRequest): Promise<void> => {
    const validatedRequest = loginRequestSchema.parse(loginRequest)
    axiosInstance.post('/auth/login', validatedRequest).then((response) => {
        return response.data as LoginResponse
    }).catch((error) => {
        console.error(error)
        throw error
    })
}

export const register = async (registerRequest: RegisterRequest): Promise<void> => {
    const validatedRequest = registerRequestSchema.parse(registerRequest)
    axiosInstance.post('/auth/register', validatedRequest).then((response) => {
        return response.data as RegisterResponse
    }).catch((error) => {
        console.error(error)
        throw error
    })
}

export const logout = async (): Promise<void> => {
    axiosInstance.post('/auth/logout').then((response) => {
        return response.data
    }).catch((error) => {
        console.error(error)
        throw error
    })
}