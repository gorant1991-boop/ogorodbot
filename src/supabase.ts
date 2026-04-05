import { createClient } from '@supabase/supabase-js'
import type { DiaryEntry, OnboardingData, SubscriptionInfo } from './utils/types'
import { trackExternalAnalyticsEvent } from './utils/webAnalytics'
import { loadReviewAuth, REVIEW_USER_ID } from './utils/reviewAuth'
import { loadTelegramAuth } from './utils/telegram'
import { getVkAppId, loadVkAuth } from './utils/vk'
import { hashIdentityToUserId } from '../shared/identity.ts'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL?.trim() || !SUPABASE_ANON_KEY?.trim()) {
  throw new Error('Missing required Supabase env config: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export interface EmailAuthState {
  email: string
  userId: string
}

export interface CreateYooKassaPaymentRequest {
  offerId: string
  vkUserId: number
  returnUrl: string
}

export interface CreateYooKassaPaymentResponse {
  paymentId: string
  confirmationToken: string
  amount: number
  currency: string
  title: string
}

export interface YooKassaPaymentStatusResponse {
  paymentId: string
  status: string
  paid: boolean
  subscription: SubscriptionInfo | null
  onboardingPatch?: Partial<OnboardingData> | null
  offerId?: string | null
}

export interface TrackAnalyticsEventPayload {
  vkUserId: number
  eventType: string
  source?: string | null
  metadata?: Record<string, unknown>
}

export interface NotificationPreview {
  title: string
  body: string
  type?: string | null
  created_at: string
}

export interface PlantPhotoDiagnosisResult {
  summary: string
  likelyIssue: string
  confidence: 'low' | 'medium' | 'high'
  checks: string[]
  actionsNow: string[]
  seekUrgentHelp: boolean
  disclaimer: string
}

export interface AgronomistAnswerResponse {
  answer: string
}

export interface WeeklyPlanTask {
  crop: string
  action: string
  reason: string
}

export interface WeeklyPlanDay {
  date: string
  tasks: WeeklyPlanTask[]
}

export interface AdminStats {
  totalUsers: number
  newUsers7d: number
  newUsers30d: number
  activeProfiles7d: number
  activeProfiles30d: number
  activePaidUsers: number
  diaryEntries: number
  successfulPayments: number
  successfulPayments7d: number
  revenueTotal: number
  revenue7d: number
  revenue30d: number
  authSuccesses7d: number
  authSuccesses30d: number
  onboardingCompleted7d: number
  onboardingCompleted30d: number
  checkoutOpened7d: number
  checkoutOpened30d: number
  paymentSucceeded30d: number
  referralApplied7d: number
  referralApplied30d: number
  vkShares7d: number
  vkShares30d: number
}

export interface AddDiaryEntryOptions {
  dedupeScope?: 'daily_task'
}

type DataApiAuth =
  | {
    provider: 'vk'
    accessToken: string
    userId: number
    appId?: number
  }
  | {
    provider: 'email'
    accessToken: string
  }
  | {
    provider: 'telegram'
    id: number
    first_name: string
    last_name?: string
    username?: string
    photo_url?: string
    auth_date: number
    hash: string
  }
  | {
    provider: 'review'
    login: string
    password: string
  }

function logDataApiError(action: string, error: unknown) {
  console.error(`User data API error (${action}):`, error)
}

async function buildMatchingDataApiAuth(vkUserId: number): Promise<DataApiAuth | null> {
  const reviewAuth = loadReviewAuth()
  if (reviewAuth?.userId === vkUserId && vkUserId === REVIEW_USER_ID) {
    return {
      provider: 'review',
      login: reviewAuth.login,
      password: reviewAuth.password,
    }
  }

  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
  const session = data.session
  const sessionUserId = session?.user?.id ?? ''
  const sessionAccessToken = session?.access_token ?? ''
  const hashedEmailUserId = sessionUserId ? hashIdentityToUserId(`email:${sessionUserId}`) : 0

  if (sessionAccessToken && sessionUserId && hashedEmailUserId === vkUserId) {
    return {
      provider: 'email',
      accessToken: sessionAccessToken,
    }
  }

  const telegramAuth = loadTelegramAuth()
  if (telegramAuth?.id && telegramAuth.userId === vkUserId) {
    return {
      provider: 'telegram',
      id: telegramAuth.id,
      first_name: telegramAuth.first_name,
      last_name: telegramAuth.last_name,
      username: telegramAuth.username,
      photo_url: telegramAuth.photo_url,
      auth_date: telegramAuth.auth_date,
      hash: telegramAuth.hash,
    }
  }

  const vkAuth = loadVkAuth()
  if (vkAuth?.accessToken && vkAuth.userId === vkUserId) {
    return {
      provider: 'vk',
      accessToken: vkAuth.accessToken,
      userId: vkAuth.userId,
      appId: getVkAppId() || undefined,
    }
  }

  return null
}

async function buildAnyDataApiAuth(): Promise<DataApiAuth | null> {
  const reviewAuth = loadReviewAuth()
  if (reviewAuth?.userId === REVIEW_USER_ID) {
    return {
      provider: 'review',
      login: reviewAuth.login,
      password: reviewAuth.password,
    }
  }

  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
  const session = data.session
  if (session?.access_token && session.user?.id) {
    return {
      provider: 'email',
      accessToken: session.access_token,
    }
  }

  const telegramAuth = loadTelegramAuth()
  if (telegramAuth?.id) {
    return {
      provider: 'telegram',
      id: telegramAuth.id,
      first_name: telegramAuth.first_name,
      last_name: telegramAuth.last_name,
      username: telegramAuth.username,
      photo_url: telegramAuth.photo_url,
      auth_date: telegramAuth.auth_date,
      hash: telegramAuth.hash,
    }
  }

  const vkAuth = loadVkAuth()
  if (vkAuth?.accessToken && vkAuth.userId) {
    return {
      provider: 'vk',
      accessToken: vkAuth.accessToken,
      userId: vkAuth.userId,
      appId: getVkAppId() || undefined,
    }
  }

  return null
}

async function invokeUserDataApi<T>(action: string, body: Record<string, unknown>, auth: DataApiAuth | null) {
  if (!auth) {
    throw new Error('Требуется вход через Telegram, VK ID или email')
  }

  const { data, error } = await supabase.functions.invoke<{ ok: boolean; data: T; error?: string }>('user-data', {
    body: {
      action,
      auth,
      ...body,
    },
  })

  if (error) {
    throw new Error(error.message || `Не удалось выполнить ${action}`)
  }

  if (!data?.ok) {
    throw new Error(data?.error || `Не удалось выполнить ${action}`)
  }

  return data.data
}

export async function loadUserData(vkUserId: number) {
  if (vkUserId === 1) return null

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    return await invokeUserDataApi<Record<string, unknown> | null>('load_user_data', { vkUserId }, auth)
  } catch (error) {
    logDataApiError('load_user_data', error)
    return null
  }
}

export async function saveUserData(vkUserId: number, onboarding: object, plan: string) {
  if (vkUserId === 1) return

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    await invokeUserDataApi('save_user_data', { vkUserId, onboarding, plan }, auth)
  } catch (error) {
    logDataApiError('save_user_data', error)
  }
}

export async function applyReferral(vkUserId: number, pendingReferral: string, onboarding: object, plan: string) {
  const auth = await buildMatchingDataApiAuth(vkUserId)
  return await invokeUserDataApi<{ onboarding: OnboardingData; plan: string; referralApplied: boolean }>('apply_referral', {
    vkUserId,
    pendingReferral,
    onboarding,
    plan,
  }, auth)
}

export async function loadNotifications(vkUserId: number, options: {
  type?: string
  excludeTypes?: string[]
  limit?: number
} = {}) {
  if (vkUserId === 1) return []

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    return await invokeUserDataApi<NotificationPreview[]>('load_notifications', {
      vkUserId,
      type: options.type ?? '',
      excludeTypes: options.excludeTypes ?? [],
      limit: options.limit ?? 20,
    }, auth)
  } catch (error) {
    logDataApiError('load_notifications', error)
    return []
  }
}

export async function loadLastNotification(vkUserId: number) {
  const notifications = await loadNotifications(vkUserId, {
    excludeTypes: ['subscription', 'weekly_plan_access'],
    limit: 1,
  })
  return notifications[0] ?? null
}

export async function loadSubscriptionNotif(vkUserId: number) {
  const notifications = await loadNotifications(vkUserId, {
    type: 'subscription',
    limit: 1,
  })
  return notifications[0] ?? null
}

export async function loadDiary(vkUserId: number, cropId?: string) {
  if (vkUserId === 1) {
    try {
      const raw = localStorage.getItem('ogorodbot_guest_bundle')
      if (!raw) return []
      const bundle = JSON.parse(raw) as { diaryEntries?: DiaryEntry[] }
      const entries = bundle.diaryEntries ?? []
      return cropId ? entries.filter((e: DiaryEntry) => e.crop_id === cropId) : entries
    } catch {
      return []
    }
  }

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    return await invokeUserDataApi<DiaryEntry[]>('load_diary', {
      vkUserId,
      cropId: cropId ?? '',
      limit: 50,
    }, auth)
  } catch (error) {
    logDataApiError('load_diary', error)
    return []
  }
}

export async function addDiaryEntry(
  vkUserId: number,
  cropId: string | null,
  operation: string | null,
  text: string,
  options: AddDiaryEntryOptions = {},
) {
  if (vkUserId === 1) {
    return {
      id: -Date.now(),
      vk_user_id: 1,
      crop_id: cropId,
      operation: operation,
      text,
      created_at: new Date().toISOString(),
    } as DiaryEntry
  }

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    return await invokeUserDataApi<DiaryEntry>('add_diary_entry', {
      vkUserId,
      cropId,
      operation,
      text,
      dedupeScope: options.dedupeScope ?? '',
    }, auth)
  } catch (error) {
    logDataApiError('add_diary_entry', error)
    throw (error instanceof Error ? error : new Error('Не удалось сохранить запись в дневник'))
  }
}

export async function deleteDiaryEntry(vkUserId: number, entryId: number) {
  if (vkUserId === 1) return false

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    await invokeUserDataApi('delete_diary_entry', { vkUserId, entryId }, auth)
    return true
  } catch (error) {
    logDataApiError('delete_diary_entry', error)
    return false
  }
}

export async function deleteAccount(vkUserId: number) {
  if (vkUserId === 1) return false

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    await invokeUserDataApi('delete_account', { vkUserId }, auth)
    return true
  } catch (error) {
    logDataApiError('delete_account', error)
    return false
  }
}

export async function analyzePlantPhoto(input: {
  vkUserId: number
  imageDataUrl: string
  cropId?: string
  cropName?: string
  city?: string
  note?: string
  weather?: {
    temp?: number
    humidity?: number
    desc?: string
  }
}) {
  if (input.vkUserId === 1) {
    throw new Error('Сначала войдите через Telegram, VK ID или email, чтобы использовать фотодиагностику')
  }

  try {
    const auth = await buildMatchingDataApiAuth(input.vkUserId)
    return await invokeUserDataApi<PlantPhotoDiagnosisResult>('analyze_plant_photo', {
      vkUserId: input.vkUserId,
      imageDataUrl: input.imageDataUrl,
      cropId: input.cropId ?? '',
      cropName: input.cropName ?? '',
      city: input.city ?? '',
      note: input.note ?? '',
      weather: input.weather ?? {},
    }, auth)
  } catch (error) {
    logDataApiError('analyze_plant_photo', error)
    throw (error instanceof Error ? error : new Error('Не удалось разобрать фото растения'))
  }
}

export async function requestAgronomistAnswer(input: {
  vkUserId: number
  question: string
  gardenContext: OnboardingData
  plan: string
}) {
  if (input.vkUserId === 1) {
    throw new Error('Сначала войдите через Telegram, VK ID или email, чтобы написать агроному')
  }

  try {
    const auth = await buildMatchingDataApiAuth(input.vkUserId)
    return await invokeUserDataApi<AgronomistAnswerResponse>('ask_agronomist', {
      vkUserId: input.vkUserId,
      question: input.question,
      gardenContext: input.gardenContext,
      plan: input.plan,
    }, auth)
  } catch (error) {
    logDataApiError('ask_agronomist', error)
    throw (error instanceof Error ? error : new Error('Не удалось получить ответ агронома'))
  }
}

export async function loadWeeklyPlan(vkUserId: number, gardenContext: OnboardingData) {
  if (vkUserId === 1) {
    return { plan: [] as WeeklyPlanDay[] }
  }

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    return await invokeUserDataApi<{ plan?: WeeklyPlanDay[] }>('load_weekly_plan', {
      vkUserId,
      gardenContext,
    }, auth)
  } catch (error) {
    logDataApiError('load_weekly_plan', error)
    throw (error instanceof Error ? error : new Error('Не удалось загрузить недельный план'))
  }
}

export async function loadSeasons(vkUserId: number) {
  if (vkUserId === 1) return []

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    return await invokeUserDataApi('load_seasons', { vkUserId }, auth)
  } catch (error) {
    logDataApiError('load_seasons', error)
    return []
  }
}

export async function saveSeasonSnapshot(vkUserId: number, year: number, snapshot: object, summary?: string) {
  if (vkUserId === 1) return

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    await invokeUserDataApi('save_season_snapshot', { vkUserId, year, snapshot, summary }, auth)
  } catch (error) {
    logDataApiError('save_season_snapshot', error)
  }
}

export async function createYooKassaPayment(payload: CreateYooKassaPaymentRequest) {
  const { data, error } = await supabase.functions.invoke<CreateYooKassaPaymentResponse>('create-yookassa-payment', {
    body: payload,
  })
  if (error) throw new Error(error.message || 'Не удалось создать платёж')
  if (!data) throw new Error('Пустой ответ от create-yookassa-payment')
  return data
}

export async function getYooKassaPaymentStatus(paymentId: string, vkUserId: number) {
  const { data, error } = await supabase.functions.invoke<YooKassaPaymentStatusResponse>('get-yookassa-payment-status', {
    body: { paymentId, vkUserId },
  })
  if (error) throw new Error(error.message || 'Не удалось получить статус платежа')
  if (!data) throw new Error('Пустой ответ от get-yookassa-payment-status')
  return data
}

export async function sendEmailMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: 'https://ogorod-ai.ru',
    },
  })
  if (error) throw new Error(error.message || 'Не удалось отправить ссылку для входа')
}

export async function getEmailAuthState(): Promise<EmailAuthState | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  const session = data.session
  const user = session?.user
  if (!session || !user?.email || !user.id) return null
  return {
    email: user.email,
    userId: user.id,
  }
}

export async function signOutEmailAuth() {
  await supabase.auth.signOut()
}

export async function trackAnalyticsEvent(payload: TrackAnalyticsEventPayload) {
  trackExternalAnalyticsEvent(payload)

  if (payload.vkUserId === 1) return

  try {
    const auth = await buildMatchingDataApiAuth(payload.vkUserId)
    if (!auth) return

    await invokeUserDataApi('track_analytics_event', {
      vkUserId: payload.vkUserId,
      eventType: payload.eventType,
      source: payload.source ?? '',
      metadata: payload.metadata ?? {},
    }, auth)
  } catch (error) {
    logDataApiError('track_analytics_event', error)
  }
}

export async function sendTestTelegramNotification(vkUserId: number) {
  if (vkUserId === 1) return false

  try {
    const auth = await buildMatchingDataApiAuth(vkUserId)
    await invokeUserDataApi('send_test_telegram', { vkUserId }, auth)
    return true
  } catch (error) {
    logDataApiError('send_test_telegram', error)
    throw (error instanceof Error ? error : new Error('Не удалось отправить тест в Telegram'))
  }
}

export async function loadAdminStats(): Promise<AdminStats> {
  const auth = await buildAnyDataApiAuth()
  return await invokeUserDataApi<AdminStats>('load_admin_stats', {}, auth)
}

export async function verifyReviewLogin(login: string, password: string) {
  return await invokeUserDataApi<{ ok: true }>('load_user_data', {
    vkUserId: REVIEW_USER_ID,
  }, {
    provider: 'review',
    login: login.trim(),
    password,
  })
}
