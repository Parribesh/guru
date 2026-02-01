import type { Message } from '../../api/chat_api'
import type { Interaction, InteractionMetadata } from './types'

export function buildInteractionsFromMessages(
  msgs: Message[],
  existingInteractions: Interaction[] = []
): Interaction[] {
  const visibleMessages = msgs.filter((m) => m.role !== 'system')
  const newInteractions: Interaction[] = []
  let pendingUser: Message | null = null

  const existingMetadataMap = new Map<string, InteractionMetadata>()
  existingInteractions.forEach((interaction) => {
    if (interaction.assistantMessage) {
      const key = `${interaction.userMessage.id}_${interaction.assistantMessage.id}`
      if (interaction.metadata.retrievedHistory || interaction.metadata.systemPrompt) {
        existingMetadataMap.set(key, interaction.metadata)
      }
    }
  })

  for (const msg of visibleMessages) {
    if (msg.role === 'user') {
      pendingUser = msg
    } else if (msg.role === 'assistant' && pendingUser) {
      const interactionKey = `${pendingUser.id}_${msg.id}`
      const existingMetadata = existingMetadataMap.get(interactionKey) || {}
      let dbMetadata = msg.interaction_metadata || {}
      if (typeof dbMetadata === 'string') {
        try {
          dbMetadata = JSON.parse(dbMetadata)
        } catch {
          dbMetadata = {}
        }
      }
      newInteractions.push({
        id: interactionKey,
        userMessage: pendingUser,
        assistantMessage: msg,
        metadata: {
          timestamp: msg.created_at,
          retrievedHistory: existingMetadata.retrievedHistory || dbMetadata.retrieved_history || undefined,
          systemPrompt: existingMetadata.systemPrompt || dbMetadata.system_prompt || undefined,
        },
      })
      pendingUser = null
    }
  }

  if (pendingUser) {
    const existingMetadata = existingMetadataMap.get(`${pendingUser.id}_pending`) || {}
    newInteractions.push({
      id: `${pendingUser.id}_pending`,
      userMessage: pendingUser,
      assistantMessage: null,
      metadata: { timestamp: pendingUser.created_at, ...existingMetadata },
      isStreaming: false,
    })
  }

  return newInteractions
}

export function buildChatInteractionsFromMessages(msgs: Message[]): Interaction[] {
  const visible = msgs.filter((m) => m.role !== 'system')
  const newInteractions: Interaction[] = []
  let pendingUser: Message | null = null

  for (const msg of visible) {
    if (msg.role === 'user') {
      pendingUser = msg
    } else if (msg.role === 'assistant' && pendingUser) {
      const interactionKey = `${pendingUser.id}_${msg.id}`
      let dbMetadata = msg.interaction_metadata || {}
      if (typeof dbMetadata === 'string') {
        try {
          dbMetadata = JSON.parse(dbMetadata)
        } catch {
          dbMetadata = {}
        }
      }
      newInteractions.push({
        id: interactionKey,
        userMessage: pendingUser,
        assistantMessage: msg,
        metadata: {
          timestamp: msg.created_at,
          retrievedHistory: dbMetadata.retrieved_history ?? undefined,
          systemPrompt: dbMetadata.system_prompt ?? undefined,
        },
      })
      pendingUser = null
    }
  }

  if (pendingUser) {
    newInteractions.push({
      id: `${pendingUser.id}_pending`,
      userMessage: pendingUser,
      assistantMessage: null,
      metadata: { timestamp: pendingUser.created_at },
    })
  }

  return newInteractions
}
