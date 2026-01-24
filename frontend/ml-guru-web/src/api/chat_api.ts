import { axiosInstance } from '../config/axiosConfig'
import { chatRequestSchema, chatResponseSchema, type ChatRequestType, type ChatResponseType } from '../schemas/restSchemas'

export const runChatAgent = async (runAgentRequest: ChatRequestType): Promise<ChatResponseType> => {
    const validatedRequest = chatRequestSchema.parse(runAgentRequest)
    const response = await axiosInstance.post('/guru/chat', validatedRequest)
    const validatedResponse = chatResponseSchema.parse(response.data)
    return validatedResponse
}

export type ChatHistoryItem = { user: string; assistant: string }
export type ChatHistoryResponse = { history: ChatHistoryItem[] }

export const fetchChatHistory = async (): Promise<ChatHistoryResponse> => {
    const response = await axiosInstance.get('/guru/chat/history')
    return response.data as ChatHistoryResponse
}

export type Conversation = {
    id: string
    parent_conversation_id: string | null
    forked_from_message_id: string | null
    created_at: string
    title: string | null
}

export type Message = {
    id: string
    conversation_id: string
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string
    seq: number
    created_at: string
    interaction_metadata?: {
        retrieved_history?: string
        system_prompt?: string
        [key: string]: any
    } | null
}

export const listConversations = async (): Promise<Conversation[]> => {
    const res = await axiosInstance.get('/guru/conversations')
    return (res.data as { conversations: Conversation[] }).conversations
}

export const fetchConversationMessages = async (conversationId: string): Promise<Message[]> => {
    const res = await axiosInstance.get(`/guru/conversations/${conversationId}/messages`)
    return (res.data as { messages: Message[] }).messages
}

export const forkConversation = async (conversationId: string, fromMessageId: string): Promise<string> => {
    const res = await axiosInstance.post(`/guru/conversations/${conversationId}/fork`, { from_message_id: fromMessageId })
    return (res.data as { conversation_id: string }).conversation_id
}