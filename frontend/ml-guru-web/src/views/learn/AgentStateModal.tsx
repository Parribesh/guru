import type { Interaction } from './types'

interface LearningContextForModal {
  current_objective?: string
  module_title?: string
  course_title?: string
}

interface AgentStateModalProps {
  open: boolean
  onClose: () => void
  conversationId: string | null
  agentContext: Record<string, unknown> | null
  agentContextLoading: boolean
  systemPrompt: string
  /** When present, show a second "Chat agent" section (learning session Q&A) */
  chatConversationId?: string | null
  learningContext?: LearningContextForModal | null
  /** Conversation history for the primary (tutor) agent */
  lessonInteractions?: Interaction[]
  /** Conversation history for the chat agent (when showChatSection) */
  chatInteractions?: Interaction[]
}

function buildChatSystemPromptDisplay(ctx: LearningContextForModal | null | undefined): string {
  if (!ctx) return ''
  const objective = ctx.current_objective ?? ''
  const moduleTitle = ctx.module_title ?? ''
  const courseLine = ctx.course_title ? `Course: ${ctx.course_title}. ` : ''
  return `You are a helpful Q&A assistant for a learning session. The user is learning: **${objective}** (module: ${moduleTitle}). ${courseLine}Answer questions about the topic and the session concisely. Stay on topic.`.trim()
}

function ConversationHistory({ interactions }: { interactions: Interaction[] }) {
  if (!interactions.length) {
    return (
      <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500">
        No messages yet
      </div>
    )
  }
  return (
    <div className="mt-1 max-h-[280px] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2 space-y-3">
      {interactions.map((ex, idx) => (
        <div key={ex.id ?? idx} className="border-b border-gray-200 pb-2 last:border-0 last:pb-0">
          <div className="text-xs font-semibold text-gray-500 mb-0.5">User</div>
          <div className="text-xs text-gray-900 whitespace-pre-wrap break-words">
            {ex.userMessage?.content ?? ''}
          </div>
          {ex.assistantMessage?.content != null && (
            <>
              <div className="text-xs font-semibold text-gray-500 mt-1.5 mb-0.5">Assistant</div>
              <div className="text-xs text-gray-800 whitespace-pre-wrap break-words">
                {ex.assistantMessage.content}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export default function AgentStateModal({
  open,
  onClose,
  conversationId,
  agentContext,
  agentContextLoading,
  systemPrompt,
  chatConversationId,
  learningContext,
  lessonInteractions = [],
  chatInteractions = [],
}: AgentStateModalProps) {
  if (!open) return null

  const agent = agentContext?.agent as { name?: string; metadata?: { system_prompt?: string }; model?: string } | undefined
  const agentName = agent?.name ?? 'Tutor'
  const agentModel = agent?.model ?? 'qwen:latest'
  const sp = agent?.metadata?.system_prompt ?? systemPrompt
  const showChatSection = Boolean(chatConversationId && learningContext)
  const chatSystemPrompt = buildChatSystemPromptDisplay(learningContext)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900">Agent state information</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 overflow-auto px-6 py-4">
          {agentContextLoading ? (
            <div className="text-sm text-gray-500">Loading agent context…</div>
          ) : (
            <div className="space-y-6">
              {/* Primary agent (Tutor for learning session) */}
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {agentName} agent
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Conversation ID
                    </label>
                    <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-xs text-gray-900">
                      {conversationId || '(none)'}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Agent name
                    </label>
                    <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-900">
                      {agentName}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Model
                    </label>
                    <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-sm text-gray-900">
                      {agentModel}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      System prompt
                    </label>
                {sp ? (
                  <pre className="mt-1 max-h-[320px] overflow-auto rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-gray-900">
                    {sp}
                  </pre>
                ) : (
                  <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500">
                    (System prompt will appear after first message or when session context is
                    loaded)
                  </div>
                )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Conversation history
                    </label>
                    <ConversationHistory interactions={lessonInteractions} />
                  </div>
                </div>
              </section>

              {agentContext?.module && (
                <>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Module
                    </label>
                    <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-900">
                      {(agentContext.module as { title?: string }).title ?? ''}
                      {(agentContext.module as { current_objective_index?: number })
                        .current_objective_index != null && (
                        <span className="ml-2 text-gray-500">
                          (concept{' '}
                          {(agentContext.module as { current_objective_index?: number })
                            .current_objective_index! + 1}
                          )
                        </span>
                      )}
                    </div>
                  </div>
                  {(agentContext.module as { current_objective?: string }).current_objective && (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Current concept
                      </label>
                      <div className="mt-1 rounded-md border border-blue-200 bg-blue-50 p-2 text-sm text-gray-900">
                        {(agentContext.module as { current_objective?: string }).current_objective}
                      </div>
                    </div>
                  )}
                  {(agentContext.module as { progress?: Record<string, unknown> }).progress && (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Module progress
                      </label>
                      <pre className="mt-1 max-h-[120px] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                        {JSON.stringify(
                          (agentContext.module as { progress?: Record<string, unknown> }).progress,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                </>
              )}

              {agentContext?.course && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Course
                  </label>
                  <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-900">
                    {(agentContext.course as { title?: string }).title ?? ''}
                    {(agentContext.course as { subject?: string }).subject && (
                      <span className="text-gray-500">
                        {' '}
                        — {(agentContext.course as { subject?: string }).subject}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {agentContext?.state &&
                typeof agentContext.state === 'object' &&
                Object.keys(agentContext.state as object).length > 0 && (
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Session state
                    </label>
                    <pre className="mt-1 max-h-[160px] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                      {JSON.stringify(agentContext.state, null, 2)}
                    </pre>
                  </div>
                )}

              {/* Chat agent section (learning session Q&A) */}
              {showChatSection && (
                <section className="border-t border-gray-200 pt-6">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Chat agent (Q&A)
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Agent name
                      </label>
                      <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-900">
                        Chat
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Model
                      </label>
                      <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-sm text-gray-900">
                        {agentModel}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        System prompt
                      </label>
                      {chatSystemPrompt ? (
                        <pre className="mt-1 max-h-[240px] overflow-auto rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-gray-900">
                          {chatSystemPrompt}
                        </pre>
                      ) : (
                        <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500">
                          (Session context needed)
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Conversation history
                      </label>
                      <ConversationHistory interactions={chatInteractions} />
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
