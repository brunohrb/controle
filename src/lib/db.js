import { supabase } from './supabase.js'

export async function getSettings() {
  const { data } = await supabase.from('ctrl_settings').select('*')
  return Object.fromEntries((data || []).map(r => [r.key, r.value]))
}

export async function setSetting(key, value) {
  await supabase.from('ctrl_settings').upsert({ key, value, updated_at: new Date().toISOString() })
}

export async function getMembers() {
  const { data } = await supabase.from('ctrl_members').select('*').eq('active', true).order('created_at')
  return data || []
}

export async function createMember(member) {
  const { data, error } = await supabase.from('ctrl_members').insert(member).select().single()
  if (error) throw error
  return data
}

export async function updateMember(id, updates) {
  const { error } = await supabase.from('ctrl_members').update(updates).eq('id', id)
  if (error) throw error
}

export async function deleteMember(id) {
  const { error } = await supabase.from('ctrl_members').update({ active: false }).eq('id', id)
  if (error) throw error
}

export async function getSites() {
  const { data } = await supabase.from('ctrl_sites').select('*').eq('active', true).order('name')
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

export async function getMemberLimits(memberId) {
  const { data } = await supabase.from('ctrl_member_limits').select('*').eq('member_id', memberId)
  return data || []
}

export async function setMemberLimit(memberId, siteId, limitMinutes) {
  await supabase.from('ctrl_member_limits').upsert({
    member_id: memberId,
    site_id: siteId,
    daily_limit_minutes: limitMinutes
  }, { onConflict: 'member_id,site_id' })
}

export async function startSession(siteId, memberId) {
  const { data, error } = await supabase.from('ctrl_sessions').insert({
    site_id: siteId,
    member_id: memberId,
    started_at: new Date().toISOString()
  }).select().single()
  if (error) throw error
  return data
}

export async function endSession(sessionId, startedAt) {
  const duration = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  await supabase.from('ctrl_sessions').update({
    ended_at: new Date().toISOString(),
    duration_seconds: duration
  }).eq('id', sessionId)
  return duration
}

export async function getOpenSessions() {
  const { data } = await supabase.from('ctrl_sessions').select('*').is('ended_at', null)
  return data || []
}

export async function getTodaySessions(memberId = null) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let query = supabase.from('ctrl_sessions')
    .select('*, ctrl_sites(id, name, icon, color)')
    .gte('started_at', today.toISOString())
  if (memberId) query = query.eq('member_id', memberId)
  const { data } = await query
  return data || []
}

export async function getWeekSessions() {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 6)
  weekAgo.setHours(0, 0, 0, 0)
  const { data } = await supabase.from('ctrl_sessions')
    .select('*, ctrl_sites(name, color), ctrl_members(name)')
    .gte('started_at', weekAgo.toISOString())
    .not('ended_at', 'is', null)
  return data || []
}

export async function getAllTodaySessions() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { data } = await supabase.from('ctrl_sessions')
    .select('*, ctrl_sites(id, name, icon, color), ctrl_members(id, name, avatar, color)')
    .gte('started_at', today.toISOString())
  return data || []
}

export async function getActiveBlocks() {
  const { data } = await supabase.from('ctrl_blocks')
    .select('*, ctrl_sites(name, icon), ctrl_members(name, avatar)')
    .eq('active', true)
    .order('blocked_at', { ascending: false })
  return data || []
}

export async function blockDomain(domain, siteId, memberId) {
  const { data, error } = await supabase.functions.invoke('ctrl-block', {
    body: { domain, site_id: siteId, member_id: memberId }
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
