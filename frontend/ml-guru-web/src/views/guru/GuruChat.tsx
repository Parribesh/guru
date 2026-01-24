import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_URL } from '../../config/config'
import { chatRequestSchema } from '../../schemas/restSchemas'
import { fetchConversationMessages, forkConversation, listConversations, type Conversation, type Message } from '../../api/chat_api'
export const GuruChat = () => {
    const [message, setMessage] = useState('')
    const [response, setResponse] = useState("")
    const [loading, setLoading] = useState(false)
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [messages, setMessages] = useState<Message[]>([])
    const textRef = useRef<HTMLPreElement>(null)
    const streamRef = useRef<EventSource | null>(null)
    const inFlightRef = useRef(false)
    const requestIdRef = useRef<string | null>(null)
    const navigate = useNavigate()
    const params = useParams<{ conversationId?: string }>()

    const historyEndRef = useRef<HTMLDivElement>(null)
    const historyContainerRef = useRef<HTMLDivElement>(null)

    const newRequestId = () => {
        // Browser-native UUID (no dependency). Vite/modern browsers support this.
        return crypto.randomUUID()
    }
    useEffect(() => {
        if (!textRef.current) return
        textRef.current.scrollTop = textRef.current.scrollHeight
    }, [response])

    // Ensure any open SSE connection is closed on unmount / hot-reload remounts.
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

    useEffect(() => {
        listConversations()
            .then((cs) => {
                setConversations(cs)
                // If URL specifies a conversation, honor it; otherwise default to the most recent.
                if (params.conversationId) {
                    setConversationId(params.conversationId)
                } else if (cs.length > 0) {
                    setConversationId(cs[0].id)
                    navigate(`/chat/${cs[0].id}`, { replace: true })
                }
            })
            .catch((e) => console.error('failed to list conversations', e))
    }, [navigate, params.conversationId])

    // Keep URL in sync when conversation changes (deep-linkable sessions).
    useEffect(() => {
        if (!conversationId) return
        if (params.conversationId === conversationId) return
        navigate(`/chat/${conversationId}`, { replace: false })
    }, [conversationId, navigate, params.conversationId])

    useEffect(() => {
        if (!conversationId) {
            setMessages([])
            return
        }
        fetchConversationMessages(conversationId)
            .then(setMessages)
            .catch((e) => console.error('failed to fetch messages', e))
    }, [conversationId])

    useEffect(() => {
        // Auto-scroll timeline to bottom when it changes.
        if (!historyEndRef.current) return
        historyEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [messages.length])

    const refreshCurrentConversation = () => {
        if (!conversationId) return
        fetchConversationMessages(conversationId)
            .then(setMessages)
            .catch((e) => console.error('failed to fetch messages', e))
    }

    const refreshConversationList = () => {
        listConversations()
            .then(setConversations)
            .catch((e) => console.error('failed to list conversations', e))
    }

    const handleSubmit = async () => {
            const trimmed = message.trim()
            if (!trimmed) return

            // Prevent accidental double-submits. If you want "latest wins", we close the previous stream.
            if (inFlightRef.current && streamRef.current) {
                streamRef.current.close()
                streamRef.current = null
            }

            inFlightRef.current = true
            setLoading(true)
            setResponse("")
            const rid = newRequestId()
            requestIdRef.current = rid

            const payload = {
                message: trimmed,
                conversation_id: conversationId || null,
            }
            const validatedPayload = chatRequestSchema.parse(payload)
            const url = new URL(`${API_URL}/guru/chat/stream`)
            url.searchParams.set('payload', JSON.stringify(validatedPayload))
            // EventSource can't set headers; send request id as query param so backend can correlate logs.
            url.searchParams.set('rid', rid)
            const source = new EventSource(url.toString(), {
                withCredentials: true,
            })
            streamRef.current = source

            // If the server created a new conversation, it will emit this event once.
            source.addEventListener('conversation', (event) => {
                const newId = (event as MessageEvent).data as string
                setConversationId(newId)
                listConversations()
                    .then(setConversations)
                    .catch((e) => console.error('failed to list conversations', e))
            })

            // Tokens / chunks (default SSE "message" event)
            source.onmessage = (event) => {
                // Ignore late events from a previous request.
                if (requestIdRef.current !== rid) return
                setResponse((prev) => prev + (event.data as string))
                // Ensure output is visible immediately; "loading" just means "stream in progress".
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
                refreshCurrentConversation()
                listConversations()
                    .then(setConversations)
                    .catch((e) => console.error('failed to list conversations', e))
            })
            source.onerror = (event) => {
                console.error(event)
                source.close()
                if (streamRef.current === source) streamRef.current = null
                inFlightRef.current = false
                setLoading(false)
            }
        }

    const canSend = useMemo(() => message.trim().length > 0 && !loading, [message, loading])

    const handleFork = async (fromMessageId: string) => {
        if (!conversationId) return
        try {
            const newId = await forkConversation(conversationId, fromMessageId)
            setConversationId(newId)
            refreshConversationList()
        } catch (e) {
            console.error('fork failed', e)
        }
    }

    const handleNewConversation = () => {
        // Setting this to null causes /chat/stream to create a new conversation and emit the id via SSE.
        setConversationId(null)
        navigate('/chat', { replace: false })
        setMessages([])
        setResponse("")
        setMessage("")
    }

    return (
        <div className="h-[calc(100vh-120px)] w-full">
            <div className="flex h-full gap-4">
                {/* Main: history */}
                <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-200 px-4 py-3">
                        <div className="text-lg font-semibold">History</div>
                        <div className="text-sm text-gray-500">Conversation timeline</div>
                    </div>

                    <div ref={historyContainerRef} className="min-h-0 flex-1 overflow-auto px-4 py-4">
                        {!conversationId ? (
                            <div className="text-sm text-gray-500">Pick a conversation or send a message to start one.</div>
                        ) : messages.length === 0 ? (
                            <div className="text-sm text-gray-500">(no messages yet)</div>
                        ) : (
                            <div className="space-y-3">
                                {messages.map((m) => (
                                    <div key={m.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{m.role}</div>
                                            {conversationId && (
                                                <button
                                                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                                    onClick={() => handleFork(m.id)}
                                                    type="button"
                                                >
                                                    Fork
                                                </button>
                                            )}
                                        </div>
                                        <div className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{m.content}</div>
                                    </div>
                                ))}
                                <div ref={historyEndRef} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar: composer + live stream */}
                <aside className="flex w-[360px] flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
                    <div>
                        <div className="text-lg font-semibold">Compose</div>
                        <div className="text-sm text-gray-500">Send a message (or create a new conversation)</div>
                    </div>

                    <div className="overflow-hidden">
                        <div className="mb-2 text-sm font-semibold text-gray-700">Live response</div>
                        <pre
                            ref={textRef}
                            className="max-h-[220px] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-900"
                            style={{ whiteSpace: 'pre-wrap' }}
                        >
                            {response || (loading ? 'Waiting for first token…' : '(no response yet)')}
                        </pre>
                    </div>

                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700">Conversations</label>
                        <button
                            type="button"
                            className="text-xs font-semibold text-gray-600 hover:text-gray-900"
                            onClick={refreshConversationList}
                        >
                            Refresh
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleNewConversation}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    >
                        + New conversation
                    </button>

                    <div className="max-h-[220px] overflow-auto rounded-md border border-gray-200">
                        {conversations.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500">(no conversations)</div>
                        ) : (
                            <div className="flex flex-col">
                                {conversations.map((c) => {
                                    const active = conversationId === c.id
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setConversationId(c.id)}
                                            className={[
                                                'w-full border-b border-gray-100 px-3 py-2 text-left text-sm',
                                                active ? 'bg-blue-50 font-semibold text-blue-900' : 'bg-white text-gray-900 hover:bg-gray-50',
                                            ].join(' ')}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span>{c.id.slice(0, 8)}</span>
                                                {c.parent_conversation_id ? <span className="text-xs text-gray-500">fork</span> : null}
                                            </div>
                                            {c.parent_conversation_id ? (
                                                <div className="mt-1 text-xs text-gray-500">
                                                    parent: {c.parent_conversation_id.slice(0, 8)}
                                                </div>
                                            ) : null}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <label className="text-sm font-medium text-gray-700">Message</label>
                    <textarea
                        className="min-h-[140px] resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type your question…"
                    />

                    <button
                        onClick={() => handleSubmit()}
                        disabled={!canSend}
                        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                        {loading ? 'Streaming…' : 'Send'}
                    </button>
                </aside>
            </div>
        </div>
    )
}

export default GuruChat