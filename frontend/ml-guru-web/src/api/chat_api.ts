import { axiosInstance } from '../config/axiosConfig'
import { runAgentRequestSchema, runAgentResponseSchema, type RunAgentRequest, type RunAgentResponse } from '../schemas/restSchemas'

export const runChatAgent = async (runAgentRequest: RunAgentRequest): Promise<RunAgentResponse> => {
    const validatedRequest = runAgentRequestSchema.parse(runAgentRequest)
    const response = await axiosInstance.post('/guru/chat', validatedRequest)
    const validatedResponse = runAgentResponseSchema.parse(response.data)
    return validatedResponse
}