// Controle Familiar - YouTube Widget para Scriptable
// Instale o Scriptable (App Store) e cole este código

const SUPABASE_URL = 'https://hisbbtddpoxufvghxqtm.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpc2JidGRkcG94dWZ2Z2h4cXRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMDM0OTgsImV4cCI6MjA4Nzc3OTQ5OH0.r3VkLkBxeorkCYjB-y6WOchePdfRKsm5lWE1iSSYlrw'
const YOUTUBE_SITE_ID = 'e3472a39-6153-42fb-8a77-736a4855f24e'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
}

async function apiFetch(path, method = 'GET', body = null) {
  const req = new Request(`${SUPABASE_URL}${path}`)
  req.method = method
  req.headers = headers
  if (body) req.body = JSON.stringify(body)
  return req.loadJSON()
}

async function getYouTubeSite() {
  const data = await apiFetch(`/rest/v1/ctrl_sites?id=eq.${YOUTUBE_SITE_ID}&select=*`)
  return data[0]
}

async function getExtraTime() {
  const today = new Date().toISOString().slice(0, 10)
  const data = await apiFetch(`/rest/v1/ctrl_settings?key=eq.extra_${today}_${YOUTUBE_SITE_ID}&select=value`)
  return data[0] ? (parseInt(data[0].value) || 0) : 0
}

async function getTodayUsage() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const data = await apiFetch(
    `/rest/v1/ctrl_sessions?site_id=eq.${YOUTUBE_SITE_ID}&started_at=gte.${today.toISOString()}&select=duration_seconds,started_at,ended_at`
  )
  let total = 0
  for (const s of data || []) {
    if (s.duration_seconds != null) {
      total += s.duration_seconds
    } else {
      total += Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000)
    }
  }
  return total
}

async function getActiveSession() {
  const data = await apiFetch(
    `/rest/v1/ctrl_sessions?site_id=eq.${YOUTUBE_SITE_ID}&ended_at=is.null&select=*&order=started_at.desc&limit=1`
  )
  return data[0] || null
}

async function startSession() {
  const data = await apiFetch('/rest/v1/ctrl_sessions', 'POST', {
    site_id: YOUTUBE_SITE_ID,
    started_at: new Date().toISOString(),
    auto: false
  })
  return data[0]
}

async function endSession(sessionId, startedAt) {
  const duration = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  await apiFetch(`/rest/v1/ctrl_sessions?id=eq.${sessionId}`, 'PATCH', {
    ended_at: new Date().toISOString(),
    duration_seconds: duration
  })
  return duration
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${s}s`
  return `${s}s`
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

// ── APP MODE (não widget) ──────────────────────────────────────────────────

async function runApp() {
  const [site, usedSec, activeSession, extraMin] = await Promise.all([
    getYouTubeSite(),
    getTodayUsage(),
    getActiveSession(),
    getExtraTime()
  ])

  const limitMin = (site?.daily_limit_minutes || 60) + extraMin
  const limitSec = limitMin * 60
  const pct = Math.min(100, Math.round((usedSec / limitSec) * 100))

  let statusLine = activeSession
    ? `▶ Ativo há ${formatTimer(Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000))}`
    : `⏸ Pausado`

  const alert = new Alert()
  alert.title = '▶ YouTube — Controle'
  alert.message = `Hoje: ${formatDuration(usedSec)} / ${limitMin}min (${pct}%)\n${statusLine}`

  if (activeSession) {
    alert.addAction('⏹ Parar sessão')
  } else if (pct < 100) {
    alert.addAction('▶ Iniciar sessão')
  } else {
    alert.addAction('⛔ Limite atingido')
  }
  alert.addCancelAction('Fechar')

  const choice = await alert.presentAlert()

  if (choice === 0) {
    if (activeSession) {
      const dur = await endSession(activeSession.id, activeSession.started_at)
      const done = new Alert()
      done.title = '⏹ Sessão encerrada'
      done.message = `Duração: ${formatDuration(dur)}\nTotal hoje: ${formatDuration(usedSec)}`
      done.addAction('OK')
      await done.presentAlert()
    } else if (pct < 100) {
      await startSession()
      const done = new Alert()
      done.title = '▶ Sessão iniciada!'
      done.message = 'O tempo do YouTube está sendo contado.'
      done.addAction('OK')
      await done.presentAlert()
    }
  }
}

// ── WIDGET MODE ───────────────────────────────────────────────────────────

async function createWidget() {
  const [site, usedSec, activeSession, extraMin] = await Promise.all([
    getYouTubeSite(),
    getTodayUsage(),
    getActiveSession(),
    getExtraTime()
  ])

  const limitMin = (site?.daily_limit_minutes || 60) + extraMin
  const limitSec = limitMin * 60
  const pct = Math.min(100, Math.round((usedSec / limitSec) * 100))
  const isActive = !!activeSession
  const isOver = pct >= 100

  const w = new ListWidget()
  w.backgroundColor = new Color('#1a1a2e')
  w.setPadding(14, 14, 14, 14)

  // Header
  const header = w.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const icon = header.addText('▶')
  icon.textColor = new Color('#ff0000')
  icon.font = Font.boldSystemFont(16)

  header.addSpacer(6)

  const title = header.addText('YouTube')
  title.textColor = Color.white()
  title.font = Font.boldSystemFont(15)

  header.addSpacer()

  const statusDot = header.addText(isActive ? '🔴' : isOver ? '🔒' : '⏸')
  statusDot.font = Font.systemFont(14)

  w.addSpacer(8)

  // Tempo usado
  const usedText = w.addText(formatDuration(usedSec))
  usedText.textColor = isOver ? new Color('#f87171') : isActive ? new Color('#34d399') : Color.white()
  usedText.font = Font.boldSystemFont(22)

  const limitText = w.addText(`de ${limitMin}min (${pct}%)`)
  limitText.textColor = new Color('#94a3b8')
  limitText.font = Font.systemFont(11)

  w.addSpacer(6)

  // Barra de progresso
  const barBg = w.addStack()
  barBg.backgroundColor = new Color('#334155')
  barBg.cornerRadius = 4
  barBg.size = new Size(0, 6)

  // Status
  w.addSpacer(6)
  let statusMsg = isActive
    ? `▶ ${formatTimer(Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000))}`
    : isOver ? '⛔ Limite atingido'
    : 'Toque para iniciar'

  const status = w.addText(statusMsg)
  status.textColor = isActive ? new Color('#34d399') : isOver ? new Color('#f87171') : new Color('#94a3b8')
  status.font = Font.mediumSystemFont(12)

  w.addSpacer()

  // Botão (instrução de toque)
  const btn = w.addText(isActive ? '⏹ Toque para parar' : isOver ? '🔒 Bloqueado' : '▶ Toque para iniciar')
  btn.textColor = new Color('#6366f1')
  btn.font = Font.mediumSystemFont(11)

  // Toque abre o Scriptable para executar a ação
  w.url = `scriptable:///run/${encodeURIComponent(Script.name())}`

  const now = new Date()
  w.refreshAfterDate = new Date(now.getTime() + 60 * 1000)

  return w
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────

if (config.runsInWidget) {
  const widget = await createWidget()
  Script.setWidget(widget)
} else {
  await runApp()
}

Script.complete()
