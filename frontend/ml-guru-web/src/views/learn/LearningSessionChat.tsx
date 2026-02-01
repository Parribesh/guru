import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_URL } from '../../config/config'
import { axiosInstance } from '../../config/axiosConfig'
import { chatRequestSchema } from '../../schemas/restSchemas'
import { fetchConversationMessages, type Message } from '../../api/chat_api'
import type { Interaction } from './types'
import { buildInteractionsFromMessages, buildChatInteractionsFromMessages } from './utils'
import LearningSessionHeader from './LearningSessionHeader'
import LessonContent from './LessonContent'
import type { LearningContext } from './LessonContent'
import ChatSidebar from './ChatSidebar'
import InteractionOptionsModal from './InteractionOptionsModal'
import AgentStateModal from './AgentStateModal'
import ModuleProgressModal from './ModuleProgressModal'

export default function LearningSessionChat() {
  const [chatMessage, setChatMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [chatConversationId, setChatConversationId] = useState<string | null>(null)
  const [learningContext, setLearningContext] = useState<LearningContext | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [moduleId, setModuleId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [chatStreamingContent, setChatStreamingContent] = useState<string>('')
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [showOptions, setShowOptions] = useState(false)
  const [showModuleProgress, setShowModuleProgress] = useState(false)
  const [completeLoading, setCompleteLoading] = useState(false)
  const [agentContext, setAgentContext] = useState<Record<string, unknown> | null>(null)
  const [agentContextLoading, setAgentContextLoading] = useState(false)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [chatInteractions, setChatInteractions] = useState<Interaction[]>([])
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null)
  const [lessonMessagesLoaded, setLessonMessagesLoaded] = useState(false)

  const streamRef = useRef<EventSource | null>(null)
  const inFlightRef = useRef(false)
  const requestIdRef = useRef<string | null>(null)
  /** conversationId we've already sent the initial tutor introduce message for */
  const sentInitialTutorForRef = useRef<string | null>(null)
  const currentInteractionIdRef = useRef<string | null>(null)
  const currentChatInteractionIdRef = useRef<string | null>(null)
  const preservedLessonMetadataRef = useRef<{ retrievedHistory?: string; systemPrompt?: string } | null>(null)
  const preservedChatMetadataRef = useRef<{ retrievedHistory?: string; systemPrompt?: string } | null>(null)
  const navigate = useNavigate()
  const params = useParams<{ conversationId: string }>()

  const lessonContentEndRef = useRef<HTMLDivElement>(null)
  const chatHistoryEndRef = useRef<HTMLDivElement>(null)
  const chatHistoryContainerRef = useRef<HTMLDivElement>(null)

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

  // Load conversation from URL params (lesson conversation)
  useEffect(() => {
    if (params.conversationId) {
      setConversationId(params.conversationId)
    } else {
      navigate('/courses', { replace: true })
    }
  }, [params.conversationId, navigate])

  // Fetch session context: session_id, chat_conversation_id, learning context (concept/module/progress)
  const fetchLearningContext = useCallback(() => {
    if (!conversationId) return
    axiosInstance
      .get(`/guru/learning/${conversationId}/context`)
      .then((res) => {
        const ctx = res.data as {
          session?: { id?: string; chat_conversation_id?: string }
          session_metadata?: { user_name?: string }
          module?: {
            id?: string
            current_objective?: string
            title?: string
            objectives?: string[]
            current_objective_index?: number
            progress?: {
              best_score: number
              attempts_count: number
              passed: boolean
              completed_objectives: number[]
            }
          }
          course?: { title?: string }
        }
        const chatId = ctx?.session?.chat_conversation_id ?? null
        const sid = ctx?.session?.id ?? null
        const mid = ctx?.module?.id ?? null
        setChatConversationId(chatId)
        setSessionId(sid)
        setModuleId(mid)
        if (ctx?.module) {
          const objectives = ctx.module.objectives ?? []
          const total = objectives.length
          const idx = ctx.module.current_objective_index ?? 0
          setLearningContext({
            current_objective: ctx.module.current_objective,
            module_title: ctx.module.title,
            course_title: ctx.course?.title,
            current_concept_index: idx,
            concepts_total: total,
            concept_position_label: total > 0 ? `${idx + 1} of ${total}` : undefined,
            progress: ctx.module.progress,
            objectives,
          })
        } else {
          setLearningContext(null)
        }
      })
      .catch((e) => console.error('failed to load session context', e))
  }, [conversationId])

  useEffect(() => {
    fetchLearningContext()
  }, [fetchLearningContext])

  const handleCompleteObjective = useCallback(() => {
    if (!sessionId) return
    setCompleteLoading(true)
    axiosInstance
      .post(`/guru/sessions/${sessionId}/complete-objective`)
      .then(() => {
        // Create new session for next concept (same module; backend picks next objective)
        if (!moduleId) {
          fetchLearningContext()
          return
        }
        return axiosInstance
          .post(`/guru/sessions?session_type=learning&module_id=${encodeURIComponent(moduleId)}`)
          .then((res) => {
            const data = res.data as { conversation_id?: string }
            const nextConversationId = data?.conversation_id
            if (nextConversationId) {
              navigate(`/learn/${nextConversationId}`, { replace: true })
            } else {
              fetchLearningContext()
            }
          })
          .catch((e) => {
            // All objectives done (400) or other error: just refresh current context
            if (e?.response?.status === 400 && e?.response?.data?.detail?.includes('Take the module test')) {
              // Optionally show message: all concepts done, take module test
            }
            fetchLearningContext()
          })
      })
      .catch((e) => console.error('failed to complete objective', e))
      .finally(() => setCompleteLoading(false))
  }, [sessionId, moduleId, fetchLearningContext, navigate])

  // Load lesson messages when conversation (lesson) changes
  useEffect(() => {
    if (!conversationId) {
      setSystemPrompt('')
      setInteractions([])
      setLessonMessagesLoaded(false)
      return
    }
    setLessonMessagesLoaded(false)
    fetchConversationMessages(conversationId)
      .then((msgs) => {
        const sysMsg = msgs.find((m) => m.role === 'system')
        if (sysMsg) setSystemPrompt(sysMsg.content)
        setInteractions((prev) => buildInteractionsFromMessages(msgs, prev))
      })
      .catch((e) => console.error('failed to fetch messages', e))
      .finally(() => setLessonMessagesLoaded(true))
  }, [conversationId])

  // Load chat (Q&A) messages when chat conversation is available
  useEffect(() => {
    if (!chatConversationId) {
      setChatMessages([])
      setChatInteractions([])
      return
    }
    fetchConversationMessages(chatConversationId)
      .then((msgs) => {
        setChatMessages(msgs)
        setChatInteractions(buildChatInteractionsFromMessages(msgs))
      })
      .catch((e) => console.error('failed to fetch chat messages', e))
  }, [chatConversationId])

  // When session starts with no lesson messages, ask tutor to introduce the user to the concept
  useEffect(() => {
    if (
      !conversationId ||
      !lessonMessagesLoaded ||
      interactions.length > 0 ||
      sentInitialTutorForRef.current === conversationId ||
      !learningContext?.current_objective
    ) {
      return
    }
    sentInitialTutorForRef.current = conversationId
    inFlightRef.current = true
    const introduceMessage = `Introduce the concept "${learningContext.current_objective}" with a short paragraph about the topic.`
    const rid = newRequestId()
    requestIdRef.current = rid
    const interactionId = newRequestId()
    const userMessage: Message = {
      id: `temp_${Date.now()}`,
      conversation_id: conversationId,
      role: 'user',
      content: introduceMessage,
      seq: 1,
      created_at: new Date().toISOString(),
    }
    const newInteraction = {
      id: interactionId,
      userMessage,
      assistantMessage: null as Message | null,
      metadata: { timestamp: userMessage.created_at },
      isStreaming: true as const,
    }
    setLoading(true)
    setStreamingContent('')
    currentInteractionIdRef.current = interactionId
    setInteractions([newInteraction])
    const payload = { message: introduceMessage, conversation_id: conversationId }
    const validatedPayload = chatRequestSchema.parse(payload)
    const url = new URL(`${API_URL}/guru/learning/tutor/${conversationId}/stream`)
    url.searchParams.set('payload', JSON.stringify(validatedPayload))
    url.searchParams.set('rid', rid)
    const source = new EventSource(url.toString(), { withCredentials: true })
    streamRef.current = source
    preservedLessonMetadataRef.current = {}
    source.addEventListener('system_prompt', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data as string) as { system_prompt?: string }
        setSystemPrompt(data.system_prompt ?? '')
        preservedLessonMetadataRef.current!.systemPrompt = data.system_prompt
        setInteractions((prev) =>
          prev.map((i) =>
            i.id === interactionId ? { ...i, metadata: { ...i.metadata, systemPrompt: data.system_prompt } } : i
          )
        )
      } catch (e) {
        console.error('failed to parse system_prompt', e)
      }
    })
    source.addEventListener('history_retrieved', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data as string) as { history?: string }
        preservedLessonMetadataRef.current!.retrievedHistory = data.history
        setInteractions((prev) =>
          prev.map((i) =>
            i.id === interactionId ? { ...i, metadata: { ...i.metadata, retrievedHistory: data.history } } : i
          )
        )
      } catch (e) {
        console.error('failed to parse history_retrieved', e)
      }
    })
    source.onmessage = (event) => {
      if (requestIdRef.current !== rid) return
      const chunk = event.data as string
      setStreamingContent((prev) => prev + chunk)
      setLoading(false)
    }
    source.addEventListener('end', () => {
      if (requestIdRef.current !== rid) return
      source.close()
      if (streamRef.current === source) streamRef.current = null
      inFlightRef.current = false
      setLoading(false)
      setStreamingContent('')
      const preservedMetadata = preservedLessonMetadataRef.current
      refreshMessages()
      if (preservedMetadata?.retrievedHistory || preservedMetadata?.systemPrompt) {
        setTimeout(() => {
          setInteractions((prev) =>
            prev.map((i) => {
              if (i.id !== interactionId) return i
              return {
                ...i,
                metadata: {
                  ...i.metadata,
                  retrievedHistory: i.metadata.retrievedHistory ?? preservedMetadata?.retrievedHistory,
                  systemPrompt: i.metadata.systemPrompt ?? preservedMetadata?.systemPrompt,
                },
              }
            })
          )
        }, 200)
      }
      preservedLessonMetadataRef.current = null
      currentInteractionIdRef.current = null
    })
    source.onerror = () => {
      source.close()
      if (streamRef.current === source) streamRef.current = null
      inFlightRef.current = false
      setLoading(false)
      setStreamingContent('')
      currentInteractionIdRef.current = null
    }
  }, [conversationId, lessonMessagesLoaded, interactions.length, learningContext?.current_objective])

  // Auto-scroll lesson content when tutor response updates
  useEffect(() => {
    lessonContentEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [interactions.length, streamingContent])

  // Auto-scroll chat sidebar when messages or streaming change
  useEffect(() => {
    chatHistoryEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatInteractions.length, chatStreamingContent])

  const refreshChatMessages = () => {
    if (!chatConversationId) return
    fetchConversationMessages(chatConversationId)
      .then((msgs) => {
        setChatMessages(msgs)
        setChatInteractions(buildChatInteractionsFromMessages(msgs))
      })
      .catch((e) => console.error('failed to refresh chat messages', e))
  }

  const refreshMessages = () => {
    if (!conversationId) return
    fetchConversationMessages(conversationId)
      .then((msgs) => {
        setInteractions((prev) => buildInteractionsFromMessages(msgs, prev))
      })
      .catch((e) => console.error('failed to fetch messages', e))
  }

  const runStream = (
    trimmed: string,
    targetConvId: string,
    isChat: boolean,
    interactionId: string,
    rid: string,
    newInteraction: { id: string; userMessage: Message; assistantMessage: Message | null; metadata: { timestamp: string }; isStreaming: true }
  ) => {
    if (inFlightRef.current && streamRef.current) {
      streamRef.current.close()
      streamRef.current = null
    }
    inFlightRef.current = true
    if (isChat) {
      setChatLoading(true)
      setChatStreamingContent('')
      currentChatInteractionIdRef.current = interactionId
      setChatInteractions((prev) => [...prev, newInteraction])
    } else {
      setLoading(true)
      setStreamingContent('')
      currentInteractionIdRef.current = interactionId
      setInteractions((prev) => [...prev, newInteraction])
    }

    const payload = { message: trimmed, conversation_id: targetConvId }
    const validatedPayload = chatRequestSchema.parse(payload)
    const streamPath = isChat ? 'chat' : 'tutor'
    const url = new URL(`${API_URL}/guru/learning/${streamPath}/${targetConvId}/stream`)
    url.searchParams.set('payload', JSON.stringify(validatedPayload))
    url.searchParams.set('rid', rid)
    const source = new EventSource(url.toString(), { withCredentials: true })
    streamRef.current = source

    if (isChat) preservedChatMetadataRef.current = {}
    else preservedLessonMetadataRef.current = {}

    source.addEventListener('system_prompt', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data as string) as { system_prompt?: string }
        if (!isChat) setSystemPrompt(data.system_prompt ?? '')
        if (isChat) preservedChatMetadataRef.current!.systemPrompt = data.system_prompt
        else preservedLessonMetadataRef.current!.systemPrompt = data.system_prompt
        const updater = (i: Interaction) =>
          i.id === interactionId ? { ...i, metadata: { ...i.metadata, systemPrompt: data.system_prompt } } : i
        if (isChat) setChatInteractions((prev) => prev.map(updater))
        else setInteractions((prev) => prev.map(updater))
      } catch (e) {
        console.error('failed to parse system_prompt', e)
      }
    })

    source.addEventListener('history_retrieved', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data as string) as { history?: string }
        if (isChat) preservedChatMetadataRef.current!.retrievedHistory = data.history
        else preservedLessonMetadataRef.current!.retrievedHistory = data.history
        const updater = (i: Interaction) =>
          i.id === interactionId ? { ...i, metadata: { ...i.metadata, retrievedHistory: data.history } } : i
        if (isChat) setChatInteractions((prev) => prev.map(updater))
        else setInteractions((prev) => prev.map(updater))
      } catch (e) {
        console.error('failed to parse history_retrieved', e)
      }
    })

    source.onmessage = (event) => {
      if (requestIdRef.current !== rid) return
      const chunk = event.data as string
      if (isChat) {
        setChatStreamingContent((prev) => prev + chunk)
        setChatLoading(false)
      } else {
        setStreamingContent((prev) => prev + chunk)
        setLoading(false)
      }
    }

    source.addEventListener('end', () => {
      if (requestIdRef.current !== rid) return
      source.close()
      if (streamRef.current === source) streamRef.current = null
      inFlightRef.current = false
      if (isChat) {
        setChatLoading(false)
        setChatStreamingContent('')
        const preservedMetadata = preservedChatMetadataRef.current
        refreshChatMessages()
        if (preservedMetadata?.retrievedHistory || preservedMetadata?.systemPrompt) {
          setTimeout(() => {
            setChatInteractions((prev) =>
              prev.map((i) => {
                if (i.id !== interactionId) return i
                const need =
                  (!i.metadata.retrievedHistory && preservedMetadata.retrievedHistory) ||
                  (!i.metadata.systemPrompt && preservedMetadata.systemPrompt)
                if (!need) return i
                return {
                  ...i,
                  metadata: {
                    ...i.metadata,
                    retrievedHistory: i.metadata.retrievedHistory ?? preservedMetadata.retrievedHistory,
                    systemPrompt: i.metadata.systemPrompt ?? preservedMetadata.systemPrompt,
                  },
                }
              })
            )
          }, 200)
        }
        preservedChatMetadataRef.current = null
        currentChatInteractionIdRef.current = null
      } else {
        setLoading(false)
        setStreamingContent('')
        const preservedMetadata = preservedLessonMetadataRef.current
        refreshMessages()
        if (preservedMetadata?.retrievedHistory || preservedMetadata?.systemPrompt) {
          setTimeout(() => {
            setInteractions((prev) =>
              prev.map((i) => {
                if (i.id !== interactionId) return i
                const need =
                  (!i.metadata.retrievedHistory && preservedMetadata.retrievedHistory) ||
                  (!i.metadata.systemPrompt && preservedMetadata.systemPrompt)
                if (!need) return i
                return {
                  ...i,
                  metadata: {
                    ...i.metadata,
                    retrievedHistory: i.metadata.retrievedHistory ?? preservedMetadata.retrievedHistory,
                    systemPrompt: i.metadata.systemPrompt ?? preservedMetadata.systemPrompt,
                  },
                }
              })
            )
          }, 200)
        }
        preservedLessonMetadataRef.current = null
        currentInteractionIdRef.current = null
      }
    })

    source.onerror = () => {
      source.close()
      if (streamRef.current === source) streamRef.current = null
      inFlightRef.current = false
      if (isChat) {
        setChatLoading(false)
        setChatStreamingContent('')
        currentChatInteractionIdRef.current = null
      } else {
        setLoading(false)
        setStreamingContent('')
        currentInteractionIdRef.current = null
      }
    }
  }

  const handleChatSubmit = () => {
    const trimmed = chatMessage.trim()
    if (!trimmed || !chatConversationId) return
    const rid = newRequestId()
    requestIdRef.current = rid
    const interactionId = newRequestId()
    const userMessage: Message = {
      id: `temp_${Date.now()}`,
      conversation_id: chatConversationId,
      role: 'user',
      content: trimmed,
      seq: chatMessages.length + 1,
      created_at: new Date().toISOString(),
    }
    const newInteraction = {
      id: interactionId,
      userMessage,
      assistantMessage: null as Message | null,
      metadata: { timestamp: userMessage.created_at },
      isStreaming: true as const,
    }
    runStream(trimmed, chatConversationId, true, interactionId, rid, newInteraction)
    setChatMessage('')
  }

  const canSendChat = useMemo(
    () => chatMessage.trim().length > 0 && !chatLoading && chatConversationId !== null,
    [chatMessage, chatLoading, chatConversationId]
  )

  // Fetch session context (tutor agent state) when opening Chat Options
  useEffect(() => {
    if (!showOptions || !conversationId) return
    setAgentContextLoading(true)
    axiosInstance
      .get(`/guru/learning/${conversationId}/context`)
      .then((res) => setAgentContext((res.data ?? {}) as Record<string, unknown>))
      .catch((e) => {
        console.error('Failed to load agent context', e)
        setAgentContext(null)
      })
      .finally(() => setAgentContextLoading(false))
  }, [showOptions, conversationId])

  // Chat sidebar: interactions + current streaming
  const displayChatInteractions = useMemo(() => {
    const result = [...chatInteractions]
    const streamRefId = currentChatInteractionIdRef.current
    if (chatStreamingContent && streamRefId && result.length > 0 && result[result.length - 1].id === streamRefId) {
      const last = result.length - 1
      result[last] = {
        ...result[last],
        assistantMessage: {
          id: '__streaming__',
          conversation_id: chatConversationId || '',
          role: 'assistant',
          content: chatStreamingContent,
          seq: result[last].userMessage.seq + 1,
          created_at: new Date().toISOString(),
        },
        isStreaming: true,
      }
    }
    return result
  }, [chatInteractions, chatStreamingContent, chatConversationId])

  const selectedInteraction = useMemo(() => {
    if (!selectedInteractionId) return null
    return displayChatInteractions.find((i) => i.id === selectedInteractionId) ?? null
  }, [selectedInteractionId, displayChatInteractions])

  return (
    <div className="h-[calc(100vh-120px)] w-full">
      <div className="flex h-full flex-col rounded-lg border-2 border-blue-300 bg-white shadow-lg">
        <LearningSessionHeader
          learningContext={learningContext}
          onShowAgentState={() => setShowOptions(true)}
          onShowModuleProgress={() => setShowModuleProgress(true)}
          onBackToCourses={() => navigate('/courses')}
        />
        <div className="flex min-h-0 flex-1">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-gray-200">
            <LessonContent
              learningContext={learningContext}
              conversationId={conversationId}
              lessonInteractions={interactions}
              streamingContent={streamingContent}
              isStreaming={loading}
              contentEndRef={lessonContentEndRef}
              sessionId={sessionId}
              onCompleteObjective={handleCompleteObjective}
              completeLoading={completeLoading}
            />
          </main>
          <ChatSidebar
            chatConversationId={chatConversationId}
            displayInteractions={displayChatInteractions}
            containerRef={chatHistoryContainerRef}
            endRef={chatHistoryEndRef}
            onSelectInteraction={setSelectedInteractionId}
            chatMessage={chatMessage}
            onChatMessageChange={setChatMessage}
            canSendChat={canSendChat}
            chatSending={chatLoading}
            onChatSubmit={handleChatSubmit}
          />
        </div>
      </div>
      <InteractionOptionsModal
        interaction={selectedInteraction}
        onClose={() => setSelectedInteractionId(null)}
      />
      <AgentStateModal
        open={showOptions}
        onClose={() => setShowOptions(false)}
        conversationId={conversationId}
        agentContext={agentContext}
        agentContextLoading={agentContextLoading}
        systemPrompt={systemPrompt}
        chatConversationId={chatConversationId}
        learningContext={learningContext}
        lessonInteractions={interactions}
        chatInteractions={chatInteractions}
      />
      <ModuleProgressModal
        open={showModuleProgress}
        onClose={() => setShowModuleProgress(false)}
        learningContext={learningContext}
      />
    </div>
  )
}
