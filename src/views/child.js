import { startSession, endSession, getTodaySessions, getMemberLimits, getActiveBlocks, blockDomain } from '../lib/db.js'
import { formatTimer, formatDuration, getPercentage, getProgressColor, groupSessionsBysite, showToast } from '../lib/utils.js'

export async function renderChild(app, state, navigate) {
  const { member, sites } = state
  if (!member) { navigate('home'); return }

  app.innerHTML = `<div class="screen"><div class="loading"><div class="spinner"></div></div></div>`

  const [sessions, memberLimits, activeBlocks] = await Promise.all([
    getTodaySessions(member.id),
    getMemberLimits(member.id),
    getActiveBlocks()
  ])

  const limitMap = {}
  memberLimits.forEach(l => { limitMap[l.site_id] = l.daily_limit_minutes })

  const usageMap = groupSessionsBysite(sessions)

  // set of currently blocked domains
  const blockedDomains = new Set(activeBlocks.map(b => b.domain))

  if (!state.activeSessions) state.activeSessions = {}
  if (!state.timers) state.timers = {}

  sessions
    .filter(s => !s.ended_at)
    .forEach(s => {
      if (!state.activeSessions[s.site_id]) {
        state.activeSessions[s.site_id] = { sessionId: s.id, startedAt: new Date(s.started_at).getTime() }
      }
    })

  function getLimit(site) {
    return limitMap[site.id] ?? site.daily_limit_minutes
  }

  function getUsed(siteId) {
    const base = usageMap[siteId]?.seconds || 0
    const active = state.activeSessions[siteId]
    if (active) return base + Math.floor((Date.now() - active.startedAt) / 1000)
    return base
  }

  function isBlocked(site) {
    return site.domain && blockedDomains.has(site.domain)
  }

  function renderSiteCard(site) {
    const limitMins = getLimit(site)
    const usedSeconds = getUsed(site.id)
    const pct = getPercentage(usedSeconds, limitMins)
    const color = getProgressColor(pct)
    const isActive = !!state.activeSessions[site.id]
    const isOver = pct >= 100
    const blocked = isBlocked(site)

    return `
      <div class="site-card ${isActive ? 'active' : ''} ${isOver || blocked ? 'over-limit' : ''}" data-site="${site.id}">
        <div class="site-card-header">
          <span class="site-icon">${site.icon}</span>
          <div class="site-info">
            <div class="site-name">${site.name}</div>
            <div class="site-usage">
              <span id="used-${site.id}" style="color:${color}">${formatDuration(usedSeconds)}</span>
              <span class="muted"> / ${limitMins}min</span>
            </div>
          </div>
          ${blocked
            ? `<span class="badge-blocked">🔒 Bloqueado</span>`
            : isActive
              ? `<button class="btn-stop" data-site="${site.id}">⏹ Parar</button>`
              : `<button class="btn-start ${isOver ? 'disabled' : ''}" data-site="${site.id}" ${isOver ? 'disabled' : ''}>▶ Iniciar</button>`}
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="bar-${site.id}" style="width:${pct}%;background:${color}"></div>
        </div>
        ${isActive ? `<div class="timer-display" id="timer-${site.id}">${formatTimer(Math.floor((Date.now() - state.activeSessions[site.id].startedAt) / 1000))}</div>` : ''}
        ${blocked ? `<div class="limit-msg">🔒 Bloqueado pelo NextDNS — peça ao responsável para liberar</div>` : isOver ? `<div class="limit-msg">⛔ Limite diário atingido</div>` : ''}
      </div>
    `
  }

  const totalUsed = Object.values(usageMap).reduce((acc, v) => acc + v.seconds, 0)

  app.innerHTML = `
    <div class="screen child-screen">
      <header class="child-header">
        <button class="btn-back" id="btn-back">‹</button>
        <div>
          <div class="child-name">${member.avatar || '👧'} ${member.name}</div>
          <div class="child-date muted">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div class="child-total">
          <span class="child-total-label">Hoje</span>
          <span class="child-total-value">${formatDuration(totalUsed)}</span>
        </div>
      </header>

      ${blockedDomains.size > 0 ? `
        <div class="blocked-banner">
          🔒 ${blockedDomains.size} site(s) bloqueado(s) hoje. Peça ao responsável para liberar.
        </div>
      ` : ''}

      <div class="sites-list" id="sites-list">
        ${sites.length === 0
          ? `<div class="empty-state">Nenhum site configurado pelos pais.</div>`
          : sites.map(renderSiteCard).join('')}
      </div>
    </div>
  `

  document.getElementById('btn-back').onclick = () => {
    clearAllTimers()
    navigate('home')
  }

  function clearAllTimers() {
    Object.values(state.timers || {}).forEach(t => clearInterval(t))
    state.timers = {}
  }

  function startTimer(siteId) {
    if (state.timers[siteId]) return
    state.timers[siteId] = setInterval(() => {
      const active = state.activeSessions[siteId]
      if (!active) return

      const elapsed = Math.floor((Date.now() - active.startedAt) / 1000)
      const site = sites.find(s => s.id === siteId)
      const base = usageMap[siteId]?.seconds || 0
      const total = base + elapsed
      const limitMins = getLimit(site)
      const pct = getPercentage(total, limitMins)
      const color = getProgressColor(pct)

      const timerEl = document.getElementById(`timer-${siteId}`)
      const usedEl = document.getElementById(`used-${siteId}`)
      const barEl = document.getElementById(`bar-${siteId}`)

      if (timerEl) timerEl.textContent = formatTimer(elapsed)
      if (usedEl) { usedEl.textContent = formatDuration(total); usedEl.style.color = color }
      if (barEl) { barEl.style.width = `${pct}%`; barEl.style.background = color }

      if (pct >= 100 && !site._warned) {
        site._warned = true
        stopSite(siteId).then(() => {
          // Bloquear via NextDNS se o site tiver domínio configurado
          if (site.domain) {
            showToast(`🔒 ${site.name}: bloqueando no NextDNS...`, 'warning')
            blockDomain(site.domain, site.id, member.id)
              .then(() => {
                blockedDomains.add(site.domain)
                showToast(`🔒 ${site.name} bloqueado até amanhã!`, 'error')
                const card = document.querySelector(`[data-site="${siteId}"]`)
                if (card) {
                  card.classList.add('over-limit')
                  const btn = card.querySelector('.btn-start, .btn-stop')
                  if (btn) {
                    btn.replaceWith(Object.assign(document.createElement('span'), { className: 'badge-blocked', textContent: '🔒 Bloqueado' }))
                  }
                  const existingMsg = card.querySelector('.limit-msg')
                  if (existingMsg) existingMsg.textContent = '🔒 Bloqueado pelo NextDNS — peça ao responsável para liberar'
                }
              })
              .catch(() => showToast(`⛔ ${site.name}: limite atingido`, 'error'))
          } else {
            showToast(`⛔ ${site.name}: limite diário atingido!`, 'error')
          }
        })
      } else if (pct >= 75 && !site._warn75) {
        site._warn75 = true
        showToast(`⚠️ ${site.name}: 75% do limite — restam ${Math.round((limitMins * 60 - total) / 60)}min`, 'warning')
      }
    }, 1000)
  }

  async function startSite(siteId) {
    const site = sites.find(s => s.id === siteId)
    try {
      const session = await startSession(siteId, member.id)
      state.activeSessions[siteId] = { sessionId: session.id, startedAt: new Date(session.started_at).getTime() }

      const card = document.querySelector(`[data-site="${siteId}"]`)
      if (card) {
        card.classList.add('active')
        const btn = card.querySelector('.btn-start')
        if (btn) {
          btn.className = 'btn-stop'
          btn.dataset.site = siteId
          btn.textContent = '⏹ Parar'
          btn.onclick = () => stopSite(siteId)
        }
        if (!card.querySelector('.timer-display')) {
          const timerDiv = document.createElement('div')
          timerDiv.className = 'timer-display'
          timerDiv.id = `timer-${siteId}`
          timerDiv.textContent = '00:00'
          card.appendChild(timerDiv)
        }
      }

      startTimer(siteId)
      showToast(`▶ ${site.name} iniciado`)
    } catch (e) {
      showToast('Erro ao iniciar sessão', 'error')
    }
  }

  async function stopSite(siteId) {
    const active = state.activeSessions[siteId]
    if (!active) return
    const site = sites.find(s => s.id === siteId)

    clearInterval(state.timers[siteId])
    delete state.timers[siteId]

    const duration = await endSession(active.sessionId, new Date(active.startedAt).toISOString())
    usageMap[siteId] = usageMap[siteId] || { seconds: 0 }
    usageMap[siteId].seconds += duration
    delete state.activeSessions[siteId]

    const card = document.querySelector(`[data-site="${siteId}"]`)
    if (card) {
      card.classList.remove('active')
      const btn = card.querySelector('.btn-stop')
      if (btn) {
        const limitMins = getLimit(site)
        const pct = getPercentage(usageMap[siteId].seconds, limitMins)
        btn.className = `btn-start${pct >= 100 ? ' disabled' : ''}`
        btn.dataset.site = siteId
        btn.textContent = '▶ Iniciar'
        btn.disabled = pct >= 100
        btn.onclick = pct >= 100 ? null : () => startSite(siteId)
      }
      const timerDiv = document.getElementById(`timer-${siteId}`)
      if (timerDiv) timerDiv.remove()
    }

    showToast(`⏹ ${site.name}: ${formatDuration(duration)} registrado`)
    return duration
  }

  document.querySelectorAll('.btn-start:not(.disabled)').forEach(btn => {
    btn.onclick = () => startSite(btn.dataset.site)
  })

  document.querySelectorAll('.btn-stop').forEach(btn => {
    btn.onclick = () => stopSite(btn.dataset.site)
  })

  Object.keys(state.activeSessions).forEach(siteId => {
    if (sites.some(s => s.id === siteId)) startTimer(siteId)
  })
}
