import { z } from 'zod'

export const chatRequestSchema = z.object({
    message: z.string(),
    conversation_id: z.string().nullable(),
})

export const chatResponseSchema = z.object({
    response: z.string(),
})

export type ChatRequestType = z.infer<typeof chatRequestSchema>
export type ChatResponseType = z.infer<typeof chatResponseSchema>