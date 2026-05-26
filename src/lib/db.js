import { supabase } from './supabase.js'

// ── SETTINGS ──────────────────────────────────────────────────────────────

export async function getSettings() {
  const { data } = await supabase.from('ctrl_settings').select('*')
  return Object.fromEntries((data || []).map(r => [r.key, r.value]))
}

export async function setSetting(key, value) {
  const { error } = await supabase.from('ctrl_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ── SITES ──────────────────────────────────────────────────────────────────

export async function getSites() {
  const { data, error } = await supabase.from('ctrl_sites')
    .select('*').eq('active', true).order('name')
  if (error) throw error
  return data || []
}

export async function createSite(site) {
  const { data, error } = await supabase.from('ctrl_sites').insert(site).select().single()
  if (error) throw error
  return data
}

export async function updateSite(id, updates) {
  const { error } = await supabase.from('ctrl_sites').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteSite(id) {
  const { error } = await supabase.from('ctrl_sites').update({ active: false }).eq('id', id)
  if (error) throw error
}

// ── SESSIONS ───────────────────────────────────────────────────────────────

export async function startSession(siteId, { auto = false } = {}) {
  const { data, error } = await supabase.from('ctrl_sessions').insert({
    site_id: siteId,
    started_at: new Date().toISOString(),
    auto
  }).select().single()
  if (error) throw error
  return data
}

export async function getAutoSessions() {
  const { data } = await supabase.from('ctrl_sessions')
    .select('*')
    .is('ended_at', null)
    .eq('auto', true)
  return data || []
}

export async function endSession(sessionId, startedAt) {
  const duration = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  const { error } = await supabase.from('ctrl_sessions').update({
    ended_at: new Date().toISOString(),
    duration_seconds: duration
  }).eq('id', sessionId)
  if (error) throw error
  return duration
}

export async function getOpenSessions() {
  const { data } = await supabase.from('ctrl_sessions').select('*').is('ended_at', null)
  return data || []
}

export async function getTodayUsage() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const { data } = await supabase.from('ctrl_sessions')
    .select('site_id, duration_seconds, started_at, ended_at')
    .gte('started_at', today.toISOString())
  const map = {}
  for (const s of data || []) {
    const dur = s.duration_seconds != null
      ? s.duration_seconds
      : Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000)
    map[s.site_id] = (map[s.site_id] || 0) + dur
  }
  return map
}

export async function getWeekSessions() {
  const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0)
  const { data } = await supabase.from('ctrl_sessions')
    .select('site_id, started_at, duration_seconds, ctrl_sites(name, color)')
    .gte('started_at', d.toISOString())
    .not('ended_at', 'is', null)
  return data || []
}

// ── BLOCKS ────────────────────────────────────────────────────────────────

export async function getActiveBlocks() {
  const { data } = await supabase.from('ctrl_blocks')
    .select('*, ctrl_sites(name, icon)')
    .eq('active', true)
    .order('blocked_at', { ascending: false })
  return data || []
}

export async function blockDomain(domain, siteId) {
  const { data, error } = await supabase.functions.invoke('ctrl-block', {
    body: { domain, site_id: siteId }
  })
  if (error) throw error
  return data
}

export async function unblockDomain(domain) {
  const { data, error } = await supabase.functions.invoke('ctrl-unblock', {
    body: { domain }
  })
  if (error) throw error
  return data
}

export async function unblockAll() {
  const { data, error } = await supabase.functions.invoke('ctrl-unblock', {
    body: { all: true }
  })
  if (error) throw error
  return data
}

export async function getNextDNSStatus() {
  const { data, error } = await supabase.functions.invoke('ctrl-status', { body: {} })
  if (error) throw error
  return data
}

// ── EXTRA TIME ────────────────────────────────────────────────────────────
// Armazena tempo extra liberado hoje pelo pai (ex: +30min no YouTube)

export async function getExtraTime() {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase.from('ctrl_settings')
    .select('key, value')
    .like('key', `extra_${today}_%`)
  const map = {}
  for (const r of data || []) {
    const siteId = r.key.replace(`extra_${today}_`, '')
    map[siteId] = parseInt(r.value) || 0
  }
  return map
}

export async function addExtraTime(siteId, minutes) {
  const today = new Date().toISOString().slice(0, 10)
  const key = `extra_${today}_${siteId}`
  const { data: existing } = await supabase.from('ctrl_settings')
    .select('value').eq('key', key).single()
  const current = parseInt(existing?.value) || 0
  await setSetting(key, String(current + minutes))
}
