export const API_URL = 'http://localhost:8000'

/** WebSocket base URL for same-origin syllabus run updates (cookies sent automatically). */
export const WS_URL = (() => {
  const u = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  return u.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://')
})()