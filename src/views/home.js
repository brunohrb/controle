import { startSession, endSession, getTodayUsage, getActiveBlocks, blockDomain, getExtraTime, getAutoSessions } from '../lib/db.js'
import { formatTimer, formatDuration, getPercentage, getProgressColor, showToast } from '../lib/utils.js'

export async function renderHome(app, state, navigate) {
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`

  const [usageMap, activeBlocks, extraTime, autoSessions] = await Promise.all([
    getTodayUsage(),
    getActiveBlocks(),
    getExtraTime(),
    getAutoSessions()
  ])

  // Build set of site IDs currently being auto-tracked
  const autoTrackedSites = new Set(autoSessions.map(s => s.site_id))

  // Sync auto sessions into state.activeSessions so timers work
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

  function renderCard(site) {
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
              ${isAuto ? `<span class="auto-badge" title="Sessão detectada automaticamente via DNS">🤖 Auto</span>` : ''}
            </div>
            <div class="site-usage">
              <span id="used-${site.id}" style="color:${color}">${formatDuration(usedSec)}</span>
              <span class="muted"> / ${limitMins}min</span>
              ${extraTime[site.id] ? `<span class="extra-badge">+${extraTime[site.id]}min</span>` : ''}
            </div>
          </div>
          ${blocked
            ? `<span class="badge-blocked">🔒</span>`
            : isActive
              ? `<button class="btn-stop" data-site="${site.id}">⏹ Parar</button>`
              : `<button class="btn-start${over ? ' disabled' : ''}" data-site="${site.id}" ${over ? 'disabled' : ''}>▶ Iniciar</button>`
          }
        </div>
        <div class="progress-bar">
          <div class="progress-fill" id="bar-${site.id}" style="width:${pct}%;background:${color}"></div>
        </div>
        ${isActive ? `<div class="timer-display" id="timer-${site.id}">${formatTimer(Math.floor((Date.now() - state.activeSessions[site.id].startedAt) / 1000))}</div>` : ''}
        ${blocked ? `<div class="limit-msg">🔒 Bloqueado — peça ao responsável para liberar</div>`
          : over ? `<div class="limit-msg">⛔ Limite diário atingido</div>` : ''}
      </div>
    `
  }

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  app.innerHTML = `
    <div class="screen home-screen-v2">
      <header class="home-header">
        <div>
          <h1>${settings.app_name || 'Controle Familiar'}</h1>
          <p class="muted">${today}</p>
        </div>
        <button class="btn-parent" id="btn-parent" title="Painel dos Pais">⚙️</button>
      </header>

      ${blockedDomains.size > 0 ? `
        <div class="blocked-banner">🔒 ${blockedDomains.size} site(s) bloqueado(s) hoje</div>
      ` : ''}

      <div class="usage-tip">
        ▶ Pressione <strong>Iniciar</strong> antes de abrir o site para cronometrar o uso
      </div>

      <div class="sites-list" id="sites-list">
        ${sites.length === 0
          ? `<div class="empty-state">Nenhum site configurado.<br>Acesse o painel dos pais para adicionar.</div>`
          : sites.map(renderCard).join('')}
      </div>
    </div>

    <div class="modal-overlay hidden" id="pin-modal">
      <div class="modal">
        <h2>🔐 Acesso dos Pais</h2>
        <p class="muted">Digite o PIN para continuar</p>
        <div class="pin-display" id="pin-display">────</div>
        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(k => `
            <button class="pin-key ${k==='✓'?'pin-confirm':k==='⌫'?'pin-back':''}" data-key="${k}">${k}</button>
          `).join('')}
        </div>
        <button class="btn-ghost" id="pin-cancel">Cancelar</button>
      </div>
    </div>
  `

  // PIN
  let pinBuffer = ''
  const updatePin = () => {
    document.getElementById('pin-display').textContent =
      pinBuffer.length === 0 ? '────' : '●'.repeat(pinBuffer.length).padEnd(4, '─')
  }

  document.getElementById('btn-parent').onclick = () => {
    pinBuffer = ''; updatePin()
    document.getElementById('pin-modal').classList.remove('hidden')
  }
  document.getElementById('pin-cancel').onclick = () =>
    document.getElementById('pin-modal').classList.add('hidden')

  document.querySelectorAll('.pin-key').forEach(btn => {
    btn.onclick = () => {
      const k = btn.dataset.key
      if (k === '⌫') { pinBuffer = pinBuffer.slice(0, -1); updatePin() }
      else if (k === '✓') checkPin()
      else if (pinBuffer.length < 4) { pinBuffer += k; updatePin(); if (pinBuffer.length === 4) checkPin() }
    }
  })

  function checkPin() {
    if (pinBuffer === (state.settings.parent_pin || '1234')) {
      document.getElementById('pin-modal').classList.add('hidden')
      navigate('dashboard')
    } else {
      pinBuffer = ''; updatePin()
      const el = document.getElementById('pin-display')
      el.classList.add('shake')
      setTimeout(() => el?.classList.remove('shake'), 500)
    }
  }

  // Timers
  function startTimer(siteId) {
    if (state.timers[siteId]) return
    state.timers[siteId] = setInterval(() => {
      const active = state.activeSessions[siteId]
      if (!active) return
      const site = sites.find(s => s.id === siteId)
      const base = usageMap[siteId] || 0
      const elapsed = Math.floor((Date.now() - active.startedAt) / 1000)
      const total = base + elapsed
      const limitMins = getLimit(site)
      const pct = getPercentage(total, limitMins)
      const color = getProgressColor(pct)

      document.getElementById(`timer-${siteId}`)?.setAttribute('data-t', '')
      const t = document.getElementById(`timer-${siteId}`)
      const u = document.getElementById(`used-${siteId}`)
      const b = document.getElementById(`bar-${siteId}`)
      if (t) t.textContent = formatTimer(elapsed)
      if (u) { u.textContent = formatDuration(total); u.style.color = color }
      if (b) { b.style.width = `${pct}%`; b.style.background = color }

      if (pct >= 100 && !site._blocked) {
        site._blocked = true
        stopSite(siteId).then(() => {
          if (site.domain) {
            showToast(`⏱️ ${site.name}: limite atingido! Bloqueando...`, 'warning')
            blockDomain(site.domain, site.id)
              .then(() => {
                blockedDomains.add(site.domain)
                showToast(`🔒 ${site.name} bloqueado!`, 'error')
                renderHome(app, state, navigate)
              })
              .catch(err => {
                showToast(`⛔ Limite atingido (erro ao bloquear: ${err.message})`, 'error')
                renderHome(app, state, navigate)
              })
          } else {
            showToast(`⛔ ${site.name}: limite diário atingido!`, 'error')
            renderHome(app, state, navigate)
          }
        }).catch(err => showToast(`Erro ao parar sessão: ${err.message}`, 'error'))
      } else if (pct >= 75 && !site._warn75) {
        site._warn75 = true
        const remaining = Math.round((limitMins * 60 - total) / 60)
        showToast(`⚠️ ${site.name}: faltam ${remaining}min`, 'warning')
      }
    }, 1000)
  }

  async function startSite(siteId) {
    const site = sites.find(s => s.id === siteId)
    const btn = document.querySelector(`[data-site="${siteId}"].btn-start`)
    if (btn) { btn.textContent = '...'; btn.disabled = true }
    try {
      const session = await startSession(siteId)
      state.activeSessions[siteId] = { sessionId: session.id, startedAt: new Date(session.started_at).getTime() }

      const card = document.querySelector(`[data-site="${siteId}"]`)
      if (card) {
        card.classList.add('active')
        if (btn) {
          btn.className = 'btn-stop'; btn.textContent = '⏹ Parar'; btn.disabled = false
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
      showToast('Erro ao iniciar: ' + e.message, 'error')
      if (btn) { btn.textContent = '▶ Iniciar'; btn.disabled = false }
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

    const card = document.querySelector(`[data-site="${siteId}"]`)
    if (card) {
      card.classList.remove('active')
      const btn = card.querySelector('.btn-stop')
      if (btn) {
        const pct = getPercentage(usageMap[siteId], getLimit(site))
        btn.className = `btn-start${pct >= 100 ? ' disabled' : ''}`
        btn.textContent = '▶ Iniciar'; btn.disabled = pct >= 100
        btn.onclick = pct >= 100 ? null : () => startSite(siteId)
      }
      card.querySelector('.timer-display')?.remove()
    }
    if (site && !site._blocked) showToast(`⏹ ${site.name}: ${formatDuration(duration)} registrado`)
    return duration
  }

  document.querySelectorAll('.btn-start:not(.disabled)').forEach(btn =>
    btn.onclick = () => startSite(btn.dataset.site))
  document.querySelectorAll('.btn-stop').forEach(btn =>
    btn.onclick = () => stopSite(btn.dataset.site))

  // Retomar timers ativos
  Object.keys(state.activeSessions).forEach(siteId => {
    if (sites.some(s => s.id === siteId)) startTimer(siteId)
  })
}
