import * as VKID from '@vkid/sdk'

const VK_APP_ID = Number((import.meta.env.VITE_VK_APP_ID as string | undefined)?.trim() ?? '0')
const VK_REDIRECT_URI = (import.meta.env.VITE_VK_REDIRECT_URI as string | undefined)?.trim() ?? ''
const VK_AUTH_STORAGE_KEY = 'ogorodbot_vk_auth'
const VK_FLOW_STORAGE_KEY = 'ogorodbot_vk_flows'
const VK_ID_DOMAIN = 'id.vk.com'

export interface VkAuthState {
  accessToken: string
  refreshToken?: string
  userId: number
  email?: string
  expiresAt?: number
}

function getRedirectUri() {
  if (VK_REDIRECT_URI) return VK_REDIRECT_URI
  return `${window.location.origin}${window.location.pathname}`
}

function randomString(length = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')
}

function initVkConfig(state: string, codeVerifier: string) {
  VKID.Config.init({
    app: VK_APP_ID,
    redirectUrl: getRedirectUri(),
    state,
    codeVerifier,
    scope: 'email',
    mode: VKID.ConfigAuthMode.Redirect,
    responseMode: VKID.ConfigResponseMode.Redirect,
    __vkidDomain: VK_ID_DOMAIN,
    __oauthDomain: 'oauth.vk.com',
    __loginDomain: 'login.vk.com',
    __apiDomain: 'api.vk.com',
  })
}

function loadVkFlows(): Record<string, string> {
  try {
    const raw = localStorage.getItem(VK_FLOW_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function saveVkFlowState(state: string, codeVerifier: string) {
  const flows = loadVkFlows()
  flows[state] = codeVerifier
  localStorage.setItem(VK_FLOW_STORAGE_KEY, JSON.stringify(flows))
}

function loadVkFlowState(state: string) {
  const flows = loadVkFlows()
  return {
    state,
    codeVerifier: flows[state] ?? '',
  }
}

function clearVkFlowState(state?: string) {
  if (!state) {
    localStorage.removeItem(VK_FLOW_STORAGE_KEY)
    return
  }

  const flows = loadVkFlows()
  delete flows[state]
  if (Object.keys(flows).length === 0) {
    localStorage.removeItem(VK_FLOW_STORAGE_KEY)
    return
  }
  localStorage.setItem(VK_FLOW_STORAGE_KEY, JSON.stringify(flows))
}

export function getVkAppId() {
  return VK_APP_ID
}

export function hasVkAppId() {
  return Number.isFinite(VK_APP_ID) && VK_APP_ID > 0
}

export async function openVkLogin() {
  if (!hasVkAppId()) {
    throw new Error('Не задан VITE_VK_APP_ID')
  }

  const state = randomString(32)
  const codeVerifier = randomString(64)
  saveVkFlowState(state, codeVerifier)
  initVkConfig(state, codeVerifier)
  await VKID.Auth.login()
}

function clearVkCallbackParams() {
  const url = new URL(window.location.href)
  ;['code', 'device_id', 'state', 'type', 'expires_in', 'error', 'error_description', 'ext_id'].forEach(key => {
    url.searchParams.delete(key)
  })
  const nextUrl = `${url.origin}${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, document.title, nextUrl)
}

function formatVkError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return error instanceof Error ? error.message : 'Не удалось завершить вход через VK ID'
  }

  const payload = error as Record<string, unknown>
  const parts = [
    typeof payload.error === 'string' ? payload.error : '',
    typeof payload.error_description === 'string' ? payload.error_description : '',
    typeof payload.error_msg === 'string' ? payload.error_msg : '',
    typeof payload.code === 'string' ? payload.code : '',
  ].filter(Boolean)

  return parts.join(': ') || 'Не удалось завершить вход через VK ID'
}

async function exchangeVkCodeDirect(code: string, deviceId: string, codeVerifier: string, state: string) {
  const query = new URLSearchParams({
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
    client_id: String(VK_APP_ID),
    code_verifier: codeVerifier,
    state,
    device_id: deviceId,
  })

  const response = await fetch(`https://${VK_ID_DOMAIN}/oauth2/auth?${query.toString()}`, {
    method: 'POST',
    body: new URLSearchParams({ code }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload || typeof payload !== 'object' || 'error' in payload) {
    throw payload ?? new Error(`VK ID exchange failed with status ${response.status}`)
  }

  return payload as {
    access_token: string
    refresh_token?: string
    user_id: number
    expires_in: number
    state?: string
  }
}

export async function consumeVkAuthCallback(): Promise<VkAuthState | null> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const deviceId = params.get('device_id')
  const state = params.get('state')
  const error = params.get('error')
  const errorDescription = params.get('error_description')

  if (error) {
    clearVkCallbackParams()
    throw new Error(errorDescription || error)
  }

  if (!code || !deviceId) return null

  const callbackState = state || ''
  const { codeVerifier } = loadVkFlowState(callbackState)
  const effectiveState = callbackState || randomString(32)

  if (!codeVerifier) {
    clearVkFlowState(callbackState)
    clearVkCallbackParams()
    throw new Error('Сессия входа через VK ID устарела. Нажмите "Войти через ВКонтакте" ещё раз.')
  }

  initVkConfig(effectiveState, codeVerifier)

  let token: {
    access_token: string
    refresh_token?: string
    user_id: number
    expires_in: number
  }

  try {
    token = await VKID.Auth.exchangeCode(code, deviceId, codeVerifier)
  } catch (sdkError) {
    token = await exchangeVkCodeDirect(code, deviceId, codeVerifier, effectiveState).catch(directError => {
      throw new Error(formatVkError(directError ?? sdkError))
    })
  }

  const userInfo = await VKID.Auth.userInfo(token.access_token).catch(() => null)

  clearVkFlowState(callbackState)
  clearVkCallbackParams()

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    userId: token.user_id,
    email: userInfo?.user?.email,
    expiresAt: token.expires_in > 0 ? Date.now() + token.expires_in * 1000 : undefined,
  }
}

export function saveVkAuth(auth: VkAuthState | null) {
  if (!auth) {
    localStorage.removeItem(VK_AUTH_STORAGE_KEY)
    return
  }
  localStorage.setItem(VK_AUTH_STORAGE_KEY, JSON.stringify(auth))
}

export function loadVkAuth(): VkAuthState | null {
  try {
    const raw = localStorage.getItem(VK_AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as VkAuthState
    if (!parsed?.accessToken || !parsed?.userId) return null
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      localStorage.removeItem(VK_AUTH_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function logoutVk() {
  saveVkAuth(null)
}
