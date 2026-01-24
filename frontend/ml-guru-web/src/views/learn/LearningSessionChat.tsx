import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_URL } from '../../config/config'
import { chatRequestSchema } from '../../schemas/restSchemas'
import { fetchConversationMessages, type Message } from '../../api/chat_api'

interface InteractionMetadata {
  retrievedHistory?: string
  systemPrompt?: string
  timestamp: string
}

interface Interaction {
  id: string
  userMessage: Message
  assistantMessage: Message | null
  metadata: InteractionMetadata
  isStreaming?: boolean
}

export const LearningSessionChat = () => {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [showOptions, setShowOptions] = useState(false)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null)
  
  const streamRef = useRef<EventSource | null>(null)
  const inFlightRef = useRef(false)
  const requestIdRef = useRef<string | null>(null)
  const currentInteractionIdRef = useRef<string | null>(null)
  const navigate = useNavigate()
  const params = useParams<{ conversationId: string }>()

  const historyEndRef = useRef<HTMLDivElement>(null)
  const historyContainerRef = useRef<HTMLDivElement>(null)

  const newRequestId = () => {
    return crypto.randomUUID()
  }

  // Ensure any open SSE connection is closed on unmount
  useEffect(() => {
    return () => {
      try {
        streamRef.current?.close()
      } finally {
        streamRef.current = null
        inFlightRef.current = false
        requestIdRef.current = null
      }
    }
  }, [])

  // Load conversation from URL params
  useEffect(() => {
    if (params.conversationId) {
      setConversationId(params.conversationId)
    } else {
      navigate('/courses', { replace: true })
    }
  }, [params.conversationId, navigate])

  // Load messages when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setSystemPrompt('')
      setInteractions([])
      return
    }
    fetchConversationMessages(conversationId)
      .then((msgs) => {
        setMessages(msgs)
        // Extract system prompt from messages if it exists
        const sysMsg = msgs.find((m) => m.role === 'system')
        if (sysMsg) {
          setSystemPrompt(sysMsg.content)
        }
        // Build interactions from messages
        buildInteractionsFromMessages(msgs)
      })
      .catch((e) => console.error('failed to fetch messages', e))
  }, [conversationId])

  const buildInteractionsFromMessages = (msgs: Message[]) => {
    const visibleMessages = msgs.filter((m) => m.role !== 'system')
    const newInteractions: Interaction[] = []
    let pendingUser: Message | null = null

    // Preserve metadata from existing interactions by creating a map
    const existingMetadataMap = new Map<string, InteractionMetadata>()
    interactions.forEach((interaction) => {
      const key = interaction.userMessage.id
      if (interaction.metadata.retrievedHistory || interaction.metadata.systemPrompt) {
        existingMetadataMap.set(key, interaction.metadata)
      }
    })

    for (const msg of visibleMessages) {
      if (msg.role === 'user') {
        pendingUser = msg
      } else if (msg.role === 'assistant' && pendingUser) {
        // Preserve metadata if it exists, or use metadata from database
        const existingMetadata = existingMetadataMap.get(pendingUser.id) || {}
        // Handle both parsed object and potential string (defensive)
        let dbMetadata = msg.interaction_metadata || {}
        if (typeof dbMetadata === 'string') {
          try {
            dbMetadata = JSON.parse(dbMetadata)
          } catch (e) {
            console.warn('Failed to parse interaction_metadata:', e)
            dbMetadata = {}
          }
        }
        
        newInteractions.push({
          id: `${pendingUser.id}_${msg.id}`,
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

    // Handle orphaned user message
    if (pendingUser) {
      const existingMetadata = existingMetadataMap.get(pendingUser.id) || {}
      newInteractions.push({
        id: `${pendingUser.id}_pending`,
        userMessage: pendingUser,
        assistantMessage: null,
        metadata: {
          timestamp: pendingUser.created_at,
          ...existingMetadata,
        },
      })
    }

    setInteractions(newInteractions)
  }

  // Auto-scroll to bottom when interactions change
  useEffect(() => {
    if (!historyEndRef.current) return
    historyEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [interactions.length, streamingContent])

  const refreshMessages = () => {
    if (!conversationId) return
    fetchConversationMessages(conversationId)
      .then((msgs) => {
        setMessages(msgs)
        buildInteractionsFromMessages(msgs)
      })
      .catch((e) => console.error('failed to fetch messages', e))
  }

  const handleSubmit = async () => {
    const trimmed = message.trim()
    if (!trimmed || !conversationId) return

    // Prevent accidental double-submits
    if (inFlightRef.current && streamRef.current) {
      streamRef.current.close()
      streamRef.current = null
    }

    inFlightRef.current = true
    setLoading(true)
    setStreamingContent('')
    const rid = newRequestId()
    requestIdRef.current = rid
    const interactionId = newRequestId()
    currentInteractionIdRef.current = interactionId

    // Create new interaction for this exchange
    const userMessage: Message = {
      id: `temp_${Date.now()}`,
      conversation_id: conversationId,
      role: 'user',
      content: trimmed,
      seq: messages.length + 1,
      created_at: new Date().toISOString(),
    }

    setInteractions((prev) => [
      ...prev,
      {
        id: interactionId,
        userMessage,
        assistantMessage: null,
        metadata: {
          timestamp: userMessage.created_at,
        },
        isStreaming: true,
      },
    ])

    const payload = {
      message: trimmed,
      conversation_id: conversationId,
    }
    const validatedPayload = chatRequestSchema.parse(payload)
    const url = new URL(`${API_URL}/guru/learning/${conversationId}/stream`)
    url.searchParams.set('payload', JSON.stringify(validatedPayload))
    url.searchParams.set('rid', rid)
    
    const source = new EventSource(url.toString(), {
      withCredentials: true,
    })
    streamRef.current = source

    // Handle system_prompt event
    source.addEventListener('system_prompt', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data as string) as { system_prompt?: string }
        setSystemPrompt(payload.system_prompt ?? '')
        // Update current interaction metadata
        setInteractions((prev) =>
          prev.map((interaction) =>
            interaction.id === interactionId
              ? { ...interaction, metadata: { ...interaction.metadata, systemPrompt: payload.system_prompt } }
              : interaction
          )
        )
      } catch (e) {
        console.error('failed to parse system_prompt', e)
      }
    })

    // Handle history_retrieved event
    source.addEventListener('history_retrieved', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data as string) as { history?: string }
        // Update current interaction metadata
        setInteractions((prev) =>
          prev.map((interaction) =>
            interaction.id === interactionId
              ? { ...interaction, metadata: { ...interaction.metadata, retrievedHistory: payload.history } }
              : interaction
          )
        )
      } catch (e) {
        console.error('failed to parse history_retrieved', e)
      }
    })

    // Tokens / chunks (default SSE "message" event)
    source.onmessage = (event) => {
      if (requestIdRef.current !== rid) return
      setStreamingContent((prev) => prev + (event.data as string))
      if (!loading) return
      setLoading(false)
    }

    // Server sends: event: end  data: END
    source.addEventListener('end', () => {
      if (requestIdRef.current !== rid) return
      source.close()
      if (streamRef.current === source) streamRef.current = null
      inFlightRef.current = false
      setLoading(false)
      setStreamingContent('')
      currentInteractionIdRef.current = null
      refreshMessages()
    })

    source.onerror = (event) => {
      console.error('stream error', event)
      source.close()
      if (streamRef.current === source) streamRef.current = null
      inFlightRef.current = false
      setLoading(false)
      setStreamingContent('')
      currentInteractionIdRef.current = null
    }

    setMessage('')
  }

  const canSend = useMemo(() => message.trim().length > 0 && !loading && conversationId !== null, [message, loading, conversationId])

  // Combine interactions with streaming content
  const displayInteractions = useMemo(() => {
    const result = [...interactions]
    
    // If streaming, update the last interaction or create a streaming one
    if (streamingContent && currentInteractionIdRef.current) {
      const lastIndex = result.length - 1
      if (lastIndex >= 0 && result[lastIndex].id === currentInteractionIdRef.current) {
        // Update existing interaction with streaming content
        result[lastIndex] = {
          ...result[lastIndex],
          assistantMessage: {
            id: '__streaming__',
            conversation_id: conversationId || '',
            role: 'assistant',
            content: streamingContent,
            seq: result[lastIndex].userMessage.seq + 1,
            created_at: new Date().toISOString(),
          },
          isStreaming: true,
        }
      }
    }
    
    return result
  }, [interactions, streamingContent, conversationId])

  const selectedInteraction = useMemo(() => {
    if (!selectedInteractionId) return null
    return displayInteractions.find((i) => i.id === selectedInteractionId) || null
  }, [selectedInteractionId, displayInteractions])

  return (
    <div className="h-[calc(100vh-120px)] w-full">
      <div className="flex h-full flex-col rounded-lg border-2 border-blue-300 bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-blue-200 bg-blue-50 px-4 py-3">
          <div>
            <div className="text-lg font-bold text-blue-900">🎓 Learning Session</div>
            <div className="text-sm text-blue-700">
              {conversationId ? `Conversation: ${conversationId.slice(0, 8)}...` : 'No conversation'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOptions(true)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Chat Options
            </button>
            <button
              type="button"
              onClick={() => navigate('/courses')}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Back to Courses
            </button>
          </div>
        </div>

        {/* Message History */}
        <div ref={historyContainerRef} className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {!conversationId ? (
            <div className="text-sm text-gray-500">Loading conversation...</div>
          ) : displayInteractions.length === 0 ? (
            <div className="text-sm text-gray-500">(no messages yet)</div>
          ) : (
            <div className="space-y-4">
              {displayInteractions.map((interaction) => {
                const isStreaming = interaction.isStreaming
                return (
                  <div
                    key={interaction.id}
                    className="rounded-lg border-2 border-gray-200 bg-white shadow-sm"
                  >
                    {/* User Message Card */}
                    <div className="rounded-t-lg border-b border-gray-200 bg-blue-50 p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">You</span>
                            <span className="text-xs text-gray-500">
                              {new Date(interaction.metadata.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-sm text-gray-900">{interaction.userMessage.content}</div>
                        </div>
                      </div>
                    </div>

                    {/* Assistant Message Card */}
                    {interaction.assistantMessage && (
                      <div className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tutor</span>
                              {isStreaming && (
                                <span className="text-xs text-gray-400">Streaming...</span>
                              )}
                            </div>
                            <div className="whitespace-pre-wrap text-sm text-gray-900">
                              {interaction.assistantMessage.content}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedInteractionId(interaction.id)}
                            className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Options
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={historyEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200 px-4 py-3">
          <div className="flex gap-2">
            <textarea
              className="min-h-[80px] flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (canSend) handleSubmit()
                }
              }}
              placeholder="Ask your tutor a question..."
            />
            <button
              onClick={handleSubmit}
              disabled={!canSend}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* Interaction Options Modal */}
      {selectedInteraction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setSelectedInteractionId(null)}>
          <div className="w-full max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Interaction Options</h2>
              <button
                type="button"
                onClick={() => setSelectedInteractionId(null)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">Interaction ID</label>
                <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-xs text-gray-900">
                  {selectedInteraction.id}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">Timestamp</label>
                <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-900">
                  {new Date(selectedInteraction.metadata.timestamp).toLocaleString()}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">User Message</label>
                <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900">
                  {selectedInteraction.userMessage.content}
                </div>
              </div>

              {selectedInteraction.assistantMessage && (
                <div>
                  <label className="text-sm font-semibold text-gray-700">Assistant Response</label>
                  <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 whitespace-pre-wrap">
                    {selectedInteraction.assistantMessage.content}
                  </div>
                </div>
              )}

              {selectedInteraction.metadata.retrievedHistory && (
                <div>
                  <label className="text-sm font-semibold text-gray-700">
                    🔍 Retrieved History (from semantic search)
                  </label>
                  <div className="mt-1 max-h-[300px] overflow-auto rounded-md border border-purple-200 bg-purple-50 p-3">
                    <pre className="whitespace-pre-wrap text-xs text-gray-700">
                      {selectedInteraction.metadata.retrievedHistory}
                    </pre>
                  </div>
                </div>
              )}

              {selectedInteraction.metadata.systemPrompt && (
                <div>
                  <label className="text-sm font-semibold text-gray-700">System Prompt</label>
                  <div className="mt-1 max-h-[300px] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3">
                    <pre className="whitespace-pre-wrap text-xs text-gray-900">
                      {selectedInteraction.metadata.systemPrompt}
                    </pre>
                  </div>
                </div>
              )}

              {!selectedInteraction.metadata.retrievedHistory && !selectedInteraction.metadata.systemPrompt && (
                <div className="text-sm text-gray-500 italic">
                  No additional metadata available for this interaction.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Chat Options Modal */}
      {showOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setShowOptions(false)}>
          <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Chat Options</h2>
              <button
                type="button"
                onClick={() => setShowOptions(false)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">Conversation ID</label>
                <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-xs text-gray-900">
                  {conversationId || '(none)'}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">Agent Role</label>
                <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-900">
                  Tutor (Learning Session)
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">System Prompt</label>
                {systemPrompt ? (
                  <pre className="mt-1 max-h-[400px] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs whitespace-pre-wrap text-gray-900">
                    {systemPrompt}
                  </pre>
                ) : (
                  <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500">
                    (System prompt will appear here after first message)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LearningSessionChat
