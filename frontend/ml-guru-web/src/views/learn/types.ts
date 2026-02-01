import type { Message } from '../../api/chat_api'

export interface InteractionMetadata {
  retrievedHistory?: string
  systemPrompt?: string
  timestamp: string
}

export interface Interaction {
  id: string
  userMessage: Message
  assistantMessage: Message | null
  metadata: InteractionMetadata
  isStreaming?: boolean
}

export type TabKind = 'lesson' | 'chat'
