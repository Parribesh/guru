import type { RefObject } from 'react'
import type { Interaction } from './types'
import MessageList from './MessageList'
import Composer from './Composer'

interface ChatSidebarProps {
  chatConversationId: string | null
  displayInteractions: Interaction[]
  containerRef: RefObject<HTMLDivElement | null>
  endRef: RefObject<HTMLDivElement | null>
  onSelectInteraction: (id: string) => void
  chatMessage: string
  onChatMessageChange: (value: string) => void
  canSendChat: boolean
  chatSending: boolean
  onChatSubmit: () => void
}

export default function ChatSidebar({
  chatConversationId,
  displayInteractions,
  containerRef,
  endRef,
  onSelectInteraction,
  chatMessage,
  onChatMessageChange,
  canSendChat,
  chatSending,
  onChatSubmit,
}: ChatSidebarProps) {
  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-gray-200 bg-gray-50">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">Discuss this lesson</h2>
        <p className="mt-0.5 text-xs text-gray-500">Ask questions about the topic</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MessageList
          activeTab="chat"
          conversationId={null}
          chatConversationId={chatConversationId}
          displayInteractions={displayInteractions}
          containerRef={containerRef}
          endRef={endRef}
          onSelectInteraction={onSelectInteraction}
        />
      </div>
      <div className="shrink-0 p-3">
        <Composer
          message={chatMessage}
          onMessageChange={onChatMessageChange}
          canSend={canSendChat}
          sending={chatSending}
          onSubmit={onChatSubmit}
          activeTab="chat"
        />
      </div>
    </aside>
  )
}
