import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { axiosInstance } from '../../config/axiosConfig'

type Course = {
  id: string
  title: string
  subject: string
  goals: string | null
  syllabus_confirmed: boolean
  created_at: string
}

type CourseDetail = { course: Course; modules: unknown[] }

export const CourseSettings = () => {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [rerunBusy, setRerunBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId) return
    axiosInstance
      .get(`/guru/courses/${courseId}`)
      .then((r) => {
        const d = r.data as CourseDetail
        setCourse(d.course)
      })
      .catch((e) => {
        setError(e?.response?.status === 404 ? 'Course not found' : 'Failed to load course')
      })
      .finally(() => setLoading(false))
  }, [courseId])

  const rerunSyllabus = async () => {
    if (!courseId || !course) return
    setRerunBusy(true)
    setError(null)
    try {
      if (course.syllabus_confirmed) {
        await axiosInstance.post(`/guru/courses/${courseId}/syllabus/reset`)
      }
      const runsRes = await axiosInstance.get<{ runs: { run_id: string; course_id: string }[] }>('/guru/syllabus/runs')
      const runsForCourse = (runsRes.data?.runs ?? []).filter((r) => r.course_id === courseId)
      for (const r of runsForCourse) {
        await axiosInstance.delete(`/guru/syllabus/runs/${r.run_id}`).catch(() => {})
      }
      const runRes = await axiosInstance.post<{ run_id: string }>(`/guru/courses/${courseId}/syllabus/run`)
      const runId = runRes.data.run_id
      try {
        sessionStorage.setItem(`syllabusRun-${courseId}`, runId)
      } catch (_) {}
      navigate(`/courses/${courseId}`, { replace: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rerun failed')
    } finally {
      setRerunBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    )
  }

  if (error && !course) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-red-600">{error}</p>
        <Link to="/courses" className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-800">← Back to Courses</Link>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Course settings</h1>
          <p className="mt-1 text-sm text-gray-500">{course?.title} · {course?.subject}</p>
        </div>
        <Link to={courseId ? `/courses/${courseId}` : '/courses'} className="text-sm text-blue-600 hover:text-blue-800">← Back to course</Link>
      </div>

      <div className="mt-6 space-y-6">
        <section className="rounded-md border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-900">Syllabus</h2>
          <p className="mt-1 text-xs text-gray-500">
            {course?.syllabus_confirmed
              ? 'This course has a confirmed syllabus. Rerunning will remove all modules and progress, then generate a new syllabus from scratch.'
              : 'Generate or regenerate the syllabus for this course.'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={rerunBusy}
              onClick={rerunSyllabus}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              {rerunBusy ? 'Starting…' : 'Rerun syllabus generation'}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </section>
      </div>
    </div>
  )
}

export default CourseSettings
