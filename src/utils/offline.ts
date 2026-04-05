import type { DiaryEntry, OnboardingData, Plan, WeatherData } from './types'

export interface OfflineNotificationPreview {
  title: string
  body: string
  type?: string | null
  created_at?: string
}

export interface OfflineWeekTask {
  crop: string
  action: string
  reason: string
}

export interface OfflineWeekDay {
  date: string
  tasks: OfflineWeekTask[]
}

export interface OfflineBundle {
  version: 1
  vkUserId: number
  savedAt: string
  onboarding: OnboardingData
  plan: Plan
  lastNotif: OfflineNotificationPreview | null
  diaryEntries: DiaryEntry[]
  weeklyPlanDays: OfflineWeekDay[]
  weather: WeatherData | null
}

const OFFLINE_BUNDLE_PREFIX = 'ogorodbot_offline_bundle_v1:'
export const GUEST_BUNDLE_KEY = 'ogorodbot_guest_bundle'

function getBundleKey(vkUserId: number) {
  return vkUserId === 1 ? GUEST_BUNDLE_KEY : `${OFFLINE_BUNDLE_PREFIX}${vkUserId}`
}

export function loadOfflineBundle(vkUserId: number): OfflineBundle | null {
  if (!Number.isFinite(vkUserId)) return null

  try {
    const raw = localStorage.getItem(getBundleKey(vkUserId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as OfflineBundle | null
    if (!parsed || parsed.version !== 1) return null
    if (vkUserId !== 1 && parsed.vkUserId !== vkUserId) return null
    return parsed
  } catch {
    return null
  }
}

export function saveOfflineBundle(bundle: OfflineBundle) {
  try {
    localStorage.setItem(getBundleKey(bundle.vkUserId), JSON.stringify(bundle))
    return true
  } catch {
    return false
  }
}
