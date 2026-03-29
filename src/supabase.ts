import { createClient } from '@supabase/supabase-js'
import type { SubscriptionInfo } from './utils/types'
import { isSubscriptionExpired } from './utils/constants'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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
}

export interface TrackAnalyticsEventPayload {
  vkUserId: number
  eventType: string
  source?: string | null
  metadata?: Record<string, unknown>
}

export interface AdminStats {
  totalUsers: number
  newUsers7d: number
  activePaidUsers: number
  diaryEntries: number
  successfulPayments: number
  revenueTotal: number
  revenue30d: number
  authSuccesses7d: number
  onboardingCompleted7d: number
  checkoutOpened7d: number
  paymentSucceeded30d: number
  referralApplied7d: number
  vkShares7d: number
}

export async function loadUserData(vkUserId: number) {
  const { data, error } = await supabase
    .from('garden_data')
    .select('*')
    .eq('vk_user_id', vkUserId)
    .maybeSingle()
  if (error) return null
  return data
}

export async function saveUserData(vkUserId: number, onboarding: object, plan: string) {
  const { error } = await supabase
    .from('garden_data')
    .upsert({ vk_user_id: vkUserId, onboarding, plan }, { onConflict: 'vk_user_id' })
  if (error) console.error('Supabase save error:', error)
}

export async function loadLastNotification(vkUserId: number) {
  const { data, error } = await supabase
    .from('notifications')
    .select('title, body, type, created_at')
    .eq('vk_user_id', vkUserId)
    .neq('type', 'subscription')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data
}

export async function loadDiary(vkUserId: number, cropId?: string) {
  let q = supabase
    .from('diary')
    .select('*')
    .eq('vk_user_id', vkUserId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (cropId) q = q.eq('crop_id', cropId)
  const { data, error } = await q
  if (error) return []
  return data
}

export async function addDiaryEntry(vkUserId: number, cropId: string | null, operation: string | null, text: string) {
  const { error } = await supabase
    .from('diary')
    .insert({ vk_user_id: vkUserId, crop_id: cropId, operation, text })
  if (error) console.error('Diary save error:', error)
}

export async function loadSeasons(vkUserId: number) {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('vk_user_id', vkUserId)
    .order('year', { ascending: false })
  if (error) return []
  return data
}

export async function saveSeasonSnapshot(vkUserId: number, year: number, snapshot: object, summary?: string) {
  const { error } = await supabase
    .from('seasons')
    .upsert({ vk_user_id: vkUserId, year, snapshot, summary }, { onConflict: 'vk_user_id,year' })
  if (error) console.error('Season save error:', error)
}

export async function loadSubscriptionNotif(vkUserId: number) {
  const { data, error } = await supabase
    .from('notifications')
    .select('title, body, type, created_at')
    .eq('vk_user_id', vkUserId)
    .eq('type', 'subscription')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data
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
      emailRedirectTo: window.location.origin,
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
  const { error } = await supabase
    .from('analytics_events')
    .insert({
      vk_user_id: payload.vkUserId,
      event_type: payload.eventType,
      source: payload.source ?? null,
      metadata: payload.metadata ?? {},
    })

  if (error) console.error('Analytics save error:', error)
}

export async function loadAdminStats(): Promise<AdminStats> {
  const now = Date.now()
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    totalUsersRes,
    newUsersRes,
    diaryRes,
    paidPaymentsRes,
    paidPayments30dRes,
    gardenRowsRes,
    eventsRes,
  ] = await Promise.all([
    supabase.from('garden_data').select('*', { count: 'exact', head: true }),
    supabase.from('garden_data').select('*', { count: 'exact', head: true }).gte('created_at', since7d),
    supabase.from('diary').select('*', { count: 'exact', head: true }),
    supabase.from('billing_payments').select('amount, created_at').eq('status', 'succeeded'),
    supabase.from('billing_payments').select('amount, created_at').eq('status', 'succeeded').gte('created_at', since30d),
    supabase.from('garden_data').select('plan, onboarding'),
    supabase.from('analytics_events').select('event_type, created_at').gte('created_at', since30d),
  ])

  const totalUsers = totalUsersRes.count ?? 0
  const newUsers7d = newUsersRes.count ?? 0
  const diaryEntries = diaryRes.count ?? 0

  const successfulPayments = (paidPaymentsRes.data ?? []).length
  const revenueTotal = (paidPaymentsRes.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const revenue30d = (paidPayments30dRes.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const paymentSucceeded30d = (paidPayments30dRes.data ?? []).length

  const activePaidUsers = (gardenRowsRes.data ?? []).reduce((count, row) => {
    const onboarding = row.onboarding as { subscription?: SubscriptionInfo | null } | null
    const subscription = onboarding?.subscription ?? null
    if (subscription && !isSubscriptionExpired(subscription)) {
      return count + 1
    }
    return count
  }, 0)

  const eventRows = eventsRes.data ?? []
  const countEvents = (eventType: string, sinceIso: string) =>
    eventRows.filter(row => row.event_type === eventType && row.created_at >= sinceIso).length

  return {
    totalUsers,
    newUsers7d,
    activePaidUsers,
    diaryEntries,
    successfulPayments,
    revenueTotal,
    revenue30d,
    authSuccesses7d: countEvents('auth_success', since7d),
    onboardingCompleted7d: countEvents('onboarding_complete', since7d),
    checkoutOpened7d: countEvents('checkout_opened', since7d),
    paymentSucceeded30d,
    referralApplied7d: countEvents('referral_applied', since7d),
    vkShares7d: countEvents('vk_share', since7d),
  }
}
