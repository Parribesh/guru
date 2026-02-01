import type { RefObject } from 'react'
import type { Interaction, TabKind } from './types'

interface MessageListProps {
  activeTab: TabKind
  conversationId: string | null
  chatConversationId: string | null
  displayInteractions: Interaction[]
  containerRef: RefObject<HTMLDivElement | null>
  endRef: RefObject<HTMLDivElement | null>
  onSelectInteraction: (interactionId: string) => void
}

export default function MessageList({
  activeTab,
  conversationId,
  chatConversationId,
  displayInteractions,
  containerRef,
  endRef,
  onSelectInteraction,
}: MessageListProps) {
  const hasConversation = activeTab === 'lesson' ? conversationId : chatConversationId
  const loadingChat = activeTab === 'chat' && !chatConversationId
  const loadingConv = !hasConversation

  if (loadingChat) {
    return (
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className="text-sm text-gray-500">Loading chat channel...</div>
      </div>
    )
  }
  if (loadingConv) {
    return (
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className="text-sm text-gray-500">Loading conversation...</div>
      </div>
    )
  }
  if (displayInteractions.length === 0) {
    return (
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className="text-sm text-gray-500">
          {activeTab === 'lesson'
            ? '(No lesson messages yet. Ask the tutor to start.)'
            : '(No Q&A messages yet. Ask anything about the topic.)'}
        </div>
      </div>
    )
  }

  const assistantLabel = activeTab === 'lesson' ? 'Tutor' : 'Chat'

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
      <div className="space-y-4">
        {displayInteractions.map((interaction) => {
          const isStreaming = interaction.isStreaming
          return (
            <div
              key={interaction.id}
              className="rounded-lg border-2 border-gray-200 bg-white shadow-sm"
            >
              <div className="rounded-t-lg border-b border-gray-200 bg-blue-50 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                        You
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(interaction.metadata.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-900">{interaction.userMessage.content}</div>
                  </div>
                </div>
              </div>
              {interaction.assistantMessage && (
                <div className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {assistantLabel}
                        </span>
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
                      onClick={() => onSelectInteraction(interaction.id)}
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
        <div ref={endRef} />
      </div>
    </div>
  )
}
