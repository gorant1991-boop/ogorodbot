import type { TrackAnalyticsEventPayload } from '../supabase'

declare global {
  interface Window {
    ym?: ((...args: unknown[]) => void) & { a?: unknown[]; l?: number }
  }
}

const METRICA_COUNTER_ID = Number.parseInt(String(import.meta.env.VITE_YANDEX_METRICA_ID ?? ''), 10)
const METRICA_SCRIPT_ID = 'ogorodbot-yandex-metrica'
const SESSION_PREFIX = 'ogorodbot_analytics_once:'

type GoalName =
  | 'view_main'
  | 'auth_success'
  | 'onboarding_complete'
  | 'checkout_opened'
  | 'payment_succeeded'

function hasMetrica() {
  return Number.isFinite(METRICA_COUNTER_ID) && METRICA_COUNTER_ID > 0
}

function markOncePerSession(key: string) {
  try {
    const storageKey = `${SESSION_PREFIX}${key}`
    if (sessionStorage.getItem(storageKey) === '1') return false
    sessionStorage.setItem(storageKey, '1')
    return true
  } catch {
    return true
  }
}

function sanitizeParams(params?: Record<string, unknown>) {
  if (!params) return undefined

  const entries = Object.entries(params).filter(([, value]) => {
    return value !== undefined && value !== null && value !== ''
  })

  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

function callYm(...args: unknown[]) {
  if (!hasMetrica() || typeof window === 'undefined' || typeof window.ym !== 'function') return
  window.ym(METRICA_COUNTER_ID, ...args)
}

export function initWebAnalytics() {
  if (!hasMetrica() || typeof window === 'undefined' || typeof document === 'undefined') return

  if (typeof window.ym !== 'function') {
    type YmStub = ((...args: unknown[]) => void) & { a?: unknown[]; l?: number }
    const ymStub: YmStub = ((...args: unknown[]) => {
      ymStub.a = ymStub.a || []
      ymStub.a.push(args)
    }) as YmStub
    ymStub.l = Date.now()
    window.ym = ymStub
  }

  if (!document.getElementById(METRICA_SCRIPT_ID)) {
    const script = document.createElement('script')
    script.id = METRICA_SCRIPT_ID
    script.async = true
    script.src = 'https://mc.yandex.ru/metrika/tag.js'
    document.head.appendChild(script)
  }

  callYm('init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  })
}

export function trackVirtualPageView(path: string, title?: string) {
  if (!path) return
  callYm('hit', path, {
    title: title || document.title,
    referer: document.referrer || undefined,
  })
}

export function trackGoal(goal: GoalName, params?: Record<string, unknown>, onceKey?: string) {
  if (onceKey && !markOncePerSession(onceKey)) return
  callYm('reachGoal', goal, sanitizeParams(params))
}

export function trackMainView() {
  trackGoal('view_main', undefined, 'goal:view_main')
}

export function trackExternalAnalyticsEvent(payload: TrackAnalyticsEventPayload) {
  switch (payload.eventType) {
    case 'auth_success':
      trackGoal('auth_success', {
        source: payload.source ?? undefined,
      }, `goal:auth_success:${payload.source ?? 'unknown'}:${payload.vkUserId}`)
      break
    case 'onboarding_complete':
      trackGoal('onboarding_complete', sanitizeParams(payload.metadata), `goal:onboarding_complete:${payload.vkUserId}`)
      break
    case 'checkout_opened':
      trackGoal('checkout_opened', sanitizeParams(payload.metadata))
      break
    case 'payment_succeeded':
      trackGoal('payment_succeeded', sanitizeParams(payload.metadata), `goal:payment_succeeded:${String(payload.metadata?.paymentId ?? payload.vkUserId)}`)
      break
    default:
      break
  }
}
