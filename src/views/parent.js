import {
  getAllTodaySessions, getWeekSessions,
  getSites, createSite, updateSite, deleteSite,
  getMembers, createMember, updateMember, deleteMember,
  getMemberLimits, setMemberLimit,
  getSettings, setSetting
} from '../lib/db.js'
import { formatDuration, getPercentage, getProgressColor, groupSessionsBysite, groupSessionsByDay, showToast, AVATARS, COLORS, DAYS_PT } from '../lib/utils.js'

let chartInstances = {}

export async function renderParent(app, state, navigate) {
  app.innerHTML = `<div class="screen"><div class="loading"><div class="spinner"></div></div></div>`

  const [sessions, weekSessions, sites, members, settings] = await Promise.all([
    getAllTodaySessions(),
    getWeekSessions(),
    getSites(),
    getMembers(),
    getSettings()
  ])

  state.sites = sites
  state.members = members
  state.settings = settings

  function renderScreen(tab = 'today') {
    Object.values(chartInstances).forEach(c => c.destroy())
    chartInstances = {}

    app.innerHTML = `
      <div class="screen parent-screen">
        <header class="parent-header">
          <button class="btn-back" id="btn-back">‹</button>
          <h1>Painel dos Pais</h1>
        </header>

        <nav class="tab-nav">
          <button class="tab-btn ${tab === 'today' ? 'active' : ''}" data-tab="today">📊 Hoje</button>
          <button class="tab-btn ${tab === 'week' ? 'active' : ''}" data-tab="week">📈 Semana</button>
          <button class="tab-btn ${tab === 'sites' ? 'active' : ''}" data-tab="sites">🌐 Sites</button>
          <button class="tab-btn ${tab === 'members' ? 'active' : ''}" data-tab="members">👥 Membros</button>
          <button class="tab-btn ${tab === 'settings' ? 'active' : ''}" data-tab="settings">⚙️ Config</button>
        </nav>

        <div class="tab-content" id="tab-content">
          ${tab === 'today' ? renderToday() : ''}
          ${tab === 'week' ? renderWeek() : ''}
          ${tab === 'sites' ? renderSites() : ''}
          ${tab === 'members' ? renderMembers() : ''}
          ${tab === 'settings' ? renderSettings() : ''}
        </div>
      </div>
    `

    document.getElementById('btn-back').onclick = () => navigate('home')

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => renderScreen(btn.dataset.tab)
    })

    if (tab === 'today') setupTodayHandlers()
    if (tab === 'week') setupWeekChart()
    if (tab === 'sites') setupSitesHandlers()
    if (tab === 'members') setupMembersHandlers()
    if (tab === 'settings') setupSettingsHandlers()
  }

  // ── TODAY TAB ──────────────────────────────────────────────────────────────

  function renderToday() {
    const byMember = {}
    sessions.forEach(s => {
      const key = s.member_id || 'unknown'
      if (!byMember[key]) byMember[key] = { member: s.ctrl_members, sessions: [] }
      byMember[key].sessions.push(s)
    })

    const totalSeconds = sessions.reduce((acc, s) => {
      return acc + (s.duration_seconds ?? Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000))
    }, 0)
    const activeSessions = sessions.filter(s => !s.ended_at)

    return `
      <div class="today-stats">
        <div class="stat-card">
          <div class="stat-value">${formatDuration(totalSeconds)}</div>
          <div class="stat-label">Total hoje</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${activeSessions.length}</div>
          <div class="stat-label">Sessões ativas</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${sessions.length}</div>
          <div class="stat-label">Sessões totais</div>
        </div>
      </div>

      ${Object.values(byMember).length === 0
        ? `<div class="empty-state">Nenhum uso registrado hoje.</div>`
        : Object.values(byMember).map(({ member, sessions: ms }) => {
            const bySite = groupSessionsBysite(ms)
            return `
              <div class="member-report">
                <h3 class="member-report-title">${member?.avatar || '👤'} ${member?.name || 'Desconhecido'}</h3>
                ${Object.values(bySite).map(({ site, seconds }) => {
                  const siteObj = sites.find(s => s.id === site?.id)
                  const limit = siteObj?.daily_limit_minutes || 120
                  const pct = getPercentage(seconds, limit)
                  const color = getProgressColor(pct)
                  return `
                    <div class="report-row">
                      <span class="report-icon">${site?.icon || '🌐'}</span>
                      <div class="report-info">
                        <div class="report-name">${site?.name || '?'}</div>
                        <div class="progress-bar">
                          <div class="progress-fill" style="width:${pct}%;background:${color}"></div>
                        </div>
                      </div>
                      <div class="report-meta">
                        <span style="color:${color}">${formatDuration(seconds)}</span>
                        <span class="muted">/${limit}min</span>
                      </div>
                    </div>
                  `
                }).join('')}
              </div>
            `
          }).join('')}
    `
  }

  function setupTodayHandlers() {}

  // ── WEEK TAB ───────────────────────────────────────────────────────────────

  function renderWeek() {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push(d.toISOString().slice(0, 10))
    }

    return `
      <div class="chart-container">
        <h3>Uso diário (últimos 7 dias)</h3>
        <canvas id="week-chart"></canvas>
      </div>
      <div class="chart-container">
        <h3>Por site esta semana</h3>
        <canvas id="site-chart"></canvas>
      </div>
    `
  }

  function setupWeekChart() {
    import('chart.js').then(({ Chart, registerables }) => {
      Chart.register(...registerables)

      const days = []
      const labels = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        days.push(d.toISOString().slice(0, 10))
        labels.push(DAYS_PT[d.getDay()])
      }

      const dayMap = groupSessionsByDay(weekSessions)
      const data = days.map(d => Math.round((dayMap[d] || 0) / 60))

      const ctx1 = document.getElementById('week-chart')
      if (ctx1) {
        chartInstances.week = new Chart(ctx1, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Minutos',
              data,
              backgroundColor: '#6366F1',
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94A3B8' } },
              x: { grid: { display: false }, ticks: { color: '#94A3B8' } }
            }
          }
        })
      }

      const siteTotals = {}
      weekSessions.forEach(s => {
        const name = s.ctrl_sites?.name || '?'
        const color = s.ctrl_sites?.color || '#6366F1'
        if (!siteTotals[name]) siteTotals[name] = { total: 0, color }
        siteTotals[name].total += s.duration_seconds || 0
      })

      const ctx2 = document.getElementById('site-chart')
      if (ctx2 && Object.keys(siteTotals).length > 0) {
        chartInstances.site = new Chart(ctx2, {
          type: 'doughnut',
          data: {
            labels: Object.keys(siteTotals),
            datasets: [{
              data: Object.values(siteTotals).map(v => Math.round(v.total / 60)),
              backgroundColor: Object.values(siteTotals).map(v => v.color),
              borderWidth: 2,
              borderColor: '#1E293B'
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: 'bottom', labels: { color: '#F1F5F9', padding: 12 } }
            }
          }
        })
      } else if (ctx2) {
        ctx2.parentElement.innerHTML += '<p class="muted" style="text-align:center">Sem dados nesta semana</p>'
      }
    })
  }

  // ── SITES TAB ─────────────────────────────────────────────────────────────

  function renderSites() {
    return `
      <div class="section">
        <button class="btn-primary full-width" id="btn-add-site">+ Adicionar Site</button>
        <div id="sites-list">
          ${sites.map(s => `
            <div class="list-item" data-id="${s.id}">
              <span class="list-icon">${s.icon}</span>
              <div class="list-info">
                <div class="list-name">${s.name}</div>
                <div class="muted">${s.domain || ''} · ${s.daily_limit_minutes}min/dia</div>
              </div>
              <button class="btn-icon edit-site" data-id="${s.id}" title="Editar">✏️</button>
              <button class="btn-icon delete-site" data-id="${s.id}" title="Excluir">🗑️</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-overlay hidden" id="site-modal">
        <div class="modal">
          <h2 id="site-modal-title">Novo Site</h2>
          <input type="hidden" id="site-id" />
          <label>Nome</label>
          <input class="input" id="site-name" placeholder="Ex: YouTube" />
          <label>Domínio</label>
          <input class="input" id="site-domain" placeholder="Ex: youtube.com" />
          <label>Ícone (emoji)</label>
          <input class="input" id="site-icon" placeholder="Ex: ▶️" maxlength="4" />
          <label>Cor</label>
          <div class="color-picker" id="site-color-picker">
            ${COLORS.map(c => `<button class="color-dot" data-color="${c}" style="background:${c}"></button>`).join('')}
          </div>
          <input type="hidden" id="site-color" value="${COLORS[4]}" />
          <label>Limite diário (minutos)</label>
          <input class="input" type="number" id="site-limit" value="120" min="1" max="1440" />
          <div class="modal-actions">
            <button class="btn-ghost" id="site-cancel">Cancelar</button>
            <button class="btn-primary" id="site-save">Salvar</button>
          </div>
        </div>
      </div>
    `
  }

  function setupSitesHandlers() {
    document.getElementById('btn-add-site').onclick = () => openSiteModal()

    document.querySelectorAll('.edit-site').forEach(btn => {
      btn.onclick = () => {
        const site = sites.find(s => s.id === btn.dataset.id)
        if (site) openSiteModal(site)
      }
    })

    document.querySelectorAll('.delete-site').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Excluir este site?')) return
        await deleteSite(btn.dataset.id)
        const idx = sites.findIndex(s => s.id === btn.dataset.id)
        if (idx >= 0) sites.splice(idx, 1)
        renderScreen('sites')
        showToast('Site removido')
      }
    })
  }

  function openSiteModal(site = null) {
    document.getElementById('site-modal-title').textContent = site ? 'Editar Site' : 'Novo Site'
    document.getElementById('site-id').value = site?.id || ''
    document.getElementById('site-name').value = site?.name || ''
    document.getElementById('site-domain').value = site?.domain || ''
    document.getElementById('site-icon').value = site?.icon || '🌐'
    document.getElementById('site-color').value = site?.color || COLORS[4]
    document.getElementById('site-limit').value = site?.daily_limit_minutes || 120
    document.getElementById('site-modal').classList.remove('hidden')

    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.classList.toggle('selected', dot.dataset.color === (site?.color || COLORS[4]))
      dot.onclick = () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'))
        dot.classList.add('selected')
        document.getElementById('site-color').value = dot.dataset.color
      }
    })

    document.getElementById('site-cancel').onclick = () => {
      document.getElementById('site-modal').classList.add('hidden')
    }

    document.getElementById('site-save').onclick = async () => {
      const id = document.getElementById('site-id').value
      const data = {
        name: document.getElementById('site-name').value.trim(),
        domain: document.getElementById('site-domain').value.trim(),
        icon: document.getElementById('site-icon').value.trim() || '🌐',
        color: document.getElementById('site-color').value,
        daily_limit_minutes: parseInt(document.getElementById('site-limit').value) || 120
      }
      if (!data.name) { showToast('Informe o nome do site', 'error'); return }

      if (id) {
        await updateSite(id, data)
        const idx = sites.findIndex(s => s.id === id)
        if (idx >= 0) sites[idx] = { ...sites[idx], ...data }
        showToast('Site atualizado')
      } else {
        const newSite = await createSite(data)
        sites.push(newSite)
        showToast('Site adicionado')
      }
      document.getElementById('site-modal').classList.add('hidden')
      renderScreen('sites')
    }
  }

  // ── MEMBERS TAB ───────────────────────────────────────────────────────────

  function renderMembers() {
    return `
      <div class="section">
        <button class="btn-primary full-width" id="btn-add-member">+ Adicionar Membro</button>
        <div id="members-list">
          ${members.map(m => `
            <div class="list-item" data-id="${m.id}">
              <span class="list-icon">${m.avatar || '👤'}</span>
              <div class="list-info">
                <div class="list-name">${m.name}</div>
                <div class="muted">PIN: ${m.pin || '–'}</div>
              </div>
              <button class="btn-icon edit-limits" data-id="${m.id}" title="Limites">⏱️</button>
              <button class="btn-icon edit-member" data-id="${m.id}" title="Editar">✏️</button>
              <button class="btn-icon delete-member" data-id="${m.id}" title="Excluir">🗑️</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="modal-overlay hidden" id="member-modal">
        <div class="modal">
          <h2 id="member-modal-title">Novo Membro</h2>
          <input type="hidden" id="member-id" />
          <label>Nome</label>
          <input class="input" id="member-name" placeholder="Ex: Maria" />
          <label>Avatar</label>
          <div class="avatar-picker" id="avatar-picker">
            ${AVATARS.map(a => `<button class="avatar-opt" data-avatar="${a}">${a}</button>`).join('')}
          </div>
          <input type="hidden" id="member-avatar" value="${AVATARS[1]}" />
          <label>Cor</label>
          <div class="color-picker" id="member-color-picker">
            ${COLORS.map(c => `<button class="color-dot" data-color="${c}" style="background:${c}"></button>`).join('')}
          </div>
          <input type="hidden" id="member-color" value="${COLORS[0]}" />
          <div class="modal-actions">
            <button class="btn-ghost" id="member-cancel">Cancelar</button>
            <button class="btn-primary" id="member-save">Salvar</button>
          </div>
        </div>
      </div>

      <div class="modal-overlay hidden" id="limits-modal">
        <div class="modal">
          <h2>Limites por Site</h2>
          <p class="muted" id="limits-member-name"></p>
          <div id="limits-list"></div>
          <div class="modal-actions">
            <button class="btn-primary full-width" id="limits-save">Salvar Limites</button>
          </div>
        </div>
      </div>
    `
  }

  function setupMembersHandlers() {
    document.getElementById('btn-add-member').onclick = () => openMemberModal()

    document.querySelectorAll('.edit-member').forEach(btn => {
      btn.onclick = () => {
        const m = members.find(x => x.id === btn.dataset.id)
        if (m) openMemberModal(m)
      }
    })

    document.querySelectorAll('.delete-member').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Excluir este membro?')) return
        await deleteMember(btn.dataset.id)
        const idx = members.findIndex(m => m.id === btn.dataset.id)
        if (idx >= 0) members.splice(idx, 1)
        renderScreen('members')
        showToast('Membro removido')
      }
    })

    document.querySelectorAll('.edit-limits').forEach(btn => {
      btn.onclick = async () => {
        const m = members.find(x => x.id === btn.dataset.id)
        if (m) await openLimitsModal(m)
      }
    })
  }

  function openMemberModal(member = null) {
    document.getElementById('member-modal-title').textContent = member ? 'Editar Membro' : 'Novo Membro'
    document.getElementById('member-id').value = member?.id || ''
    document.getElementById('member-name').value = member?.name || ''
    document.getElementById('member-avatar').value = member?.avatar || AVATARS[1]
    document.getElementById('member-color').value = member?.color || COLORS[0]
    document.getElementById('member-modal').classList.remove('hidden')

    document.querySelectorAll('.avatar-opt').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.avatar === (member?.avatar || AVATARS[1]))
      btn.onclick = () => {
        document.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('selected'))
        btn.classList.add('selected')
        document.getElementById('member-avatar').value = btn.dataset.avatar
      }
    })

    document.querySelectorAll('#member-color-picker .color-dot').forEach(dot => {
      dot.classList.toggle('selected', dot.dataset.color === (member?.color || COLORS[0]))
      dot.onclick = () => {
        document.querySelectorAll('#member-color-picker .color-dot').forEach(d => d.classList.remove('selected'))
        dot.classList.add('selected')
        document.getElementById('member-color').value = dot.dataset.color
      }
    })

    document.getElementById('member-cancel').onclick = () => {
      document.getElementById('member-modal').classList.add('hidden')
    }

    document.getElementById('member-save').onclick = async () => {
      const id = document.getElementById('member-id').value
      const data = {
        name: document.getElementById('member-name').value.trim(),
        avatar: document.getElementById('member-avatar').value,
        color: document.getElementById('member-color').value
      }
      if (!data.name) { showToast('Informe o nome', 'error'); return }

      if (id) {
        await updateMember(id, data)
        const idx = members.findIndex(m => m.id === id)
        if (idx >= 0) members[idx] = { ...members[idx], ...data }
        showToast('Membro atualizado')
      } else {
        const newMember = await createMember(data)
        members.push(newMember)
        showToast('Membro adicionado')
      }
      document.getElementById('member-modal').classList.add('hidden')
      renderScreen('members')
    }
  }

  async function openLimitsModal(member) {
    const existing = await getMemberLimits(member.id)
    const limitMap = {}
    existing.forEach(l => { limitMap[l.site_id] = l.daily_limit_minutes })

    document.getElementById('limits-member-name').textContent = `${member.avatar} ${member.name}`
    document.getElementById('limits-list').innerHTML = sites.map(s => `
      <div class="limit-row">
        <span>${s.icon} ${s.name}</span>
        <input class="input input-sm" type="number" min="1" max="1440"
          data-site="${s.id}"
          value="${limitMap[s.id] ?? s.daily_limit_minutes}"
          placeholder="${s.daily_limit_minutes}" />
        <span class="muted">min</span>
      </div>
    `).join('')
    document.getElementById('limits-modal').classList.remove('hidden')

    document.getElementById('limits-save').onclick = async () => {
      const inputs = document.querySelectorAll('#limits-list input')
      for (const inp of inputs) {
        const val = parseInt(inp.value)
        if (val > 0) await setMemberLimit(member.id, inp.dataset.site, val)
      }
      document.getElementById('limits-modal').classList.add('hidden')
      showToast('Limites salvos')
    }
  }

  // ── SETTINGS TAB ──────────────────────────────────────────────────────────

  function renderSettings() {
    return `
      <div class="section">
        <h3>Configurações do App</h3>

        <label>Nome do App</label>
        <input class="input" id="app-name" value="${settings.app_name || 'Controle Familiar'}" />

        <label>PIN dos Pais (atual: ${settings.parent_pin || '1234'})</label>
        <input class="input" id="new-pin" type="number" placeholder="Novo PIN (4 dígitos)" maxlength="4" />

        <button class="btn-primary full-width" id="save-settings">Salvar Configurações</button>
      </div>
    `
  }

  function setupSettingsHandlers() {
    document.getElementById('save-settings').onclick = async () => {
      const name = document.getElementById('app-name').value.trim()
      const pin = document.getElementById('new-pin').value.trim()

      if (name) {
        await setSetting('app_name', name)
        settings.app_name = name
        state.settings.app_name = name
      }
      if (pin) {
        if (pin.length !== 4 || isNaN(pin)) { showToast('PIN deve ter 4 dígitos', 'error'); return }
        await setSetting('parent_pin', pin)
        settings.parent_pin = pin
        state.settings.parent_pin = pin
      }
      showToast('Configurações salvas')
    }
  }

  renderScreen('today')
}
