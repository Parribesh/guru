import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_URL } from '../../config/config'
import { chatRequestSchema } from '../../schemas/restSchemas'
import { fetchConversationMessages, type Message } from '../../api/chat_api'

export const LearningSessionChat = () => {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [showOptions, setShowOptions] = useState(false)
  const [retrievedHistory, setRetrievedHistory] = useState<string | null>(null)
  
  const streamRef = useRef<EventSource | null>(null)
  const inFlightRef = useRef(false)
  const requestIdRef = useRef<string | null>(null)
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
      })
      .catch((e) => console.error('failed to fetch messages', e))
  }, [conversationId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!historyEndRef.current) return
    historyEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, streamingContent])

  const refreshMessages = () => {
    if (!conversationId) return
    fetchConversationMessages(conversationId)
      .then(setMessages)
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
      } catch (e) {
        console.error('failed to parse system_prompt', e)
      }
    })

    // Handle history_retrieved event
    source.addEventListener('history_retrieved', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data as string) as { history?: string }
        setRetrievedHistory(payload.history ?? null)
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
      setRetrievedHistory(null)  // Clear history display after response
      refreshMessages()
    })

    source.onerror = (event) => {
      console.error('stream error', event)
      source.close()
      if (streamRef.current === source) streamRef.current = null
      inFlightRef.current = false
      setLoading(false)
      setStreamingContent('')
    }

    setMessage('')
  }

  const canSend = useMemo(() => message.trim().length > 0 && !loading && conversationId !== null, [message, loading, conversationId])

  // Combine persisted messages with streaming content (exclude system messages from display)
  const displayMessages = useMemo(() => {
    // Filter out system messages from display (they're shown in options modal)
    const visibleMessages = messages.filter((m) => m.role !== 'system')
    // If we're streaming, add a temporary assistant message with streaming content
    if (streamingContent) {
      visibleMessages.push({
        id: '__streaming__',
        conversation_id: conversationId || '',
        role: 'assistant',
        content: streamingContent,
        seq: visibleMessages.length + 1,
        created_at: new Date().toISOString(),
      })
    }
    return visibleMessages
  }, [messages, streamingContent, conversationId])

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
          ) : displayMessages.length === 0 && !retrievedHistory ? (
            <div className="text-sm text-gray-500">(no messages yet)</div>
          ) : (
            <div className="space-y-3">
              {/* History Retrieval Display */}
              {retrievedHistory && (
                <div className="mb-4 rounded-lg border-2 border-purple-300 bg-purple-50 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-semibold text-purple-900">🔍 History Retrieved</span>
                    <span className="text-xs text-purple-600">(from semantic search)</span>
                  </div>
                  <div className="max-h-[200px] overflow-auto rounded-md border border-purple-200 bg-white p-2">
                    <pre className="whitespace-pre-wrap text-xs text-gray-700">{retrievedHistory}</pre>
                  </div>
                </div>
              )}
              {displayMessages.map((m) => {
                const isStreaming = m.id === '__streaming__'
                return (
                  <div
                    key={m.id}
                    className={[
                      'rounded-lg border p-3',
                      m.role === 'user' ? 'ml-auto max-w-[80%] border-blue-200 bg-blue-50' : 'mr-auto max-w-[80%] border-gray-200 bg-gray-50',
                      isStreaming ? 'opacity-75' : '',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Tutor' : m.role}
                      </div>
                      {isStreaming && (
                        <div className="text-xs text-gray-400">Streaming...</div>
                      )}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{m.content}</div>
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

      {/* Options Modal */}
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

