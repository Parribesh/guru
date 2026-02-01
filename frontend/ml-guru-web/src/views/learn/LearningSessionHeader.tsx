import type { LearningContext } from './LessonContent'

interface LearningSessionHeaderProps {
  learningContext: LearningContext | null
  onShowAgentState: () => void
  onShowModuleProgress: () => void
  onBackToCourses: () => void
}

export default function LearningSessionHeader({
  learningContext,
  onShowAgentState,
  onShowModuleProgress,
  onBackToCourses,
}: LearningSessionHeaderProps) {
  const concept = learningContext?.current_objective ?? 'Learning session'
  const moduleTitle = learningContext?.module_title

  return (
    <div className="flex shrink-0 items-center justify-between border-b-2 border-blue-200 bg-blue-50 px-4 py-3">
      <div>
        <div className="text-lg font-bold text-blue-900">🎓 Learning Session</div>
        <div className="text-sm text-blue-700">
          {concept}
          {moduleTitle && ` · ${moduleTitle}`}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onShowModuleProgress}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Module progress
        </button>
        <button
          type="button"
          onClick={onShowAgentState}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Agent state
        </button>
        <button
          type="button"
          onClick={onBackToCourses}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Back to Courses
        </button>
      </div>
    </div>
  )
}
