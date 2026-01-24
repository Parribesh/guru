import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listConversations, type Conversation } from '../../api/chat_api'

export const GuruChat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    refreshConversationList()
  }, [])

  const refreshConversationList = () => {
    setLoading(true)
    listConversations()
      .then(setConversations)
      .catch((e) => console.error('failed to list conversations', e))
      .finally(() => setLoading(false))
  }

  const handleConversationClick = (conversationId: string) => {
    navigate(`/learn/${conversationId}`)
  }

  return (
    <div className="h-[calc(100vh-120px)] w-full">
      <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <div className="text-lg font-semibold">Conversations</div>
            <div className="text-sm text-gray-500">Select a conversation to continue learning</div>
          </div>
          <button
            type="button"
            onClick={refreshConversationList}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {/* Conversation List */}
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {loading ? (
            <div className="text-sm text-gray-500">Loading conversations...</div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-sm text-gray-500 mb-4">No conversations yet</div>
              <div className="text-xs text-gray-400">
                Start a learning session from the Courses page to create a conversation
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleConversationClick(c.id)}
                  className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">
                        {c.title || `Conversation ${c.id.slice(0, 8)}`}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 font-mono">
                        {c.id}
                      </div>
                      {c.parent_conversation_id && (
                        <div className="mt-1 text-xs text-gray-400">
                          Forked from: {c.parent_conversation_id.slice(0, 8)}...
                        </div>
                      )}
                    </div>
                    <div className="ml-4 text-xs text-gray-400">
                      {new Date(c.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GuruChat
