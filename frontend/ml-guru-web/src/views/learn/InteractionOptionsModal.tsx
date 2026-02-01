import type { Interaction } from './types'

interface InteractionOptionsModalProps {
  interaction: Interaction | null
  onClose: () => void
}

export default function InteractionOptionsModal({
  interaction,
  onClose,
}: InteractionOptionsModalProps) {
  if (!interaction) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Interaction Options</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">Interaction ID</label>
            <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-xs text-gray-900">
              {interaction.id}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700">Timestamp</label>
            <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm text-gray-900">
              {new Date(interaction.metadata.timestamp).toLocaleString()}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700">User Message</label>
            <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900">
              {interaction.userMessage.content}
            </div>
          </div>

          {interaction.assistantMessage && (
            <div>
              <label className="text-sm font-semibold text-gray-700">Assistant Response</label>
              <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 whitespace-pre-wrap">
                {interaction.assistantMessage.content}
              </div>
            </div>
          )}

          {interaction.metadata.retrievedHistory && (
            <div>
              <label className="text-sm font-semibold text-gray-700">
                🔍 Retrieved History (from semantic search)
              </label>
              <div className="mt-1 max-h-[300px] overflow-auto rounded-md border border-purple-200 bg-purple-50 p-3">
                <pre className="whitespace-pre-wrap text-xs text-gray-700">
                  {interaction.metadata.retrievedHistory}
                </pre>
              </div>
            </div>
          )}

          {interaction.metadata.systemPrompt && (
            <div>
              <label className="text-sm font-semibold text-gray-700">System Prompt</label>
              <div className="mt-1 max-h-[300px] overflow-auto rounded-md border border-gray-200 bg-gray-50 p-3">
                <pre className="whitespace-pre-wrap text-xs text-gray-900">
                  {interaction.metadata.systemPrompt}
                </pre>
              </div>
            </div>
          )}

          {!interaction.metadata.retrievedHistory && !interaction.metadata.systemPrompt && (
            <div className="italic text-sm text-gray-500">
              No additional metadata available for this interaction.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
