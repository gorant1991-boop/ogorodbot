import { hashIdentityToUserId } from '../../shared/identity.ts'

const TELEGRAM_BOT_USERNAME = ((import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? '')
  .trim()
  .replace(/^@+/, '')
const TELEGRAM_AUTH_STORAGE_KEY = 'ogorodbot_telegram_auth'

export interface TelegramAuthState {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
  userId: number
}

export function getTelegramBotUsername() {
  return TELEGRAM_BOT_USERNAME
}

export function hasTelegramBotUsername() {
  return TELEGRAM_BOT_USERNAME.length > 0
}

export function getTelegramUserId(telegramId: number) {
  return hashIdentityToUserId(`telegram:${telegramId}`)
}

export function buildTelegramLoginUrl(returnTo = window.location.href) {
  if (!TELEGRAM_BOT_USERNAME) return ''
  const query = new URLSearchParams({
    origin: window.location.origin,
    return_to: returnTo,
    size: 'large',
    userpic: 'false',
    request_access: 'write',
    radius: '16',
    lang: 'ru',
  })
  return `https://oauth.telegram.org/embed/${encodeURIComponent(TELEGRAM_BOT_USERNAME)}?${query.toString()}`
}

function clearTelegramAuthParams(url: URL) {
  ;[
    'tg_login',
    'id',
    'first_name',
    'last_name',
    'username',
    'photo_url',
    'auth_date',
    'hash',
  ].forEach(key => url.searchParams.delete(key))
}

export function getTelegramAuthRedirectUrl() {
  const url = new URL(window.location.href)
  clearTelegramAuthParams(url)
  url.searchParams.set('tg_login', '1')
  return url.toString()
}

export function consumeTelegramAuthResult(): TelegramAuthState | null {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('tg_login') === '1' && url.searchParams.get('id') && url.searchParams.get('hash')) {
      const auth = normalizeTelegramAuth({
        id: url.searchParams.get('id'),
        first_name: url.searchParams.get('first_name'),
        last_name: url.searchParams.get('last_name'),
        username: url.searchParams.get('username'),
        photo_url: url.searchParams.get('photo_url'),
        auth_date: url.searchParams.get('auth_date'),
        hash: url.searchParams.get('hash'),
      })
      clearTelegramAuthParams(url)
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`)
      if (auth) return auth
    }

    const hash = window.location.hash.toString()
    const match = hash.match(/[#?&]tgAuthResult=([A-Za-z0-9\\-_=]*)$/)
    if (!match) return null

    let data = match[1] || ''
    data = data.replace(/-/g, '+').replace(/_/g, '/')
    const pad = data.length % 4
    if (pad > 1) {
      data += '='.repeat(4 - pad)
    }

    const payload = JSON.parse(window.atob(data))
    const auth = normalizeTelegramAuth(payload)
    const cleanHash = hash.replace(/[#?&]tgAuthResult=([A-Za-z0-9\\-_=]*)$/, '')
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}${cleanHash}`)
    return auth
  } catch {
    return null
  }
}

export function normalizeTelegramAuth(value: unknown): TelegramAuthState | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Record<string, unknown>
  const id = Number(payload.id ?? 0)
  const authDate = Number(payload.auth_date ?? 0)
  const firstName = typeof payload.first_name === 'string' ? payload.first_name.trim() : ''
  const hash = typeof payload.hash === 'string' ? payload.hash.trim() : ''
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(authDate) || authDate <= 0 || !firstName || !hash) {
    return null
  }

  const lastName = typeof payload.last_name === 'string' ? payload.last_name.trim() : ''
  const username = typeof payload.username === 'string' ? payload.username.trim().replace(/^@+/, '') : ''
  const photoUrl = typeof payload.photo_url === 'string' ? payload.photo_url.trim() : ''

  return {
    id,
    first_name: firstName,
    last_name: lastName || undefined,
    username: username || undefined,
    photo_url: photoUrl || undefined,
    auth_date: authDate,
    hash,
    userId: getTelegramUserId(id),
  }
}

export function getTelegramDisplayName(auth: TelegramAuthState | null) {
  if (!auth) return ''
  const fullName = [auth.first_name, auth.last_name].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  if (auth.username) return `@${auth.username}`
  return `ID ${auth.id}`
}

export function saveTelegramAuth(auth: TelegramAuthState | null) {
  if (!auth) {
    localStorage.removeItem(TELEGRAM_AUTH_STORAGE_KEY)
    return
  }
  localStorage.setItem(TELEGRAM_AUTH_STORAGE_KEY, JSON.stringify(auth))
}

export function loadTelegramAuth(): TelegramAuthState | null {
  try {
    const raw = localStorage.getItem(TELEGRAM_AUTH_STORAGE_KEY)
    if (!raw) return null
    return normalizeTelegramAuth(JSON.parse(raw))
  } catch {
    return null
  }
}

export function clearTelegramAuth() {
  saveTelegramAuth(null)
}
