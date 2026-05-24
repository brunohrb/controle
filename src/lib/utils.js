export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0min'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min`
  return `${seconds}s`
}

export function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

function pad(n) { return String(n).padStart(2, '0') }

export function getPercentage(usedSeconds, limitMinutes) {
  return Math.min(100, Math.round((usedSeconds / (limitMinutes * 60)) * 100))
}

export function getProgressColor(pct) {
  if (pct >= 100) return '#EF4444'
  if (pct >= 75) return '#F59E0B'
  return '#10B981'
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export function groupSessionsBysite(sessions) {
  const map = {}
  for (const s of sessions) {
    const key = s.site_id
    if (!map[key]) map[key] = { seconds: 0, site: s.ctrl_sites, sessions: [] }
    const dur = s.duration_seconds != null
      ? s.duration_seconds
      : Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000)
    map[key].seconds += dur
    map[key].sessions.push(s)
  }
  return map
}

export function groupSessionsByDay(sessions) {
  const map = {}
  for (const s of sessions) {
    const day = s.started_at.slice(0, 10)
    if (!map[day]) map[day] = 0
    map[day] += s.duration_seconds || 0
  }
  return map
}

export function showToast(msg, type = 'success') {
  const existing = document.querySelector('.toast')
  if (existing) existing.remove()
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = msg
  document.body.appendChild(toast)
  setTimeout(() => toast.classList.add('show'), 10)
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

export function confirm(msg) {
  return window.confirm(msg)
}

export const AVATARS = ['👦', '👧', '👨', '👩', '🧒', '👴', '👵', '🧑']
export const COLORS = ['#EC4899', '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6', '#F97316']

export const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
