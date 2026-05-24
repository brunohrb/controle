export function renderHome(app, state, navigate) {
  const { members, settings } = state

  app.innerHTML = `
    <div class="screen home-screen">
      <div class="home-hero">
        <div class="home-logo">🏠</div>
        <h1>${settings.app_name || 'Controle Familiar'}</h1>
        <p class="muted">Controle de uso de internet</p>
      </div>

      <div class="home-cards">
        <button class="home-card parent-card" id="btn-parent">
          <span class="home-card-icon">👨‍👩‍👧</span>
          <div>
            <div class="home-card-title">Painel dos Pais</div>
            <div class="home-card-sub">Configurações e relatórios</div>
          </div>
          <span class="chevron">›</span>
        </button>

        ${members.length === 0
          ? `<button class="home-card child-card" id="btn-child-new">
              <span class="home-card-icon">👧</span>
              <div>
                <div class="home-card-title">Meu Controle</div>
                <div class="home-card-sub">Nenhum membro cadastrado</div>
              </div>
              <span class="chevron">›</span>
            </button>`
          : members.map(m => `
            <button class="home-card child-card member-card" data-id="${m.id}">
              <span class="home-card-icon">${m.avatar || '👧'}</span>
              <div>
                <div class="home-card-title">${m.name}</div>
                <div class="home-card-sub">Ver meu uso de hoje</div>
              </div>
              <span class="chevron">›</span>
            </button>`).join('')}
      </div>
    </div>

    <div class="modal-overlay hidden" id="pin-modal">
      <div class="modal">
        <h2>🔐 Acesso dos Pais</h2>
        <p class="muted">Digite o PIN para continuar</p>
        <div class="pin-display" id="pin-display">────</div>
        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(k => `
            <button class="pin-key ${k === '✓' ? 'pin-confirm' : k === '⌫' ? 'pin-back' : ''}" data-key="${k}">${k}</button>
          `).join('')}
        </div>
        <button class="btn-ghost" id="pin-cancel">Cancelar</button>
      </div>
    </div>
  `

  let pinBuffer = ''

  function updatePinDisplay() {
    const el = document.getElementById('pin-display')
    el.textContent = pinBuffer.length === 0 ? '────' : '●'.repeat(pinBuffer.length).padEnd(4, '─')
  }

  function handlePinKey(k) {
    if (k === '⌫') {
      pinBuffer = pinBuffer.slice(0, -1)
      updatePinDisplay()
    } else if (k === '✓') {
      checkPin()
    } else if (pinBuffer.length < 4) {
      pinBuffer += String(k)
      updatePinDisplay()
      if (pinBuffer.length === 4) checkPin()
    }
  }

  function checkPin() {
    const correct = settings.parent_pin || '1234'
    if (pinBuffer === correct) {
      document.getElementById('pin-modal').classList.add('hidden')
      navigate('dashboard')
    } else {
      pinBuffer = ''
      updatePinDisplay()
      document.getElementById('pin-display').classList.add('shake')
      setTimeout(() => document.getElementById('pin-display')?.classList.remove('shake'), 500)
    }
  }

  document.getElementById('btn-parent').onclick = () => {
    pinBuffer = ''
    updatePinDisplay()
    document.getElementById('pin-modal').classList.remove('hidden')
  }

  document.getElementById('pin-cancel').onclick = () => {
    document.getElementById('pin-modal').classList.add('hidden')
  }

  document.querySelectorAll('.pin-key').forEach(btn => {
    btn.onclick = () => handlePinKey(btn.dataset.key)
  })

  document.querySelectorAll('.member-card').forEach(btn => {
    btn.onclick = () => {
      const member = members.find(m => m.id === btn.dataset.id)
      navigate('child', { member })
    }
  })

  const btnChildNew = document.getElementById('btn-child-new')
  if (btnChildNew) {
    btnChildNew.onclick = () => {
      pinBuffer = ''
      updatePinDisplay()
      document.getElementById('pin-modal').classList.remove('hidden')
    }
  }
}
