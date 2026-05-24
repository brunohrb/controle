import './styles/main.css'
import { getSettings, getMembers, getSites, getOpenSessions, endSession } from './lib/db.js'
import { renderHome } from './views/home.js'
import { renderChild } from './views/child.js'
import { renderParent } from './views/parent.js'

const app = document.getElementById('app')

export const state = {
  view: 'home',
  member: null,
  settings: {},
  members: [],
  sites: [],
  activeSessions: {},
  timers: {}
}

export function navigate(view, params = {}) {
  if (state.view === 'child' && view !== 'child') {
    Object.values(state.timers || {}).forEach(t => clearInterval(t))
    state.timers = {}
  }
  Object.assign(state, params)
  state.view = view
  renderApp()
}

export function renderApp() {
  switch (state.view) {
    case 'home': return renderHome(app, state, navigate)
    case 'child': return renderChild(app, state, navigate)
    case 'dashboard': return renderParent(app, state, navigate)
    default: return renderHome(app, state, navigate)
  }
}

async function init() {
  app.innerHTML = `
    <div class="loading-screen">
      <div class="spinner"></div>
      <p>Carregando...</p>
    </div>
  `

  try {
    const openSessions = await getOpenSessions()
    const cutoff = Date.now() - 15 * 60 * 1000

    for (const s of openSessions) {
      if (new Date(s.started_at).getTime() < cutoff) {
        await endSession(s.id, s.started_at)
      } else {
        state.activeSessions[s.site_id] = {
          sessionId: s.id,
          startedAt: new Date(s.started_at).getTime()
        }
      }
    }

    const [settings, members, sites] = await Promise.all([
      getSettings(),
      getMembers(),
      getSites()
    ])

    state.settings = settings
    state.members = members
    state.sites = sites

    renderApp()
  } catch (e) {
    app.innerHTML = `
      <div class="error-screen">
        <div class="error-icon">⚠️</div>
        <h2>Erro de conexão</h2>
        <p>Verifique sua internet e tente novamente.</p>
        <button class="btn-primary" onclick="location.reload()">Tentar novamente</button>
      </div>
    `
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/controle/sw.js').catch(() => {})
}

init()
