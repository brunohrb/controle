import './styles/main.css'
import { getSettings, getSites, getOpenSessions, endSession, setSetting, unblockAll, getUsers } from './lib/db.js'
import { renderLogin } from './views/login.js'
import { renderHome } from './views/home.js'
import { renderHistory } from './views/history.js'
import { renderParent } from './views/parent.js'

const app = document.getElementById('app')

export const state = {
  view: 'login',
  settings: {},
  sites: [],
  users: [],
  currentUser: null,
  activeSessions: {},
  timers: {}
}

export function navigate(view, params = {}) {
  if (state.view !== view) {
    Object.values(state.timers || {}).forEach(t => clearInterval(t))
    state.timers = {}
  }
  Object.assign(state, params)
  state.view = view
  renderApp()
}

export function renderApp() {
  if (!state.currentUser && state.view !== 'login') {
    state.view = 'login'
  }
  if (state.view === 'dashboard') return renderParent(app, state, navigate)
  if (state.view === 'history') return renderHistory(app, state, navigate)
  if (state.view === 'login') return renderLogin(app, state, navigate)
  return renderHome(app, state, navigate)
}

async function init() {
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div><p>Carregando...</p></div>`

  try {
    const openSessions = await getOpenSessions()
    const cutoff = Date.now() - 12 * 60 * 60 * 1000

    for (const s of openSessions) {
      if (new Date(s.started_at).getTime() < cutoff) {
        await endSession(s.id, s.started_at)
      } else {
        state.activeSessions[s.site_id] = {
          sessionId: s.id,
          startedAt: new Date(s.started_at).getTime(),
          unlockMinutes: s.unlock_minutes || null
        }
      }
    }

    const [settings, sites, users] = await Promise.all([getSettings(), getSites(), getUsers()])
    state.settings = settings
    state.sites = sites
    state.users = users

    const today = new Date().toISOString().slice(0, 10)
    if (settings.last_reset_date && settings.last_reset_date !== today) {
      try { await unblockAll() } catch (e) { console.warn('unblockAll falhou:', e) }
    }
    if (settings.last_reset_date !== today) {
      await setSetting('last_reset_date', today)
    }

    navigate('login')
  } catch (e) {
    console.error(e)
    app.innerHTML = `
      <div class="error-screen">
        <div class="error-icon">⚠️</div>
        <h2>Erro de conexão</h2>
        <p>${e.message || 'Verifique sua internet.'}</p>
        <button class="btn-primary" onclick="location.reload()">Tentar novamente</button>
      </div>
    `
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/controle/sw.js').catch(() => {})
}

init()
