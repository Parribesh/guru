import type { RefObject } from 'react'
import type { Interaction } from './types'

export interface ModuleProgressInfo {
  best_score: number
  attempts_count: number
  passed: boolean
  completed_objectives: number[]
}

export interface LearningContext {
  current_objective?: string
  module_title?: string
  course_title?: string
  /** 0-based index of current concept */
  current_concept_index?: number
  /** Total number of concepts in module */
  concepts_total?: number
  /** e.g. "2 of 5" */
  concept_position_label?: string
  /** Module progress (best score, attempts, passed, completed objectives) */
  progress?: ModuleProgressInfo
  /** All objectives in order (for progress list) */
  objectives?: string[]
}

interface LessonContentProps {
  learningContext: LearningContext | null
  conversationId: string | null
  lessonInteractions: Interaction[]
  streamingContent: string
  isStreaming: boolean
  contentEndRef: RefObject<HTMLDivElement | null>
  sessionId?: string | null
  onCompleteObjective?: () => void
  completeLoading?: boolean
}

export default function LessonContent({
  learningContext,
  conversationId,
  lessonInteractions,
  streamingContent,
  isStreaming,
  contentEndRef,
  sessionId,
  onCompleteObjective,
  completeLoading = false,
}: LessonContentProps) {
  const conceptLabel = learningContext?.current_objective ?? 'This concept'
  const moduleTitle = learningContext?.module_title

  // Build tutor-generated content: all assistant message bodies in order, plus current streaming
  const tutorBlocks: string[] = lessonInteractions
    .filter((i) => i.assistantMessage?.content)
    .map((i) => i.assistantMessage!.content)
  if (streamingContent) {
    tutorBlocks.push(streamingContent)
  }

  const hasContent = tutorBlocks.length > 0
  const isLoading = !conversationId

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-lg bg-white">
      <div className="flex-1 overflow-auto px-6 py-5">
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading session…</p>
        ) : (
          <>
            <header className="mb-6 border-b border-gray-200 pb-4">
              <h1 className="text-xl font-bold text-gray-900">{conceptLabel}</h1>
              {moduleTitle && (
                <p className="mt-1 text-sm text-gray-500">Module: {moduleTitle}</p>
              )}
            </header>

            {!hasContent ? (
              <p className="text-sm text-gray-500">
                The tutor leads this session. Lesson content will appear here. Use the chat on the right to ask questions.
              </p>
            ) : (
              <article className="prose prose-sm max-w-none text-gray-800">
                {tutorBlocks.map((block, idx) => (
                  <div
                    key={idx}
                    className="mb-6 last:mb-0"
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {block}
                      {idx === tutorBlocks.length - 1 && isStreaming && (
                        <span className="inline-block h-4 w-2 animate-pulse bg-blue-500 align-middle" />
                      )}
                    </div>
                  </div>
                ))}
              </article>
            )}
            <div ref={contentEndRef} />
            {sessionId && onCompleteObjective && learningContext?.current_concept_index !== undefined && (
              <div className="mt-6 border-t border-gray-200 pt-6">
                {(() => {
                  const completedSet = new Set(learningContext.progress?.completed_objectives ?? [])
                  const alreadyCompleted = completedSet.has(learningContext.current_concept_index)
                  return (
                    <button
                      type="button"
                      onClick={onCompleteObjective}
                      disabled={alreadyCompleted || completeLoading}
                      className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {completeLoading
                        ? 'Completing…'
                        : alreadyCompleted
                          ? 'Concept completed'
                          : 'Complete concept'}
                    </button>
                  )
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
