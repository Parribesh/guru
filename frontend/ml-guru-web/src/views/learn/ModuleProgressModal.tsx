import type { LearningContext } from './LessonContent'

interface ModuleProgressModalProps {
  open: boolean
  onClose: () => void
  learningContext: LearningContext | null
}

export default function ModuleProgressModal({
  open,
  onClose,
  learningContext,
}: ModuleProgressModalProps) {
  if (!open) return null

  const progress = learningContext?.progress
  const objectives = learningContext?.objectives ?? []
  const completedSet = new Set(progress?.completed_objectives ?? [])
  const conceptsTotal = learningContext?.concepts_total ?? objectives.length
  const conceptPositionLabel = learningContext?.concept_position_label

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="module-progress-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-blue-50 px-4 py-3">
          <h2 id="module-progress-title" className="text-lg font-bold text-blue-900">
            Module progress
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">
          {learningContext?.module_title && (
            <p className="mb-3 text-sm font-medium text-gray-700">
              {learningContext.module_title}
              {learningContext.course_title && (
                <span className="ml-1 font-normal text-gray-500">
                  · {learningContext.course_title}
                </span>
              )}
            </p>
          )}
          {conceptPositionLabel && (
            <p className="mb-3 text-sm text-gray-600">
              Concept: <span className="font-medium">{conceptPositionLabel}</span>
            </p>
          )}
          {progress != null && (
            <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Best score</span>
                  <div className="font-medium text-gray-900">{progress.best_score}</div>
                </div>
                <div>
                  <span className="text-gray-500">Attempts</span>
                  <div className="font-medium text-gray-900">{progress.attempts_count}</div>
                </div>
                <div>
                  <span className="text-gray-500">Status</span>
                  <div className="font-medium">
                    {progress.passed ? (
                      <span className="text-green-600">Passed</span>
                    ) : (
                      <span className="text-amber-600">In progress</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {objectives.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-gray-700">Concepts</h3>
              <ul className="space-y-1.5">
                {objectives.map((obj, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm text-gray-700"
                  >
                    <span
                      className="mt-0.5 shrink-0"
                      aria-hidden
                    >
                      {completedSet.has(idx) ? '✓' : '○'}
                    </span>
                    <span
                      className={
                        completedSet.has(idx)
                          ? 'text-gray-900'
                          : 'text-gray-600'
                      }
                    >
                      {obj}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!progress && objectives.length === 0 && (
            <p className="text-sm text-gray-500">No progress data for this module yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
