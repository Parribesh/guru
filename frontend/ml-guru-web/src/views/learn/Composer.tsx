import type { TabKind } from './types'

interface ComposerProps {
  message: string
  onMessageChange: (value: string) => void
  canSend: boolean
  sending: boolean
  onSubmit: () => void
  activeTab: TabKind
}

export default function Composer({
  message,
  onMessageChange,
  canSend,
  sending,
  onSubmit,
  activeTab,
}: ComposerProps) {
  const placeholder =
    activeTab === 'lesson'
      ? 'Ask the tutor about this concept...'
      : 'Ask a question about the topic...'

  return (
    <div className="border-t border-gray-200 px-4 py-3">
      <div className="flex gap-2">
        <textarea
          className="min-h-[80px] flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (canSend) onSubmit()
            }
          }}
          placeholder={placeholder}
        />
        <button
          onClick={onSubmit}
          disabled={!canSend}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
