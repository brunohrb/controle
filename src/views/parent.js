import {
  getSites, createSite, updateSite, deleteSite,
  getSettings, setSetting,
  getActiveBlocks, unblockDomain, unblockAll,
  getWeekSessions, addExtraTime, getExtraTime
} from '../lib/db.js'
import { formatDuration, groupSessionsByDay, showToast, COLORS, DAYS_PT } from '../lib/utils.js'

let charts = {}

export async function renderParent(app, state, navigate) {
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`

  const [sites, settings, activeBlocks, weekSessions, extraTime] = await Promise.all([
    getSites(), getSettings(), getActiveBlocks(), getWeekSessions(), getExtraTime()
  ])

  state.sites = sites
  state.settings = settings

  function render(tab = 'blocks') {
    Object.values(charts).forEach(c => c.destroy()); charts = {}

    app.innerHTML = `
      <div class="screen parent-screen">
        <header class="parent-header">
          <button class="btn-back" id="btn-back">‹</button>
          <h1>Painel dos Pais</h1>
        </header>
        <nav class="tab-nav">
          <button class="tab-btn ${tab==='blocks'?'active':''}" data-tab="blocks">
            🔒 Bloqueios${activeBlocks.length ? ` <span class="badge-count">${activeBlocks.length}</span>` : ''}
          </button>
          <button class="tab-btn ${tab==='sites'?'active':''}" data-tab="sites">🌐 Sites</button>
          <button class="tab-btn ${tab==='week'?'active':''}" data-tab="week">📈 Semana</button>
          <button class="tab-btn ${tab==='settings'?'active':''}" data-tab="settings">⚙️ Config</button>
        </nav>
        <div class="tab-content">
          ${tab==='blocks' ? renderBlocks() : ''}
          ${tab==='sites' ? renderSites() : ''}
          ${tab==='week' ? renderWeek() : ''}
          ${tab==='settings' ? renderSettings() : ''}
        </div>
      </div>
    `

    document.getElementById('btn-back').onclick = () => navigate('home')
    document.querySelectorAll('.tab-btn').forEach(b => b.onclick = () => render(b.dataset.tab))

    if (tab === 'blocks') setupBlocks()
    if (tab === 'sites') setupSites()
    if (tab === 'week') setupWeekChart()
    if (tab === 'settings') setupSettings()
  }

  // ── BLOQUEIOS ──────────────────────────────────────────────────────────────

  function renderBlocks() {
    return `
      <div class="section">
        <h3>Sites ativos hoje</h3>
        ${sites.map(site => {
          const extra = extraTime[site.id] || 0
          const isBlocked = activeBlocks.some(b => b.domain === site.domain)
          return `
            <div class="list-item">
              <span class="list-icon">${site.icon}</span>
              <div class="list-info">
                <div class="list-name">${site.name}</div>
                <div class="muted">${site.daily_limit_minutes}min/dia${extra ? ` + ${extra}min extra hoje` : ''}</div>
              </div>
              <div class="row-actions">
                <button class="btn-extra" data-site="${site.id}" data-name="${site.name}">+Tempo</button>
                ${isBlocked
                  ? `<button class="btn-primary btn-sm btn-unblock" data-domain="${site.domain}">Liberar</button>`
                  : `<span class="badge-ok">✓ Livre</span>`}
              </div>
            </div>
          `
        }).join('')}

        ${activeBlocks.length > 0 ? `
          <button class="btn-danger-sm" id="btn-unblock-all" style="margin-top:8px">
            Liberar todos os bloqueios
          </button>
        ` : ''}

        <div class="nextdns-info" style="margin-top:16px">
          <h3>📱 Como configurar os dispositivos</h3>
          <p class="muted" style="margin-bottom:8px">Configure o DNS abaixo em cada dispositivo para o bloqueio funcionar:</p>
          <div class="dns-card">
            <div class="dns-row"><span class="dns-label">DNS Primário</span><code class="dns-value">${settings.nextdns_dns1||'45.90.28.55'}</code></div>
            <div class="dns-row"><span class="dns-label">DNS Secundário</span><code class="dns-value">${settings.nextdns_dns2||'45.90.30.55'}</code></div>
            <div class="dns-row"><span class="dns-label">Android (DNS privado)</span><code class="dns-value">${settings.nextdns_profile_id||'2e2969'}.dns.nextdns.io</code></div>
          </div>
          <div class="device-guides">
            <div class="device-guide"><strong>📺 Smart TV (Android TV / Samsung)</strong><p>Configurações → Rede → Wi-Fi → Config avançadas → DNS → <code>${settings.nextdns_dns1||'45.90.28.55'}</code></p></div>
            <div class="device-guide"><strong>📱 Android</strong><p>Configurações → Wi-Fi → segurar na rede → Modificar → IP Avançado → DNS: <code>${settings.nextdns_dns1||'45.90.28.55'}</code><br>Ou: Configurações → Conexões → Mais → DNS privado → <code>${settings.nextdns_profile_id||'2e2969'}.dns.nextdns.io</code></p></div>
            <div class="device-guide"><strong>🍎 iPhone</strong><p>Ajustes → Wi-Fi → (i) → Configurar DNS → Manual → <code>${settings.nextdns_dns1||'45.90.28.55'}</code></p></div>
          </div>
        </div>
      </div>

      <div class="modal-overlay hidden" id="extra-modal">
        <div class="modal">
          <h2>➕ Adicionar tempo extra</h2>
          <p class="muted" id="extra-site-name"></p>
          <div class="extra-options">
            ${[15,30,60,120].map(m => `<button class="btn-extra-opt" data-mins="${m}">+${m}min</button>`).join('')}
          </div>
          <p class="muted" style="font-size:12px;text-align:center">O site será desbloqueado automaticamente se estiver bloqueado.</p>
          <button class="btn-ghost" id="extra-cancel">Cancelar</button>
        </div>
      </div>
    `
  }

  function setupBlocks() {
    document.querySelectorAll('.btn-unblock').forEach(btn => {
      btn.onclick = async () => {
        btn.textContent = '...'; btn.disabled = true
        try {
          await unblockDomain(btn.dataset.domain)
          const idx = activeBlocks.findIndex(b => b.domain === btn.dataset.domain)
          if (idx >= 0) activeBlocks.splice(idx, 1)
          showToast('✅ Site liberado')
          render('blocks')
        } catch (e) {
          showToast('Erro: ' + e.message, 'error')
          btn.textContent = 'Liberar'; btn.disabled = false
        }
      }
    })

    const btnAll = document.getElementById('btn-unblock-all')
    if (btnAll) btnAll.onclick = async () => {
      btnAll.textContent = 'Liberando...'; btnAll.disabled = true
      try {
        await unblockAll()
        activeBlocks.length = 0
        showToast('✅ Todos liberados')
        render('blocks')
      } catch (e) {
        showToast('Erro: ' + e.message, 'error')
        btnAll.textContent = 'Liberar todos'; btnAll.disabled = false
      }
    }

    let currentSiteId = null
    document.querySelectorAll('.btn-extra').forEach(btn => {
      btn.onclick = () => {
        currentSiteId = btn.dataset.site
        document.getElementById('extra-site-name').textContent = btn.dataset.name
        document.getElementById('extra-modal').classList.remove('hidden')
      }
    })

    document.getElementById('extra-cancel').onclick = () =>
      document.getElementById('extra-modal').classList.add('hidden')

    document.querySelectorAll('.btn-extra-opt').forEach(btn => {
      btn.onclick = async () => {
        const mins = parseInt(btn.dataset.mins)
        btn.textContent = '...'; btn.disabled = true
        try {
          await addExtraTime(currentSiteId, mins)
          extraTime[currentSiteId] = (extraTime[currentSiteId] || 0) + mins

          // Se estava bloqueado, desbloquear
          const site = sites.find(s => s.id === currentSiteId)
          const block = activeBlocks.find(b => b.domain === site?.domain)
          if (block && site?.domain) {
            await unblockDomain(site.domain)
            activeBlocks.splice(activeBlocks.indexOf(block), 1)
          }

          showToast(`✅ +${mins}min adicionados`)
          document.getElementById('extra-modal').classList.add('hidden')
          render('blocks')
        } catch (e) {
          showToast('Erro: ' + e.message, 'error')
          btn.textContent = `+${mins}min`; btn.disabled = false
        }
      }
    })
  }

  // ── SITES ──────────────────────────────────────────────────────────────────

  function renderSites() {
    return `
      <div class="section">
        <button class="btn-primary full-width" id="btn-add-site">+ Adicionar Site</button>
        ${sites.map(s => `
          <div class="list-item">
            <span class="list-icon">${s.icon}</span>
            <div class="list-info">
              <div class="list-name">${s.name}</div>
              <div class="muted">${s.domain || '–'} · ${s.daily_limit_minutes}min/dia</div>
            </div>
            <button class="btn-icon edit-site" data-id="${s.id}">✏️</button>
            <button class="btn-icon delete-site" data-id="${s.id}">🗑️</button>
          </div>
        `).join('')}
      </div>

      <div class="modal-overlay hidden" id="site-modal">
        <div class="modal">
          <h2 id="site-modal-title">Novo Site</h2>
          <input type="hidden" id="site-id" />
          <label>Nome</label>
          <input class="input" id="site-name" placeholder="Ex: YouTube" />
          <label>Domínio (para bloqueio)</label>
          <input class="input" id="site-domain" placeholder="Ex: youtube.com" />
          <label>Ícone (emoji)</label>
          <input class="input" id="site-icon" placeholder="▶️" maxlength="4" />
          <label>Cor</label>
          <div class="color-picker" id="color-picker">
            ${COLORS.map(c => `<button class="color-dot" data-color="${c}" style="background:${c}"></button>`).join('')}
          </div>
          <input type="hidden" id="site-color" value="${COLORS[4]}" />
          <label>Limite diário (minutos)</label>
          <input class="input" type="number" id="site-limit" value="60" min="1" max="1440" />
          <div class="modal-actions">
            <button class="btn-ghost" id="site-cancel">Cancelar</button>
            <button class="btn-primary" id="site-save">Salvar</button>
          </div>
        </div>
      </div>
    `
  }

  function setupSites() {
    document.getElementById('btn-add-site').onclick = () => openSiteModal()
    document.querySelectorAll('.edit-site').forEach(btn => {
      btn.onclick = () => openSiteModal(sites.find(s => s.id === btn.dataset.id))
    })
    document.querySelectorAll('.delete-site').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Excluir este site?')) return
        await deleteSite(btn.dataset.id)
        sites.splice(sites.findIndex(s => s.id === btn.dataset.id), 1)
        showToast('Removido'); render('sites')
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
    document.getElementById('site-limit').value = site?.daily_limit_minutes || 60
    document.getElementById('site-modal').classList.remove('hidden')

    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.classList.toggle('selected', dot.dataset.color === (site?.color || COLORS[4]))
      dot.onclick = () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'))
        dot.classList.add('selected')
        document.getElementById('site-color').value = dot.dataset.color
      }
    })

    document.getElementById('site-cancel').onclick = () =>
      document.getElementById('site-modal').classList.add('hidden')

    document.getElementById('site-save').onclick = async () => {
      const btn = document.getElementById('site-save')
      const id = document.getElementById('site-id').value
      const data = {
        name: document.getElementById('site-name').value.trim(),
        domain: document.getElementById('site-domain').value.trim().toLowerCase(),
        icon: document.getElementById('site-icon').value.trim() || '🌐',
        color: document.getElementById('site-color').value,
        daily_limit_minutes: parseInt(document.getElementById('site-limit').value) || 60
      }
      if (!data.name) { showToast('Informe o nome', 'error'); return }
      btn.textContent = 'Salvando...'; btn.disabled = true
      try {
        if (id) {
          await updateSite(id, data)
          Object.assign(sites.find(s => s.id === id), data)
          showToast('Atualizado')
        } else {
          sites.push(await createSite(data))
          state.sites = sites
          showToast('Site adicionado')
        }
        document.getElementById('site-modal').classList.add('hidden')
        render('sites')
      } catch (e) {
        showToast('Erro: ' + e.message, 'error')
        btn.textContent = 'Salvar'; btn.disabled = false
      }
    }
  }

  // ── SEMANA ─────────────────────────────────────────────────────────────────

  function renderWeek() {
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
      const days = [], labels = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        days.push(d.toISOString().slice(0, 10))
        labels.push(DAYS_PT[d.getDay()])
      }

      const dayMap = groupSessionsByDay(weekSessions)
      const ctx1 = document.getElementById('week-chart')
      if (ctx1) {
        charts.week = new Chart(ctx1, {
          type: 'bar',
          data: { labels, datasets: [{ label: 'Minutos', data: days.map(d => Math.round((dayMap[d]||0)/60)), backgroundColor: '#6366F1', borderRadius: 6 }] },
          options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94A3B8' } }, x: { grid: { display: false }, ticks: { color: '#94A3B8' } } } }
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
        charts.site = new Chart(ctx2, {
          type: 'doughnut',
          data: { labels: Object.keys(siteTotals), datasets: [{ data: Object.values(siteTotals).map(v => Math.round(v.total/60)), backgroundColor: Object.values(siteTotals).map(v => v.color), borderWidth: 2, borderColor: '#1E293B' }] },
          options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#F1F5F9', padding: 12 } } } }
        })
      } else if (ctx2) ctx2.parentElement.innerHTML += '<p class="muted" style="text-align:center;margin-top:12px">Sem dados esta semana</p>'
    })
  }

  // ── CONFIG ─────────────────────────────────────────────────────────────────

  function renderSettings() {
    return `
      <div class="section">
        <h3>Configurações</h3>
        <label>Nome do App</label>
        <input class="input" id="app-name" value="${settings.app_name || 'Controle Familiar'}" />
        <label>PIN dos Pais (atual: ${settings.parent_pin || '1234'})</label>
        <input class="input" id="new-pin" type="number" placeholder="Novo PIN (4 dígitos)" />
        <button class="btn-primary full-width" id="save-settings">Salvar</button>
      </div>
    `
  }

  function setupSettings() {
    document.getElementById('save-settings').onclick = async () => {
      const btn = document.getElementById('save-settings')
      btn.textContent = 'Salvando...'; btn.disabled = true
      try {
        const name = document.getElementById('app-name').value.trim()
        const pin = document.getElementById('new-pin').value.trim()
        if (name) { await setSetting('app_name', name); state.settings.app_name = name; settings.app_name = name }
        if (pin) {
          if (pin.length !== 4 || isNaN(pin)) { showToast('PIN deve ter 4 dígitos', 'error'); return }
          await setSetting('parent_pin', pin); state.settings.parent_pin = pin; settings.parent_pin = pin
        }
        showToast('Salvo!')
      } catch (e) {
        showToast('Erro: ' + e.message, 'error')
      } finally {
        btn.textContent = 'Salvar'; btn.disabled = false
      }
    }
  }

  render('blocks')
}
