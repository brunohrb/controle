// RAM Connect - Widget para Scriptable
// Cole no Scriptable e adicione como widget na tela inicial

const SUPABASE_URL = 'https://hisbbtddpoxufvghxqtm.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpc2JidGRkcG94dWZ2Z2h4cXRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMDM0OTgsImV4cCI6MjA4Nzc3OTQ5OH0.r3VkLkBxeorkCYjB-y6WOchePdfRKsm5lWE1iSSYlrw'

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
}

async function apiFetch(path, method = 'GET', body = null) {
  const req = new Request(`${SUPABASE_URL}${path}`)
  req.method = method
  req.headers = headers
  if (body) req.body = JSON.stringify(body)
  return req.loadJSON()
}

async function getVehicle() {
  const data = await apiFetch('/rest/v1/vehicles?select=*&limit=1')
  return data[0] || null
}

async function getStatus(vehicleId) {
  const data = await apiFetch(`/rest/v1/vehicle_status?vehicle_id=eq.${vehicleId}&select=*&limit=1`)
  return data[0] || null
}

// Executa um comando no carro (START, STOP, LOCK, UNLOCK, HORN, LIGHTS)
async function sendCommand(command) {
  // Fase 1: solicitar credenciais
  const phase1 = await invokeFunction('vehicle-command', { command })

  if (!phase1 || phase1.error) {
    throw new Error(phase1?.error || 'Falha na fase 1')
  }

  // Se não precisa de credenciais AWS, já executou
  if (!phase1.needs_aws_creds) return phase1

  // Fase 2: obter credenciais AWS via Cognito
  const { uid, identityId, token, gigyaJwt, region } = phase1
  let accessKeyId, secretKey, sessionToken

  const cognitoUrl = `https://cognito-identity.${region}.amazonaws.com/`
  const cognitoHeaders = {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'AmazonCognitoIdentity.GetCredentialsForIdentity'
  }

  // Tenta método 1: gigyaJwt
  try {
    const req1 = new Request(cognitoUrl)
    req1.method = 'POST'
    req1.headers = cognitoHeaders
    req1.body = JSON.stringify({
      IdentityId: identityId,
      Logins: { 'accounts.us1.gigya.com': gigyaJwt }
    })
    const creds1 = await req1.loadJSON()
    if (creds1?.Credentials) {
      accessKeyId = creds1.Credentials.AccessKeyId
      secretKey = creds1.Credentials.SecretKey
      sessionToken = creds1.Credentials.SessionToken
    }
  } catch (_) {}

  // Tenta método 2: cognito token
  if (!accessKeyId) {
    const req2 = new Request(cognitoUrl)
    req2.method = 'POST'
    req2.headers = cognitoHeaders
    req2.body = JSON.stringify({
      IdentityId: identityId,
      Logins: { 'cognito-identity.amazonaws.com': token }
    })
    const creds2 = await req2.loadJSON()
    if (creds2?.Credentials) {
      accessKeyId = creds2.Credentials.AccessKeyId
      secretKey = creds2.Credentials.SecretKey
      sessionToken = creds2.Credentials.SessionToken
    }
  }

  if (!accessKeyId) throw new Error('Não foi possível obter credenciais AWS')

  // Fase 3: executar comando com credenciais AWS
  return invokeFunction('vehicle-command', {
    command, uid, accessKeyId, secretKey, sessionToken
  })
}

async function invokeFunction(name, body) {
  const req = new Request(`${SUPABASE_URL}/functions/v1/${name}`)
  req.method = 'POST'
  req.headers = headers
  req.body = JSON.stringify(body)
  return req.loadJSON()
}

// ── APP MODE ──────────────────────────────────────────────────────────────

async function runApp() {
  const vehicle = await getVehicle()
  if (!vehicle) {
    const a = new Alert()
    a.title = '🚗 RAM Connect'
    a.message = 'Nenhum veículo encontrado.'
    a.addAction('OK')
    await a.presentAlert()
    return
  }

  const status = await getStatus(vehicle.id)
  const engineOn = status?.engine_running
  const locked = status?.door_lock_status === 'LOCKED'

  const alert = new Alert()
  alert.title = `🚗 ${vehicle.name || 'RAM'}`
  alert.message = [
    `Motor: ${engineOn ? '🟢 Ligado' : '⚫ Desligado'}`,
    `Portas: ${locked ? '🔒 Travado' : '🔓 Destravado'}`,
  ].join('\n')

  if (engineOn) {
    alert.addAction('⏹ Desligar motor')
  } else {
    alert.addDestructiveAction('🚗 Ligar motor')
  }

  if (locked) {
    alert.addAction('🔓 Destravar')
  } else {
    alert.addAction('🔒 Travar')
  }

  alert.addAction('📯 Buzina')
  alert.addAction('💡 Pisca luzes')
  alert.addCancelAction('Fechar')

  const choice = await alert.presentAlert()
  if (choice === -1) return

  const commands = engineOn
    ? ['STOP', locked ? 'UNLOCK' : 'LOCK', 'HORN', 'LIGHTS']
    : ['START', locked ? 'UNLOCK' : 'LOCK', 'HORN', 'LIGHTS']

  const command = commands[choice]
  if (!command) return

  // Confirmação para ligar motor
  if (command === 'START') {
    const confirm = new Alert()
    confirm.title = '🚗 Ligar motor?'
    confirm.message = 'Tem certeza que deseja ligar o motor remotamente?'
    confirm.addDestructiveAction('Sim, ligar')
    confirm.addCancelAction('Cancelar')
    if (await confirm.presentAlert() !== 0) return
  }

  const loading = new Alert()
  loading.title = '⏳ Enviando comando...'
  loading.message = 'Aguarde'
  // Não apresentamos loading como alert pois não tem await, só executamos o comando

  try {
    await sendCommand(command)
    const done = new Alert()
    done.title = '✅ Comando enviado!'
    done.message = `${commandLabel(command)} executado com sucesso.`
    done.addAction('OK')
    await done.presentAlert()
  } catch (e) {
    const err = new Alert()
    err.title = '❌ Erro'
    err.message = e.message || 'Falha ao enviar comando.'
    err.addAction('OK')
    await err.presentAlert()
  }
}

function commandLabel(cmd) {
  return { START: '🚗 Ligar motor', STOP: '⏹ Desligar motor', LOCK: '🔒 Travar', UNLOCK: '🔓 Destravar', HORN: '📯 Buzina', LIGHTS: '💡 Pisca luzes' }[cmd] || cmd
}

// ── WIDGET MODE ───────────────────────────────────────────────────────────

async function createWidget() {
  const vehicle = await getVehicle()
  const status = vehicle ? await getStatus(vehicle.id) : null

  const engineOn = status?.engine_running
  const locked = status?.door_lock_status === 'LOCKED'

  const w = new ListWidget()
  w.backgroundColor = new Color('#1a1a1a')
  w.setPadding(14, 14, 14, 14)

  // Header
  const header = w.addStack()
  header.layoutHorizontally()
  header.centerAlignContent()

  const icon = header.addText('🚗')
  icon.font = Font.systemFont(18)
  header.addSpacer(6)

  const name = header.addText(vehicle?.name || 'RAM')
  name.textColor = Color.white()
  name.font = Font.boldSystemFont(15)
  header.addSpacer()

  const dot = header.addText(engineOn ? '🟢' : '⚫')
  dot.font = Font.systemFont(14)

  w.addSpacer(10)

  // Motor
  const motorRow = w.addStack()
  motorRow.layoutHorizontally()
  motorRow.centerAlignContent()
  const motorLabel = motorRow.addText('Motor  ')
  motorLabel.textColor = new Color('#94a3b8')
  motorLabel.font = Font.systemFont(12)
  const motorVal = motorRow.addText(engineOn ? 'Ligado' : 'Desligado')
  motorVal.textColor = engineOn ? new Color('#34d399') : new Color('#94a3b8')
  motorVal.font = Font.mediumSystemFont(12)

  w.addSpacer(4)

  // Portas
  const lockRow = w.addStack()
  lockRow.layoutHorizontally()
  lockRow.centerAlignContent()
  const lockLabel = lockRow.addText('Portas  ')
  lockLabel.textColor = new Color('#94a3b8')
  lockLabel.font = Font.systemFont(12)
  const lockVal = lockRow.addText(locked ? '🔒 Travado' : '🔓 Destravado')
  lockVal.textColor = locked ? new Color('#fbbf24') : new Color('#34d399')
  lockVal.font = Font.mediumSystemFont(12)

  w.addSpacer()

  const hint = w.addText('Toque para controlar')
  hint.textColor = new Color('#6366f1')
  hint.font = Font.systemFont(11)

  w.url = `scriptable:///run/${encodeURIComponent(Script.name())}`
  w.refreshAfterDate = new Date(Date.now() + 2 * 60 * 1000)

  return w
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────

if (config.runsInWidget) {
  const widget = await createWidget()
  Script.setWidget(widget)
} else {
  await runApp()
}

Script.complete()
