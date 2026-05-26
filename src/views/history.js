import { getUnlockHistory, getTodayUsage, getWeekSessions } from '../lib/db.js'
import { formatDuration } from '../lib/utils.js'

export async function renderHistory(app, state, navigate) {
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`

  const [history7, todayUsage, weekSessions] = await Promise.all([
    getUnlockHistory(7),
    getTodayUsage(),
    getWeekSessions()
  ])

  const today = new Date().toISOString().slice(0, 10)
  const todayHistory = history7.filter(e => e.unlocked_at.startsWith(today))

  // Agrupar unlocks por usuário (hoje)
  const userTodayStats = {}
  for (const e of todayHistory) {
    const uid = e.user_id
    if (!userTodayStats[uid]) {
      userTodayStats[uid] = { user: e.ctrl_users, totalMin: 0, count: 0 }
    }
    userTodayStats[uid].totalMin += e.minutes
    userTodayStats[uid].count++
  }

  // Agrupar unlocks por dia e usuário (semana)
  const dayMap = {}
  for (const e of history7) {
    const day = e.unlocked_at.slice(0, 10)
    if (!dayMap[day]) dayMap[day] = {}
    const uid = e.user_id
    if (!dayMap[day][uid]) dayMap[day][uid] = { user: e.ctrl_users, totalMin: 0, count: 0 }
    dayMap[day][uid].totalMin += e.minutes
    dayMap[day][uid].count++
  }

  // Agrupar uso por usuário na semana
  const userWeekStats = {}
  for (const e of history7) {
    const uid = e.user_id
    if (!userWeekStats[uid]) {
      userWeekStats[uid] = { user: e.ctrl_users, totalMin: 0, count: 0 }
    }
    userWeekStats[uid].totalMin += e.minutes
    userWeekStats[uid].count++
  }

  function formatDay(dateStr) {
    const d = new Date(dateStr + 'T12:00:00')
    if (dateStr === today) return 'Hoje'
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Ontem'
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  function userStatsCards(stats) {
    return Object.values(stats).map(s => `
      <div class="history-user-card" style="border-color:${s.user?.color || '#6366f1'}">
        <span class="history-user-avatar" style="background:${s.user?.color || '#6366f1'}">${(s.user?.name || '?')[0]}</span>
        <div>
          <div class="history-user-name">${s.user?.name || 'Desconhecido'}</div>
          <div class="history-user-stats">${s.totalMin}min liberados • ${s.count} vez${s.count !== 1 ? 'es' : ''}</div>
        </div>
      </div>
    `).join('') || '<p class="muted" style="text-align:center;padding:16px">Nenhum desbloqueio hoje</p>'
  }

  // Uso total de sessões por site hoje
  const { sites } = state
  const todayUsageCards = sites.length > 0 ? sites.map(site => {
    const sec = todayUsage[site.id] || 0
    if (!sec) return ''
    return `
      <div class="usage-row">
        <span>${site.icon} ${site.name}</span>
        <span class="usage-val">${formatDuration(sec)}</span>
      </div>
    `
  }).filter(Boolean).join('') : ''

  // Semana: tabela por dia
  const sortedDays = Object.keys(dayMap).sort().reverse()
  const weekRows = sortedDays.map(day => {
    const dayStats = Object.values(dayMap[day])
    return `
      <div class="week-day-row">
        <div class="week-day-label">${formatDay(day)}</div>
        <div class="week-day-users">
          ${dayStats.map(s => `
            <span class="week-user-chip" style="background:${s.user?.color || '#6366f1'}22;color:${s.user?.color || '#6366f1'}">
              ${s.user?.name || '?'}: ${s.totalMin}min
            </span>
          `).join('')}
        </div>
      </div>
    `
  }).join('')

  // Histórico detalhado
  const detailedRows = history7.slice(0, 30).map(e => `
    <div class="history-event-row">
      <div class="history-event-left">
        <span class="history-event-icon">${e.ctrl_sites?.icon || '📱'}</span>
        <div>
          <div class="history-event-site">${e.ctrl_sites?.name || 'Site'}</div>
          <div class="history-event-meta">${formatDay(e.unlocked_at.slice(0, 10))} às ${formatTime(e.unlocked_at)}</div>
        </div>
      </div>
      <div class="history-event-right">
        <span class="history-event-mins">${e.minutes}min</span>
        <span class="history-event-user" style="color:${e.ctrl_users?.color || '#94a3b8'}">${e.ctrl_users?.name || '?'}</span>
      </div>
    </div>
  `).join('') || '<p class="muted" style="text-align:center;padding:24px">Nenhum histórico</p>'

  app.innerHTML = `
    <div class="screen history-screen">
      <header class="home-header">
        <div>
          <h1>📊 Histórico</h1>
          <p class="muted">Desbloqueios e uso</p>
        </div>
        <button class="btn-ghost" id="btn-back">← Voltar</button>
      </header>

      <div class="history-tabs" id="history-tabs">
        <button class="htab active" data-tab="today">Hoje</button>
        <button class="htab" data-tab="week">Semana</button>
        <button class="htab" data-tab="detail">Detalhes</button>
      </div>

      <div id="tab-today" class="tab-panel">
        <div class="history-section">
          <div class="section-title">Desbloqueios hoje por responsável</div>
          <div class="history-user-cards">${userStatsCards(userTodayStats)}</div>
        </div>
        ${todayUsageCards ? `
          <div class="history-section">
            <div class="section-title">Uso de tela hoje</div>
            <div class="usage-list">${todayUsageCards}</div>
          </div>
        ` : ''}
      </div>

      <div id="tab-week" class="tab-panel hidden">
        <div class="history-section">
          <div class="section-title">Total da semana por responsável</div>
          <div class="history-user-cards">${userStatsCards(userWeekStats)}</div>
        </div>
        <div class="history-section">
          <div class="section-title">Por dia</div>
          <div class="week-days">${weekRows || '<p class="muted" style="text-align:center;padding:16px">Sem dados</p>'}</div>
        </div>
      </div>

      <div id="tab-detail" class="tab-panel hidden">
        <div class="history-section">
          <div class="section-title">Últimos desbloqueios (7 dias)</div>
          <div class="history-events">${detailedRows}</div>
        </div>
      </div>
    </div>
  `

  document.getElementById('btn-back').onclick = () => navigate('home')

  document.querySelectorAll('.htab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.htab').forEach(t => t.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'))
      tab.classList.add('active')
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden')
    }
  })
}
