import { useEffect, useState, useMemo } from 'react'
import {
  getAdminStats,
  getAdminEndpoints,
  getAdminCourses,
  createAdminCourse,
  updateAdminCourse,
  deleteAdminCourse,
  getAdminSyllabus,
  updateAdminSyllabus,
  createAdminModule,
  getAdminUsers,
  updateAdminUserRole,
  type AdminStats,
  type AdminEndpointDoc,
  type AdminCourseItem,
  type AdminUserItem,
} from '../../api/admin_api'

export function AdminAssetManagement() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [endpoints, setEndpoints] = useState<AdminEndpointDoc[]>([])
  const [courses, setCourses] = useState<AdminCourseItem[]>([])
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sub-navigation
  const [activeTab, setActiveTab] = useState<'courses' | 'endpoints' | 'users'>('courses')

  // Search & Filter for endpoints
  const [endpointSearch, setEndpointSearch] = useState('')
  const [endpointCategory, setEndpointCategory] = useState<string>('All')

  // Modal states
  const [createCourseOpen, setCreateCourseOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newGoals, setNewGoals] = useState('')
  const [creatingCourse, setCreatingCourse] = useState(false)

  // Syllabus Editor Modal
  const [syllabusEditorOpen, setSyllabusEditorOpen] = useState(false)
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null)
  const [editingCourseTitle, setEditingCourseTitle] = useState<string>('')
  const [syllabusJsonStr, setSyllabusJsonStr] = useState<string>('[]')
  const [savingSyllabus, setSavingSyllabus] = useState(false)
  const [syllabusEditorError, setSyllabusEditorError] = useState<string | null>(null)

  // Edit Course Metadata Modal
  const [editCourseOpen, setEditCourseOpen] = useState(false)
  const [editCourseId, setEditCourseId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [editGoals, setEditGoals] = useState('')
  const [editConfirmed, setEditConfirmed] = useState(false)
  const [savingEditCourse, setSavingEditCourse] = useState(false)

  // Add Module Modal
  const [addModuleOpen, setAddModuleOpen] = useState(false)
  const [targetCourseForModule, setTargetCourseForModule] = useState<string | null>(null)
  const [moduleTitle, setModuleTitle] = useState('')
  const [moduleObjectives, setModuleObjectives] = useState('')
  const [moduleMinutes, setModuleMinutes] = useState(30)
  const [savingModule, setSavingModule] = useState(false)

  // Load all admin data
  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsData, endpointsData, coursesData, usersData] = await Promise.all([
        getAdminStats(),
        getAdminEndpoints(),
        getAdminCourses(),
        getAdminUsers(),
      ])
      setStats(statsData)
      setEndpoints(endpointsData)
      setCourses(coursesData)
      setUsers(usersData)
    } catch (err: any) {
      console.error('Failed to load admin assets:', err)
      setError(err?.response?.data?.detail || err.message || 'Failed to load administrative assets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Categories for endpoints directory
  const categories = useMemo(() => {
    const set = new Set<string>()
    endpoints.forEach((e) => set.add(e.category))
    return ['All', ...Array.from(set)]
  }, [endpoints])

  const filteredEndpoints = useMemo(() => {
    return endpoints.filter((ep) => {
      const matchesCategory = endpointCategory === 'All' || ep.category === endpointCategory
      const matchesSearch =
        !endpointSearch ||
        ep.path.toLowerCase().includes(endpointSearch.toLowerCase()) ||
        ep.summary.toLowerCase().includes(endpointSearch.toLowerCase()) ||
        ep.description.toLowerCase().includes(endpointSearch.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [endpoints, endpointCategory, endpointSearch])

  // Actions: Create Course
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newSubject.trim()) return
    setCreatingCourse(true)
    try {
      await createAdminCourse({
        title: newTitle.trim(),
        subject: newSubject.trim(),
        goals: newGoals.trim() || undefined,
      })
      setCreateCourseOpen(false)
      setNewTitle('')
      setNewSubject('')
      setNewGoals('')
      await loadData()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to create course asset')
    } finally {
      setCreatingCourse(false)
    }
  }

  // Actions: Delete Course
  const handleDeleteCourse = async (courseId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete course "${title}" and all its modules/runs?`)) {
      return
    }
    try {
      await deleteAdminCourse(courseId)
      await loadData()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to delete course asset')
    }
  }

  // Actions: Edit Course
  const handleOpenEditCourse = (course: AdminCourseItem) => {
    setEditCourseId(course.id)
    setEditTitle(course.title)
    setEditSubject(course.subject)
    setEditGoals(course.goals || '')
    setEditConfirmed(course.syllabus_confirmed)
    setEditCourseOpen(true)
  }

  const handleSaveEditCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editCourseId || !editTitle.trim() || !editSubject.trim()) return
    setSavingEditCourse(true)
    try {
      await updateAdminCourse(editCourseId, {
        title: editTitle.trim(),
        subject: editSubject.trim(),
        goals: editGoals.trim() || undefined,
        syllabus_confirmed: editConfirmed,
      })
      setEditCourseOpen(false)
      await loadData()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update course asset')
    } finally {
      setSavingEditCourse(false)
    }
  }

  // Actions: Open Syllabus JSON Editor
  const handleOpenSyllabusEditor = async (courseId: string, title: string) => {
    setEditingCourseId(courseId)
    setEditingCourseTitle(title)
    setSyllabusEditorError(null)
    try {
      const sylData = await getAdminSyllabus(courseId)
      setSyllabusJsonStr(JSON.stringify(sylData.syllabus_draft || [], null, 2))
      setSyllabusEditorOpen(true)
    } catch (err: any) {
      alert('Failed to load syllabus: ' + (err?.response?.data?.detail || err.message))
    }
  }

  // Actions: Save Syllabus JSON
  const handleSaveSyllabus = async () => {
    if (!editingCourseId) return
    setSyllabusEditorError(null)
    let parsed: any[]
    try {
      parsed = JSON.parse(syllabusJsonStr)
      if (!Array.isArray(parsed)) {
        throw new Error('Syllabus draft must be a JSON array of module objects.')
      }
    } catch (err: any) {
      setSyllabusEditorError(err.message)
      return
    }

    setSavingSyllabus(true)
    try {
      await updateAdminSyllabus(editingCourseId, {
        syllabus_draft: parsed,
        sync_modules: true,
        confirm: true,
      })
      setSyllabusEditorOpen(false)
      await loadData()
    } catch (err: any) {
      setSyllabusEditorError(err?.response?.data?.detail || 'Failed to save syllabus draft')
    } finally {
      setSavingSyllabus(false)
    }
  }

  // Actions: Add Module
  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetCourseForModule || !moduleTitle.trim()) return
    setSavingModule(true)
    try {
      const objectives = moduleObjectives
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)

      await createAdminModule(targetCourseForModule, {
        title: moduleTitle.trim(),
        objectives,
        estimated_minutes: moduleMinutes,
      })
      setAddModuleOpen(false)
      setModuleTitle('')
      setModuleObjectives('')
      setModuleMinutes(30)
      await loadData()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to add module')
    } finally {
      setSavingModule(false)
    }
  }

  // Actions: Update User Role
  const handleToggleUserRole = async (user: AdminUserItem) => {
    const nextRole = user.role === 'admin' ? 'user' : 'admin'
    if (!window.confirm(`Change role for ${user.email} to "${nextRole}"?`)) return
    try {
      await updateAdminUserRole(user.id, nextRole)
      await loadData()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update user role')
    }
  }

  return (
    <div className="space-y-6">
      {/* Overview Metric Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Total Courses</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{stats.total_courses}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Total Modules</div>
            <div className="mt-1 text-2xl font-bold text-indigo-600">{stats.total_modules}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Syllabus Runs</div>
            <div className="mt-1 text-2xl font-bold text-blue-600">{stats.total_syllabus_runs}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Active Sessions</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600">{stats.total_learning_sessions}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">Platform Users</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{stats.total_users}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium text-slate-500">LLM Active</div>
            <div className="mt-1 truncate text-xs font-semibold text-purple-700">
              {stats.active_gemini_model}
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] text-slate-500">{stats.system_status}</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Segmented Tab Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('courses')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'courses'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Course & Syllabus Assets ({courses.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('endpoints')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'endpoints'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            API Endpoints Directory ({endpoints.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'users'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Users & Roles ({users.length})
          </button>
        </div>

        {activeTab === 'courses' && (
          <button
            type="button"
            onClick={() => setCreateCourseOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
          >
            + Create Course Asset
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading administrative assets…</div>
      ) : (
        <>
          {/* TAB 1: COURSES & SYLLABUS ASSETS */}
          {activeTab === 'courses' && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Course / Subject</th>
                      <th className="px-4 py-3">Owner / Author</th>
                      <th className="px-4 py-3">Modules</th>
                      <th className="px-4 py-3">Syllabus Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3 text-right">Admin Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700">
                    {courses.map((course) => (
                      <tr key={course.id} className="hover:bg-slate-50/75 transition">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{course.title}</div>
                          <div className="text-[11px] text-slate-500">{course.subject}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-800">{course.user_email}</div>
                          <div className="text-[10px] text-slate-400">ID #{course.user_id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                            {course.modules_count} modules
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {course.syllabus_confirmed ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                              Confirmed
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                              Draft
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-500">
                          {course.created_at ? new Date(course.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => handleOpenSyllabusEditor(course.id, course.title)}
                            className="rounded bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                            title="Inspect & Edit Raw Syllabus JSON"
                          >
                            Syllabus JSON
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditCourse(course)}
                            className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200"
                            title="Edit Metadata"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetCourseForModule(course.id)
                              setAddModuleOpen(true)
                            }}
                            className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                            title="Add Module"
                          >
                            + Module
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCourse(course.id, course.title)}
                            className="rounded bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100"
                            title="Delete Asset"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {courses.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          No courses currently in database.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: API ENDPOINTS DIRECTORY */}
          {activeTab === 'endpoints' && (
            <div className="space-y-4">
              {/* Filter bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEndpointCategory(cat)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        endpointCategory === cat
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={endpointSearch}
                  onChange={(e) => setEndpointSearch(e.target.value)}
                  placeholder="Search endpoints or paths…"
                  className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Endpoints Table */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-4 py-3">Method & Path</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Summary & Description</th>
                        <th className="px-4 py-3">Auth Level</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700">
                      {filteredEndpoints.map((ep, idx) => {
                        const methodColors: Record<string, string> = {
                          GET: 'bg-blue-50 text-blue-700 border-blue-200',
                          POST: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          PUT: 'bg-amber-50 text-amber-700 border-amber-200',
                          PATCH: 'bg-purple-50 text-purple-700 border-purple-200',
                          DELETE: 'bg-red-50 text-red-700 border-red-200',
                        }
                        const badgeClass = methodColors[ep.method] || 'bg-slate-100 text-slate-700'
                        return (
                          <tr key={idx} className="hover:bg-slate-50/75 transition">
                            <td className="px-4 py-3 font-mono font-medium">
                              <div className="flex items-center gap-2">
                                <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
                                  {ep.method}
                                </span>
                                <span className="text-slate-900">{ep.path}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                              {ep.category}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{ep.summary}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{ep.description}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  ep.auth_required === 'Admin'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                                }`}
                              >
                                {ep.auth_required}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(ep.path)
                                  alert(`Copied endpoint path: ${ep.path}`)
                                }}
                                className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200"
                              >
                                Copy Path
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {filteredEndpoints.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                            No endpoints match the selected filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: USERS & ROLES */}
          {activeTab === 'users' && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="px-4 py-3">User ID</th>
                      <th className="px-4 py-3">Email Address</th>
                      <th className="px-4 py-3">Current Role</th>
                      <th className="px-4 py-3">Created Courses</th>
                      <th className="px-4 py-3 text-right">Role Governance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/75 transition">
                        <td className="px-4 py-3 font-mono text-slate-500">#{u.id}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{u.email}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              u.role === 'admin'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {u.role.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{u.courses_count} courses</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleUserRole(u)}
                            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {u.role === 'admin' ? 'Demote to Student' : 'Promote to Admin'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: Create Course */}
      {createCourseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900">Create Course Asset</h3>
            <p className="mt-1 text-xs text-slate-500">
              Provision a new course asset directly into the system database.
            </p>
            <form onSubmit={handleCreateCourse} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Course Title *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Distributed LLM Systems"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject / Domain *</label>
                <input
                  type="text"
                  required
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g. Systems Engineering"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Goals / Target Objectives</label>
                <textarea
                  value={newGoals}
                  onChange={(e) => setNewGoals(e.target.value)}
                  placeholder="What should students master upon completion?"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateCourseOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCourse}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creatingCourse ? 'Saving…' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Raw Syllabus JSON Editor */}
      {syllabusEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Syllabus Draft JSON: {editingCourseTitle}
                </h3>
                <p className="text-xs text-slate-500">
                  Directly edit syllabus module specs. Saving will overwrite draft and sync database modules.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSyllabusEditorOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {syllabusEditorError && (
              <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
                {syllabusEditorError}
              </div>
            )}

            <div className="mt-3 flex-1 overflow-hidden">
              <textarea
                value={syllabusJsonStr}
                onChange={(e) => setSyllabusJsonStr(e.target.value)}
                rows={16}
                className="w-full h-full font-mono text-xs p-3 rounded-lg border border-slate-300 bg-slate-900 text-emerald-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder='[ {"title": "Module 1", "objectives": ["Obj 1"], "estimated_minutes": 30} ]'
              />
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-200 mt-3">
              <span className="text-[11px] text-slate-500">
                Format: Array of module objects with title, objectives, estimated_minutes.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSyllabusEditorOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingSyllabus}
                  onClick={handleSaveSyllabus}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingSyllabus ? 'Syncing…' : 'Save & Sync Modules'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Single Module */}
      {addModuleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900">Add Module Asset</h3>
            <form onSubmit={handleAddModule} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Module Title *</label>
                <input
                  type="text"
                  required
                  value={moduleTitle}
                  onChange={(e) => setModuleTitle(e.target.value)}
                  placeholder="e.g. Attention Mechanisms"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Learning Objectives (one per line)
                </label>
                <textarea
                  value={moduleObjectives}
                  onChange={(e) => setModuleObjectives(e.target.value)}
                  rows={4}
                  placeholder="Scaled Dot-Product Attention&#10;Multi-Head Attention&#10;Cross-Attention"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Minutes</label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={moduleMinutes}
                  onChange={(e) => setModuleMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModuleOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingModule}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingModule ? 'Saving…' : 'Add Module'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Course Metadata */}
      {editCourseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900">Edit Course Asset</h3>
            <form onSubmit={handleSaveEditCourse} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Course Title *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject / Domain *</label>
                <input
                  type="text"
                  required
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Goals</label>
                <textarea
                  value={editGoals}
                  onChange={(e) => setEditGoals(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="syllabus-confirmed-check"
                  checked={editConfirmed}
                  onChange={(e) => setEditConfirmed(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="syllabus-confirmed-check" className="text-xs font-medium text-slate-700">
                  Mark Syllabus as Confirmed
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditCourseOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEditCourse}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingEditCourse ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
