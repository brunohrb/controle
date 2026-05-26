export function renderLogin(app, state, navigate) {
  app.innerHTML = `
    <div class="screen login-screen">
      <div class="login-logo">
        <div class="login-logo-icon">🏠</div>
        <h1>${state.settings.app_name || 'Controle Familiar'}</h1>
        <p class="muted">Acesso dos responsáveis</p>
      </div>

      <div id="user-cards" class="user-cards">
        ${state.users.map(u => `
          <button class="user-card" data-user="${u.id}" style="--user-color:${u.color}">
            <span class="user-avatar" style="background:${u.color}">${u.name[0].toUpperCase()}</span>
            <span class="user-name">${u.name}</span>
          </button>
        `).join('')}
      </div>

      <div id="pin-section" class="pin-section hidden">
        <p class="muted" id="pin-label">Digite o PIN</p>
        <div class="pin-display" id="pin-display">────</div>
        <div class="pin-pad">
          ${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(k => `
            <button class="pin-key ${k==='✓'?'pin-confirm':k==='⌫'?'pin-back':''}" data-key="${k}">${k}</button>
          `).join('')}
        </div>
        <button class="btn-ghost" id="back-to-users">← Voltar</button>
      </div>
    </div>
  `

  let selectedUser = null
  let pinBuffer = ''

  const updatePin = () => {
    document.getElementById('pin-display').textContent =
      pinBuffer.length === 0 ? '────' : '●'.repeat(pinBuffer.length).padEnd(4, '─')
  }

  document.querySelectorAll('.user-card').forEach(btn => {
    btn.onclick = () => {
      selectedUser = state.users.find(u => u.id === btn.dataset.user)
      pinBuffer = ''
      document.getElementById('user-cards').classList.add('hidden')
      document.getElementById('pin-section').classList.remove('hidden')
      document.getElementById('pin-label').textContent = `PIN de ${selectedUser.name}`
      updatePin()
    }
  })

  document.getElementById('back-to-users').onclick = () => {
    selectedUser = null
    pinBuffer = ''
    document.getElementById('pin-section').classList.add('hidden')
    document.getElementById('user-cards').classList.remove('hidden')
  }

  document.querySelectorAll('.pin-key').forEach(btn => {
    btn.onclick = () => {
      const k = btn.dataset.key
      if (k === '⌫') { pinBuffer = pinBuffer.slice(0, -1); updatePin() }
      else if (k === '✓') checkPin()
      else if (pinBuffer.length < 4) { pinBuffer += k; updatePin(); if (pinBuffer.length === 4) checkPin() }
    }
  })

  function checkPin() {
    if (selectedUser && pinBuffer === selectedUser.pin) {
      state.currentUser = selectedUser
      navigate('home')
    } else {
      pinBuffer = ''
      updatePin()
      const el = document.getElementById('pin-display')
      el.classList.add('shake')
      setTimeout(() => el?.classList.remove('shake'), 500)
    }
  }
}
