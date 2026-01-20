import { z } from 'zod'

export const loginRequestSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
})
export const registerRequestSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
    confirm_password: z.string().min(8),
}).refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
})

export const registerResponseSchema = z.object({
    message: z.string(),
})

export const loginResponseSchema = z.object({
    message: z.string(),
})

export type LoginRequest = z.infer<typeof loginRequestSchema>
export type RegisterRequest = z.infer<typeof registerRequestSchema>
export type RegisterResponse = z.infer<typeof registerResponseSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>

// Common form type for the UI that includes all possible fields
export type AuthFormData = {
    email: string
    password: string
    confirm_password?: string
}