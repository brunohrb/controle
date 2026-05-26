import { startSession, endSession, getTodayUsage, getActiveBlocks, blockDomain, getExtraTime, getAutoSessions, unblockSite } from '../lib/db.js'
import { formatTimer, formatDuration, getPercentage, getProgressColor, showToast } from '../lib/utils.js'

const UNLOCK_OPTIONS = [
  { label: '2h', minutes: 120 },
  { label: '1h', minutes: 60 },
  { label: '30min', minutes: 30 },
  { label: '15min', minutes: 15 },
  { label: '1min', minutes: 1 },
]

export async function renderHome(app, state, navigate) {
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`

  const [usageMap, activeBlocks, extraTime, autoSessions] = await Promise.all([
    getTodayUsage(),
    getActiveBlocks(),
    getExtraTime(),
    getAutoSessions()
  ])

  const autoTrackedSites = new Set(autoSessions.map(s => s.site_id))

  for (const s of autoSessions) {
    if (!state.activeSessions[s.site_id]) {
      state.activeSessions[s.site_id] = {
        sessionId: s.id,
        startedAt: new Date(s.started_at).getTime(),
        auto: true
      }
    }
  }

  const blockedDomains = new Set(activeBlocks.map(b => b.domain))
  const { sites, settings } = state

  if (!state.activeSessions) state.activeSessions = {}
  if (!state.timers) state.timers = {}

  function getLimit(site) {
    return site.daily_limit_minutes + (extraTime[site.id] || 0)
  }

  function getUsed(site) {
    const base = usageMap[site.id] || 0
    const active = state.activeSessions[site.id]
    if (active) return base + Math.floor((Date.now() - active.startedAt) / 1000)
    return base
  }

  function isBlocked(site) {
    return site.domain && blockedDomains.has(site.domain)
  }

  function getCountdownSec(siteId) {
    const active = state.activeSessions[siteId]
    if (!active || !active.unlockMinutes) return null
    const reblockAt = active.startedAt + active.unlockMinutes * 60 * 1000
    return Math.max(0, Math.floor((reblockAt - Date.now()) / 1000))
  }

  function renderYouTubeCard(site) {
    const blocked = isBlocked(site)
    const isActive = !!state.activeSessions[site.id]
    const usedSec = getUsed(site)
    const countdownSec = isActive ? getCountdownSec(site.id) : null
    const active = state.activeSessions[site.id]

    if (blocked) {
      return `
        <div class="site-card youtube-blocked" data-site="${site.id}">
          <div class="site-card-header">
            <span class="site-icon">${site.icon}</span>
            <div class="site-info">
              <div class="site-name">${site.name} <span class="auto-block-badge">Bloqueado</span></div>
              <div class="site-usage muted">Hoje: ${formatDuration(usedSec)} de uso</div>
            </div>
            <span class="badge-blocked">🔒</span>
          </div>
          <div class="unlock-options">
            <span class="unlock-label">Liberar por:</span>
            <div class="unlock-btns">
              ${UNLOCK_OPTIONS.map(o => `
                <button class="unlock-btn" data-site="${site.id}" data-mins="${o.minutes}">${o.label}</button>
              `).join('')}
            </div>
          </div>
        </div>
      `
    }

    if (isActive) {
      const elapsed = Math.floor((Date.now() - active.startedAt) / 1000)
      const unlockMins = active.unlockMinutes || 0
      const cdPct = unlockMins > 0
        ? Math.max(0, 100 - (elapsed / (unlockMins * 60)) * 100)
        : null

      return `
        <div class="site-card active youtube-active" data-site="${site.id}">
          <div class="site-card-header">
            <span class="site-icon">${site.icon}</span>
            <div class="site-info">
              <div class="site-name">${site.name} <span class="active-badge">▶ Ativo</span></div>
              <div class="site-usage">
                <span id="used-${site.id}">${formatDuration(usedSec)}</span>
                <span class="muted"> hoje</span>
              </div>
            </div>
            <button class="btn-stop" data-site="${site.id}">⏹ Parar</button>
          </div>
          ${cdPct !== null ? `
            <div class="countdown-bar">
              <div class="countdown-fill" id="cd-bar-${site.id}" style="width:${cdPct}%"></div>
            </div>
            <div class="countdown-display" id="cd-${site.id}">
              ⏱ ${countdownSec !== null ? formatTimer(countdownSec) : '--:--'} restantes
            </div>
          ` : `
            <div class="timer-display" id="timer-${site.id}">${formatTimer(elapsed)}</div>
          `}
        </div>
      `
    }

    // Não bloqueado, sem sessão ativa (foi desbloqueado mas parou)
    return `
      <div class="site-card youtube-free" data-site="${site.id}">
        <div class="site-card-header">
          <span class="site-icon">${site.icon}</span>
          <div class="site-info">
            <div class="site-name">${site.name}</div>
            <div class="site-usage muted">Hoje: ${formatDuration(usedSec)} de uso</div>
          </div>
          <button class="btn-start" data-site="${site.id}">▶ Iniciar</button>
        </div>
        <div class="unlock-options" style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
          <span class="unlock-label">🔒 Bloquear novamente:</span>
          <button class="btn-block-manual" data-site="${site.id}" data-domain="${site.domain}">Bloquear YouTube</button>
        </div>
      </div>
    `
  }

  function renderCard(site) {
    if (site.auto_block_daily) return renderYouTubeCard(site)

    const limitMins = getLimit(site)
    const usedSec = getUsed(site)
    const pct = getPercentage(usedSec, limitMins)
    const color = getProgressColor(pct)
    const isActive = !!state.activeSessions[site.id]
    const isAuto = autoTrackedSites.has(site.id)
    const blocked = isBlocked(site)
    const over = pct >= 100

    return `
      <div class="site-card ${isActive ? 'active' : ''} ${blocked || over ? 'over-limit' : ''}" data-site="${site.id}">
        <div class="site-card-header">
          <span class="site-icon">${site.icon}</span>
          <div class="site-info">
            <div class="site-name">
              ${site.name}
              ${isAuto ? `<span class="auto-badge">🤖 Auto</span>` : ''}
            </div>
            <div class="site-usage">
              <span id="used-${site.id}" style="color:${color}">${formatDuration(usedSec)}</span>
              <span class="muted"> / ${limitMins}min</span>
              ${extraTime[site.id] ? `<span class="extra-badge">+${extraTime[site.id]}min</span>` : ''}
            </div>
          </div>
          <div class="card-actions">
            ${blocked
              ? `<span class="badge-blocked">🔒</span>`
              : isActive
                ? `<button class="btn-stop" data-site="${site.id}">⏹</button>`
                : `<button class="btn-start${over ? ' disabled' : ''}" data-site="${site.id}" ${over ? 'disabled' : ''}>▶</button>`
            }
            ${!blocked && site.domain
              ? `<button class="btn-block-sm" data-site="${site.id}" data-domain="${site.domain}" title="Bloquear">🔒</button>`
              : blocked ? `<button class="btn-unblock-sm" data-site="${site.id}" data-domain="${site.domain}" title="Desbloquear">🔓</button>` : ''
            }
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="bar-${site.id}" style="width:${pct}%;background:${color}"></div>
        </div>
        ${isActive ? `<div class="timer-display" id="timer-${site.id}">${formatTimer(Math.floor((Date.now() - state.activeSessions[site.id].startedAt) / 1000))}</div>` : ''}
        ${blocked ? `<div class="limit-msg">🔒 Bloqueado</div>`
          : over ? `<div class="limit-msg">⛔ Limite diário atingido</div>` : ''}
      </div>
    `
  }

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const user = state.currentUser

  app.innerHTML = `
    <div class="screen home-screen-v2">
      <header class="home-header">
        <div>
          <h1>${settings.app_name || 'Controle Familiar'}</h1>
          <p class="muted">${today}</p>
        </div>
        <div class="header-actions">
          ${user ? `
            <span class="user-chip" style="background:${user.color}22;color:${user.color}">
              ${user.name[0]} ${user.name}
            </span>
          ` : ''}
          <button class="btn-icon" id="btn-history" title="Histórico">📊</button>
          <button class="btn-icon" id="btn-settings" title="Configurações">⚙️</button>
          <button class="btn-icon" id="btn-logout" title="Sair">↩</button>
        </div>
      </header>

      <div class="sites-list" id="sites-list">
        ${sites.length === 0
          ? `<div class="empty-state">Nenhum site configurado.</div>`
          : sites.map(renderCard).join('')}
      </div>
    </div>
  `

  // Header buttons
  document.getElementById('btn-history').onclick = () => navigate('history')
  document.getElementById('btn-settings').onclick = () => navigate('dashboard')
  document.getElementById('btn-logout').onclick = () => {
    state.currentUser = null
    navigate('login')
  }

  // Unlock YouTube buttons
  document.querySelectorAll('.unlock-btn').forEach(btn => {
    btn.onclick = async () => {
      const siteId = btn.dataset.site
      const minutes = parseInt(btn.dataset.mins)
      const site = sites.find(s => s.id === siteId)
      btn.textContent = '...'
      btn.disabled = true
      try {
        const session = await unblockSite(siteId, site.domain, state.currentUser?.id, minutes)
        state.activeSessions[siteId] = {
          sessionId: session.id,
          startedAt: new Date(session.started_at).getTime(),
          unlockMinutes: minutes
        }
        blockedDomains.delete(site.domain)
        showToast(`🔓 ${site.name} liberado por ${minutes >= 60 ? minutes/60 + 'h' : minutes + 'min'}`)
        renderHome(app, state, navigate)
      } catch (e) {
        showToast('Erro ao desbloquear: ' + e.message, 'error')
        btn.textContent = btn.dataset.label
        btn.disabled = false
      }
    }
  })

  // Block manual buttons
  document.querySelectorAll('.btn-block-manual, .btn-block-sm').forEach(btn => {
    btn.onclick = async () => {
      const site = sites.find(s => s.id === btn.dataset.site)
      try {
        if (state.activeSessions[btn.dataset.site]) {
          await stopSite(btn.dataset.site)
        }
        await blockDomain(btn.dataset.domain, btn.dataset.site)
        blockedDomains.add(btn.dataset.domain)
        showToast(`🔒 ${site.name} bloqueado`)
        renderHome(app, state, navigate)
      } catch (e) {
        showToast('Erro ao bloquear: ' + e.message, 'error')
      }
    }
  })

  // Unblock buttons (for non-auto-block sites)
  document.querySelectorAll('.btn-unblock-sm').forEach(btn => {
    btn.onclick = async () => {
      const site = sites.find(s => s.id === btn.dataset.site)
      const { unblockDomain } = await import('../lib/db.js')
      try {
        await unblockDomain(btn.dataset.domain)
        blockedDomains.delete(btn.dataset.domain)
        showToast(`🔓 ${site.name} desbloqueado`)
        renderHome(app, state, navigate)
      } catch (e) {
        showToast('Erro: ' + e.message, 'error')
      }
    }
  })

  // Start/Stop for regular sites
  async function startSite(siteId) {
    const site = sites.find(s => s.id === siteId)
    const btn = document.querySelector(`[data-site="${siteId}"].btn-start`)
    if (btn) { btn.textContent = '...'; btn.disabled = true }
    try {
      const session = await startSession(siteId, { userId: state.currentUser?.id })
      state.activeSessions[siteId] = { sessionId: session.id, startedAt: new Date(session.started_at).getTime() }
      const card = document.querySelector(`[data-site="${siteId}"]`)
      if (card) {
        card.classList.add('active')
        if (btn) {
          btn.className = 'btn-stop'; btn.textContent = '⏹'; btn.disabled = false
          btn.onclick = () => stopSite(siteId)
        }
        if (!card.querySelector('.timer-display')) {
          const d = document.createElement('div')
          d.className = 'timer-display'; d.id = `timer-${siteId}`; d.textContent = '00:00'
          card.appendChild(d)
        }
      }
      startTimer(siteId)
      showToast(`▶ ${site.name} iniciado`)
    } catch (e) {
      showToast('Erro: ' + e.message, 'error')
      if (btn) { btn.textContent = '▶'; btn.disabled = false }
    }
  }

  async function stopSite(siteId) {
    const active = state.activeSessions[siteId]
    if (!active) return 0
    const site = sites.find(s => s.id === siteId)
    clearInterval(state.timers[siteId]); delete state.timers[siteId]
    const duration = await endSession(active.sessionId, new Date(active.startedAt).toISOString())
    usageMap[siteId] = (usageMap[siteId] || 0) + duration
    delete state.activeSessions[siteId]
    if (site && !site._blocked) showToast(`⏹ ${site.name}: ${formatDuration(duration)} registrado`)
    return duration
  }

  document.querySelectorAll('.btn-start:not(.disabled)').forEach(btn =>
    btn.onclick = () => startSite(btn.dataset.site))
  document.querySelectorAll('.btn-stop').forEach(btn =>
    btn.onclick = () => stopSite(btn.dataset.site).then(() => renderHome(app, state, navigate)))

  // ── TIMERS ────────────────────────────────────────────────────────────────

  function startTimer(siteId) {
    if (state.timers[siteId]) return
    const site = sites.find(s => s.id === siteId)

    state.timers[siteId] = setInterval(async () => {
      const active = state.activeSessions[siteId]
      if (!active) return
      const elapsed = Math.floor((Date.now() - active.startedAt) / 1000)

      // Countdown para sites com unlock_minutes (YouTube)
      if (active.unlockMinutes) {
        const remaining = Math.max(0, active.unlockMinutes * 60 - elapsed)
        const cdEl = document.getElementById(`cd-${siteId}`)
        const cdBar = document.getElementById(`cd-bar-${siteId}`)
        const usedEl = document.getElementById(`used-${siteId}`)
        const pct = Math.max(0, 100 - (elapsed / (active.unlockMinutes * 60)) * 100)
        if (cdEl) cdEl.textContent = `⏱ ${formatTimer(remaining)} restantes`
        if (cdBar) cdBar.style.width = `${pct}%`
        if (usedEl) usedEl.textContent = formatDuration((usageMap[siteId] || 0) + elapsed)

        if (remaining === 0) {
          clearInterval(state.timers[siteId]); delete state.timers[siteId]
          await stopSite(siteId)
          showToast(`⏱ Tempo do ${site.name} esgotado! Bloqueando...`, 'warning')
          try {
            await blockDomain(site.domain, siteId)
            blockedDomains.add(site.domain)
            showToast(`🔒 ${site.name} bloqueado automaticamente`, 'error')
          } catch (e) {
            showToast(`Erro ao bloquear: ${e.message}`, 'error')
          }
          renderHome(app, state, navigate)
        }
        return
      }

      // Timer normal para outros sites
      const base = usageMap[siteId] || 0
      const total = base + elapsed
      const limitMins = getLimit(site)
      const pct = getPercentage(total, limitMins)
      const color = getProgressColor(pct)

      const t = document.getElementById(`timer-${siteId}`)
      const u = document.getElementById(`used-${siteId}`)
      const b = document.getElementById(`bar-${siteId}`)
      if (t) t.textContent = formatTimer(elapsed)
      if (u) { u.textContent = formatDuration(total); u.style.color = color }
      if (b) { b.style.width = `${pct}%`; b.style.background = color }

      if (pct >= 100 && !site._blocked) {
        site._blocked = true
        clearInterval(state.timers[siteId]); delete state.timers[siteId]
        await stopSite(siteId)
        if (site.domain) {
          showToast(`⏱️ ${site.name}: limite atingido! Bloqueando...`, 'warning')
          try {
            await blockDomain(site.domain, siteId)
            blockedDomains.add(site.domain)
            showToast(`🔒 ${site.name} bloqueado!`, 'error')
          } catch (e) {
            showToast(`Erro ao bloquear: ${e.message}`, 'error')
          }
        } else {
          showToast(`⛔ ${site.name}: limite diário atingido!`, 'error')
        }
        renderHome(app, state, navigate)
      } else if (pct >= 75 && !site._warn75) {
        site._warn75 = true
        const remaining = Math.round((limitMins * 60 - total) / 60)
        showToast(`⚠️ ${site.name}: faltam ${remaining}min`, 'warning')
      }
    }, 1000)
  }

  // Retomar timers ativos
  Object.keys(state.activeSessions).forEach(siteId => {
    if (sites.some(s => s.id === siteId)) startTimer(siteId)
  })
}
