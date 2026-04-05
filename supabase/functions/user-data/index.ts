import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hashIdentityToUserId } from '../../../shared/identity.ts'

type Plan = 'free' | 'base' | 'pro'
type BillingPeriod = 'monthly' | 'seasonal'

interface SubscriptionInfo {
  level: Exclude<Plan, 'free'>
  period: BillingPeriod
  status: 'active' | 'expired'
  startsAt: string
  endsAt: string
  monthlyPrice: number
  amount: number
  baseAmount: number
  discountPercent: number
  source: 'manual' | 'vk_pay' | 'yookassa'
}

interface AuthPayloadVk {
  provider: 'vk'
  accessToken: string
  userId: number
  appId?: number
}

interface AuthPayloadEmail {
  provider: 'email'
  accessToken: string
}

interface AuthPayloadTelegram {
  provider: 'telegram'
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

interface AuthPayloadReview {
  provider: 'review'
  login: string
  password: string
}

type AuthPayload = AuthPayloadVk | AuthPayloadEmail | AuthPayloadTelegram | AuthPayloadReview

interface VerifiedIdentity {
  provider: 'vk' | 'email' | 'telegram' | 'review'
  vkUserId: number
  email?: string
  authUserId?: string
  telegramId?: number
  telegramUsername?: string
}

interface PlantPhotoDiagnosisResult {
  summary: string
  likelyIssue: string
  confidence: 'low' | 'medium' | 'high'
  checks: string[]
  actionsNow: string[]
  seekUrgentHelp: boolean
  disclaimer: string
}

interface WorkerChatPayload {
  answer?: string
}

interface WorkerWeeklyPlanTask {
  crop?: string
  action?: string
  reason?: string
}

interface WorkerWeeklyPlanDay {
  date?: string
  tasks?: WorkerWeeklyPlanTask[]
}

interface WorkerWeeklyPlanPayload {
  plan?: WorkerWeeklyPlanDay[]
}

const OWNER_VK_ID = 16761047
const OWNER_EMAILS = ['gorant1991@gmail.com']
const REVIEW_USER_ID = 990000001

function getOwnerTelegramUsernames() {
  return getOptionalEnv('OWNER_TELEGRAM_USERNAMES')
    .split(',')
    .map(value => value.trim().replace(/^@+/, '').toLowerCase())
    .filter(Boolean)
}

function getOwnerTelegramIds() {
  return getOptionalEnv('OWNER_TELEGRAM_IDS')
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isFinite(value) && value > 0)
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  })
}

function getEnv(name: string) {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

function getOptionalEnv(name: string) {
  return Deno.env.get(name)?.trim() ?? ''
}

function getAdminClient() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = getEnv('TELEGRAM_BOT_TOKEN')
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🌱 Открыть МойАгроном',
            url: 'https://ogorod-ai.ru',
          },
        ]],
      },
    }),
  })

  const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description || `Telegram Bot API HTTP ${response.status}`)
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

function parseDataUrlImage(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) {
    throw new Error('Нужно передать фото в формате JPEG, PNG или WebP')
  }

  const mimeType = match[1].toLowerCase()
  const base64 = match[2]
  const approxBytes = Math.floor((base64.length * 3) / 4)
  if (approxBytes > 5 * 1024 * 1024) {
    throw new Error('Фото слишком большое даже после сжатия. Попробуйте выбрать снимок поменьше.')
  }

  return {
    mimeType,
    base64,
    dataUrl: `data:${mimeType};base64,${base64}`,
  }
}

function sanitizeDiagnosisArray(value: unknown, limit = 4) {
  return asStringArray(value)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, limit)
}

function asBoolean(value: unknown) {
  return value === true
}

async function requestGardenAgent<T>(path: '/chat' | '/weekly-plan', payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://garden-agent.gorant1991.workers.dev${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getEnv('WORKER_API_KEY')}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Garden agent failed with status ${response.status}`)
  }

  return await response.json() as T
}

async function analyzePlantPhotoWithOpenAI(input: {
  imageDataUrl: string
  cropName: string
  city: string
  note: string
  weather: Record<string, unknown>
}): Promise<PlantPhotoDiagnosisResult> {
  const apiKey = getOptionalEnv('OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('Фотодиагностика ещё не настроена на сервере. Нужен секрет OPENAI_API_KEY.')
  }
  const model = getOptionalEnv('OPENAI_VISION_MODEL') || 'gpt-4.1-mini'
  const weatherTemp = asNumber(input.weather.temp)
  const weatherHumidity = asNumber(input.weather.humidity)
  const weatherDesc = asString(input.weather.desc).trim()
  const cropLabel = input.cropName.trim() || 'культура не указана'
  const cityLabel = input.city.trim() || 'город не указан'
  const userNote = input.note.trim()

  const prompt = [
    'Вы опытный агроном и осторожный диагност по фото растений.',
    'Нужно помочь пользователю по одному фото растения.',
    `Культура: ${cropLabel}.`,
    `Город: ${cityLabel}.`,
    weatherDesc || weatherTemp || weatherHumidity
      ? `Погода сейчас: ${weatherDesc || 'без описания'}, температура ${weatherTemp || 0}°C, влажность ${weatherHumidity || 0}%.`
      : 'Погода не указана.',
    userNote ? `Что смущает пользователя: ${userNote}.` : 'Пользователь не добавил текстового описания.',
    'По фото не придумывайте точный диагноз, если уверенности мало.',
    'Верните только JSON по схеме.',
    'summary: короткое объяснение простыми словами.',
    'likelyIssue: наиболее вероятная проблема или "Нужно больше проверки".',
    'confidence: low, medium или high.',
    'checks: 2-4 коротких пункта, что проверить глазами или руками.',
    'actionsNow: 2-4 безопасных действий прямо сейчас без опасных рекомендаций.',
    'seekUrgentHelp: true только если по фото есть риск быстрой потери растения или заразного сильного поражения.',
    'disclaimer: короткое предупреждение, что фото-разбор предварительный.',
    'Пишите только по-русски.',
  ].join(' ')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: input.imageDataUrl },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'plant_photo_diagnosis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['summary', 'likelyIssue', 'confidence', 'checks', 'actionsNow', 'seekUrgentHelp', 'disclaimer'],
            properties: {
              summary: { type: 'string' },
              likelyIssue: { type: 'string' },
              confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
              checks: {
                type: 'array',
                items: { type: 'string' },
              },
              actionsNow: {
                type: 'array',
                items: { type: 'string' },
              },
              seekUrgentHelp: { type: 'boolean' },
              disclaimer: { type: 'string' },
            },
          },
        },
      },
    }),
  })

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    const message = asString(asObject(payload?.error).message).trim()
    throw new Error(message || `OpenAI HTTP ${response.status}`)
  }

  const outputText = asString(payload?.output_text).trim()
  if (!outputText) {
    throw new Error('AI не вернул разбор фото')
  }

  const parsed = asObject(JSON.parse(outputText))
  const confidenceRaw = asString(parsed.confidence).trim()
  const confidence = confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
    ? confidenceRaw
    : 'low'

  return {
    summary: asString(parsed.summary).trim() || 'По фото видно, что растению нужен дополнительный осмотр.',
    likelyIssue: asString(parsed.likelyIssue).trim() || 'Нужно больше проверки',
    confidence,
    checks: sanitizeDiagnosisArray(parsed.checks),
    actionsNow: sanitizeDiagnosisArray(parsed.actionsNow),
    seekUrgentHelp: asBoolean(parsed.seekUrgentHelp),
    disclaimer: asString(parsed.disclaimer).trim() || 'Это предварительный фото-разбор, а не подтверждённый агрономический диагноз.',
  }
}

function getDateKeyInTimeZone(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function bytesToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256Hex(keyBytes: Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value))
  return bytesToHex(signature)
}

async function buildTelegramSecretKey(botToken: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken))
  return new Uint8Array(hash)
}

function buildTelegramDataCheckString(auth: AuthPayloadTelegram) {
  return Object.entries({
    auth_date: String(auth.auth_date),
    first_name: auth.first_name,
    id: String(auth.id),
    last_name: auth.last_name ?? '',
    photo_url: auth.photo_url ?? '',
    username: auth.username ?? '',
  })
    .filter(([, value]) => value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function buildDefaultReviewOnboarding() {
  return {
    city: 'Москва',
    displayName: 'Проверка ЮKassa',
    addressStyle: 'formal',
    terrain: 'city',
    gardenObjects: [
      {
        uid: 'review-bed-1',
        type: 'open',
        name: 'Грядка у дома',
        length: '',
        width: '',
        height: '',
        ventilationReminders: false,
        ventilationMorning: '06:00',
        ventilationEvening: '19:00',
        soilType: '',
        substrate: '',
        drainageIssue: false,
      },
    ],
    cropEntries: [
      {
        id: 'zucchini',
        location: 'review-bed-1',
        sowDate: '2026-03-25',
        sowMethod: 'seedling',
        status: 'planted',
        priority: 'main',
        notifs: ['watering', 'feeding'],
        varieties: [{ name: 'Цукеша', days: 55 }],
      },
      {
        id: 'tomato',
        location: 'review-bed-1',
        sowDate: '2026-03-20',
        sowMethod: 'seedling',
        status: 'planted',
        priority: 'main',
        notifs: ['watering', 'feeding', 'pinching'],
        varieties: [{ name: 'Бычье сердце', days: 110 }],
      },
    ],
    fertilizers: [
      { id: 'review-fert-1', name: 'Универсальное удобрение', brand: 'Демо', composition: 'NPK', note: '' },
    ],
    notificationEmail: '',
    referralCode: buildReferralCode(REVIEW_USER_ID),
    experience: 'amateur',
    tools: [],
    telegramChatId: 0,
    telegramUsername: '',
    timeZone: 'Europe/Moscow',
    notifMorning: '07:00',
    notifEvening: '19:00',
    notifLevel: 'normal',
    notifChannels: [],
    interestingFact: '',
    scienceFact: '',
    weeklyPlanText: '',
  }
}

function normalizeSubscription(value: unknown): SubscriptionInfo | null {
  const raw = asObject(value)
  if (!raw.level || (raw.level !== 'base' && raw.level !== 'pro')) return null
  if (raw.period !== 'monthly' && raw.period !== 'seasonal') return null

  return {
    level: raw.level,
    period: raw.period,
    status: raw.status === 'expired' ? 'expired' : 'active',
    startsAt: asString(raw.startsAt),
    endsAt: asString(raw.endsAt),
    monthlyPrice: asNumber(raw.monthlyPrice),
    amount: asNumber(raw.amount),
    baseAmount: asNumber(raw.baseAmount),
    discountPercent: asNumber(raw.discountPercent),
    source: raw.source === 'vk_pay' || raw.source === 'yookassa' ? raw.source : 'manual',
  }
}

function normalizePlan(value: unknown): Plan {
  return value === 'base' || value === 'pro' ? value : 'free'
}

function isSubscriptionExpired(subscription: SubscriptionInfo | null | undefined, now = new Date()) {
  if (!subscription?.endsAt) return true
  return new Date(subscription.endsAt).getTime() < now.getTime()
}

function getEffectivePlanFromOnboarding(onboarding: Record<string, unknown>, fallbackPlan: unknown = 'free') {
  const subscription = normalizeSubscription(onboarding.subscription)
  if (subscription && !isSubscriptionExpired(subscription)) {
    return subscription.level
  }

  if (!subscription) {
    return normalizePlan(fallbackPlan)
  }

  return 'free' as const
}

function resolvePlanForSave(params: {
  requestedPlan: unknown
  nextOnboarding: Record<string, unknown>
  currentPlan: unknown
  currentOnboarding: Record<string, unknown>
}) {
  const { requestedPlan, nextOnboarding, currentPlan, currentOnboarding } = params
  const nextSubscription = normalizeSubscription(nextOnboarding.subscription)
  if (nextSubscription && !isSubscriptionExpired(nextSubscription)) {
    return nextSubscription.level
  }

  if (requestedPlan === 'free' && nextOnboarding.subscription == null) {
    return 'free' as const
  }

  const currentSubscription = normalizeSubscription(currentOnboarding.subscription)
  if (!nextSubscription && !currentSubscription) {
    return normalizePlan(currentPlan)
  }

  return 'free' as const
}

function buildReferralCode(vkUserId: number) {
  return `OG-${vkUserId}`
}

function parseReferralOwnerId(code: string) {
  const match = code.trim().match(/^OG-(\d+)$/i)
  return match ? Number(match[1]) : null
}

function grantBonusAccessDays(subscriptionValue: unknown, days: number): SubscriptionInfo {
  const subscription = normalizeSubscription(subscriptionValue)
  const now = new Date()
  const activeSubscription = subscription && !isSubscriptionExpired(subscription, now)
    ? subscription
    : null
  const level = activeSubscription?.level === 'pro' ? 'pro' : 'base'
  const monthlyPrice = level === 'pro' ? 300 : 150
  const start = activeSubscription
    ? new Date(activeSubscription.endsAt)
    : now
  const nextEnd = new Date(start)
  nextEnd.setDate(nextEnd.getDate() + days)

  return {
    level,
    period: activeSubscription?.period ?? 'monthly',
    status: 'active',
    startsAt: activeSubscription?.startsAt || now.toISOString(),
    endsAt: nextEnd.toISOString(),
    monthlyPrice: activeSubscription?.monthlyPrice || monthlyPrice,
    amount: activeSubscription?.amount ?? 0,
    baseAmount: activeSubscription?.baseAmount ?? 0,
    discountPercent: activeSubscription?.discountPercent ?? 0,
    source: activeSubscription?.source ?? 'manual',
  }
}

function mergeServerManagedFields(nextOnboarding: Record<string, unknown>, currentOnboarding: Record<string, unknown>) {
  const fieldsToPreserve = [
    'subscription',
    'weeklyPlanAccessUntil',
    'weeklyPlanText',
    'weeklyPlanGeneratedAt',
    'referralInvitesAccepted',
    'referralRewardsGranted',
    'promoPostShares',
    'lastPromoShareAt',
  ]

  const merged = { ...nextOnboarding }
  for (const field of fieldsToPreserve) {
    if (merged[field] === undefined && currentOnboarding[field] !== undefined) {
      merged[field] = currentOnboarding[field]
    }
  }
  return merged
}

async function verifyVkIdentity(auth: AuthPayloadVk, expectedVkUserId?: number): Promise<VerifiedIdentity> {
  const accessToken = auth.accessToken?.trim()
  if (!accessToken) throw new Error('VK access token is required')

  const appId = Number(auth.appId ?? getOptionalEnv('VK_APP_ID') ?? 0)
  if (!Number.isFinite(appId) || appId <= 0) {
    throw new Error('VK app id is required to verify VK ID')
  }

  const query = new URLSearchParams({ client_id: String(appId) })
  const response = await fetch(`https://id.vk.com/oauth2/user_info?${query.toString()}`, {
    method: 'POST',
    body: new URLSearchParams({ access_token: accessToken }),
  })

  const payload = await response.json().catch(() => null) as { user?: { user_id?: string } ; error?: string; error_description?: string } | null
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error_description || payload?.error || `VK user_info failed with status ${response.status}`)
  }

  const verifiedVkUserId = Number(payload?.user?.user_id ?? 0)
  if (!Number.isFinite(verifiedVkUserId) || verifiedVkUserId <= 0) {
    throw new Error('VK user_info did not return a valid user id')
  }

  if (expectedVkUserId && expectedVkUserId !== verifiedVkUserId) {
    throw new Error('VK identity does not match requested user')
  }

  return {
    provider: 'vk',
    vkUserId: verifiedVkUserId,
  }
}

async function verifyEmailIdentity(auth: AuthPayloadEmail, expectedVkUserId?: number): Promise<VerifiedIdentity> {
  const accessToken = auth.accessToken?.trim()
  if (!accessToken) throw new Error('Email access token is required')

  const admin = getAdminClient()
  const { data, error } = await admin.auth.getUser(accessToken)
  if (error) throw error

  const userId = data.user?.id
  if (!userId) throw new Error('Supabase auth user not found')

  const derivedVkUserId = hashIdentityToUserId(`email:${userId}`)
  if (expectedVkUserId && expectedVkUserId !== derivedVkUserId) {
    throw new Error('Email identity does not match requested user')
  }

  return {
    provider: 'email',
    vkUserId: derivedVkUserId,
    email: data.user?.email?.toLowerCase() ?? '',
    authUserId: userId,
  }
}

async function verifyTelegramIdentity(auth: AuthPayloadTelegram, expectedVkUserId?: number): Promise<VerifiedIdentity> {
  const botToken = getEnv('TELEGRAM_BOT_TOKEN')
  const telegramId = Number(auth.id ?? 0)
  const authDate = Number(auth.auth_date ?? 0)
  const firstName = asString(auth.first_name).trim()
  const hash = asString(auth.hash).trim().toLowerCase()

  if (!Number.isFinite(telegramId) || telegramId <= 0 || !Number.isFinite(authDate) || authDate <= 0 || !firstName || !hash) {
    throw new Error('Telegram login payload is incomplete')
  }

  const dataCheckString = buildTelegramDataCheckString({
    provider: 'telegram',
    id: telegramId,
    first_name: firstName,
    last_name: asString(auth.last_name).trim() || undefined,
    username: asString(auth.username).trim().replace(/^@+/, '') || undefined,
    photo_url: asString(auth.photo_url).trim() || undefined,
    auth_date: authDate,
    hash,
  })

  const secretKey = await buildTelegramSecretKey(botToken)
  const signature = await hmacSha256Hex(secretKey, dataCheckString)
  if (signature !== hash) {
    throw new Error('Telegram login signature is invalid')
  }

  const derivedVkUserId = hashIdentityToUserId(`telegram:${telegramId}`)
  if (expectedVkUserId && expectedVkUserId !== derivedVkUserId) {
    throw new Error('Telegram identity does not match requested user')
  }

  return {
    provider: 'telegram',
    vkUserId: derivedVkUserId,
    telegramId,
    telegramUsername: asString(auth.username).trim().replace(/^@+/, '') || undefined,
  }
}

async function verifyReviewIdentity(auth: AuthPayloadReview, expectedVkUserId?: number): Promise<VerifiedIdentity> {
  const expectedLogin = getOptionalEnv('REVIEW_LOGIN')
  const expectedPassword = getOptionalEnv('REVIEW_PASSWORD')
  const reviewUserId = Number(getOptionalEnv('REVIEW_VK_USER_ID') || String(REVIEW_USER_ID))

  if (!expectedLogin || !expectedPassword) {
    throw new Error('Review login is not configured')
  }

  if (auth.login?.trim() !== expectedLogin || auth.password !== expectedPassword) {
    throw new Error('Неверный логин или пароль')
  }

  if (expectedVkUserId && expectedVkUserId !== reviewUserId) {
    throw new Error('Review identity does not match requested user')
  }

  return {
    provider: 'review',
    vkUserId: reviewUserId,
  }
}

async function verifyIdentity(authValue: unknown, expectedVkUserId?: number) {
  const auth = asObject(authValue) as Partial<AuthPayload>

  if (auth.provider === 'vk') {
    return await verifyVkIdentity({
      provider: 'vk',
      accessToken: asString(auth.accessToken),
      userId: asNumber(auth.userId),
      appId: asNumber(auth.appId) || undefined,
    }, expectedVkUserId)
  }

  if (auth.provider === 'email') {
    return await verifyEmailIdentity({
      provider: 'email',
      accessToken: asString(auth.accessToken),
    }, expectedVkUserId)
  }

  if (auth.provider === 'telegram') {
    return await verifyTelegramIdentity({
      provider: 'telegram',
      id: asNumber(auth.id),
      first_name: asString(auth.first_name),
      last_name: asString(auth.last_name) || undefined,
      username: asString(auth.username) || undefined,
      photo_url: asString(auth.photo_url) || undefined,
      auth_date: asNumber(auth.auth_date),
      hash: asString(auth.hash),
    }, expectedVkUserId)
  }

  if (auth.provider === 'review') {
    return await verifyReviewIdentity({
      provider: 'review',
      login: asString(auth.login),
      password: asString(auth.password),
    }, expectedVkUserId)
  }

  throw new Error('Authentication is required')
}

async function loadExistingUserRow(admin: ReturnType<typeof getAdminClient>, vkUserId: number) {
  const { data, error } = await admin
    .from('garden_data')
    .select('vk_user_id, onboarding, plan, created_at, updated_at')
    .eq('vk_user_id', vkUserId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function ensureReviewUserRow(admin: ReturnType<typeof getAdminClient>, vkUserId: number) {
  let row = await loadExistingUserRow(admin, vkUserId)
  if (row) return row

  const onboarding = buildDefaultReviewOnboarding()
  const { error } = await admin
    .from('garden_data')
    .upsert({
      vk_user_id: vkUserId,
      onboarding,
      plan: 'free',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'vk_user_id' })

  if (error) throw error
  row = await loadExistingUserRow(admin, vkUserId)
  return row
}

function bindIdentityToOnboarding(onboardingValue: unknown, identity?: VerifiedIdentity) {
  const onboarding = asObject(onboardingValue)
  if (!identity) return onboarding

  const nextOnboarding = { ...onboarding }

  if (identity.provider === 'vk' && identity.vkUserId > 0) {
    nextOnboarding.vkContactUserId = identity.vkUserId
  }

  if (identity.provider === 'telegram' && identity.telegramId) {
    nextOnboarding.telegramChatId = identity.telegramId
    if (identity.telegramUsername) {
      nextOnboarding.telegramUsername = identity.telegramUsername
    }
  }

  return nextOnboarding
}

async function saveUserRow(
  admin: ReturnType<typeof getAdminClient>,
  vkUserId: number,
  onboardingInput: unknown,
  identity?: VerifiedIdentity,
  requestedPlan?: unknown,
) {
  const currentRow = await loadExistingUserRow(admin, vkUserId)
  const currentOnboarding = asObject(currentRow?.onboarding)
  const requestedOnboarding = bindIdentityToOnboarding(onboardingInput, identity)
  const nextOnboarding = mergeServerManagedFields(requestedOnboarding, currentOnboarding)
  const normalizedReferralCode = asString(nextOnboarding.referralCode).trim() || buildReferralCode(vkUserId)
  nextOnboarding.referralCode = normalizedReferralCode

  const plan = resolvePlanForSave({
    requestedPlan,
    nextOnboarding,
    currentPlan: currentRow?.plan,
    currentOnboarding,
  })

  const { error } = await admin
    .from('garden_data')
    .upsert({
      vk_user_id: vkUserId,
      onboarding: nextOnboarding,
      plan,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'vk_user_id' })

  if (error) throw error

  return {
    plan,
    onboarding: nextOnboarding,
  }
}

async function handleLoadUserData(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  const identity = await verifyIdentity(body.auth, vkUserId)

  const admin = getAdminClient()
  const row = identity.provider === 'review'
    ? await ensureReviewUserRow(admin, identity.vkUserId)
    : await loadExistingUserRow(admin, vkUserId)
  return json({ ok: true, data: row ?? null })
}

async function handleSaveUserData(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  const identity = await verifyIdentity(body.auth, vkUserId)

  const admin = getAdminClient()
  const saved = await saveUserRow(admin, vkUserId, body.onboarding, identity, body.plan)
  return json({ ok: true, data: saved })
}

async function handleApplyReferral(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  const identity = await verifyIdentity(body.auth, vkUserId)

  const admin = getAdminClient()
  const pendingReferral = asString(body.pendingReferral).trim()
  const onboarding = bindIdentityToOnboarding(body.onboarding, identity)
  const currentOnboarding = {
    ...onboarding,
    referralCode: asString(onboarding.referralCode).trim() || buildReferralCode(vkUserId),
  }

  if (!pendingReferral || vkUserId === 1 || asString(currentOnboarding.referralAppliedCode).trim()) {
    const saved = await saveUserRow(admin, vkUserId, currentOnboarding)
    return json({ ok: true, data: { ...saved, referralApplied: false } })
  }

  const inviterId = parseReferralOwnerId(pendingReferral)
  if (!inviterId || inviterId === vkUserId) {
    const saved = await saveUserRow(admin, vkUserId, currentOnboarding)
    return json({ ok: true, data: { ...saved, referralApplied: false } })
  }

  const inviterRow = await loadExistingUserRow(admin, inviterId)
  if (!inviterRow) {
    const saved = await saveUserRow(admin, vkUserId, currentOnboarding)
    return json({ ok: true, data: { ...saved, referralApplied: false } })
  }

  const inviterOnboarding = asObject(inviterRow.onboarding)
  const nextAccepted = asNumber(inviterOnboarding.referralInvitesAccepted) + 1
  const nextRewardsGranted = Math.floor(nextAccepted / 3)
  const prevRewardsGranted = asNumber(inviterOnboarding.referralRewardsGranted)

  const nextInviterOnboarding = {
    ...inviterOnboarding,
    referralCode: asString(inviterOnboarding.referralCode).trim() || buildReferralCode(inviterId),
    referralInvitesAccepted: nextAccepted,
    referralRewardsGranted: nextRewardsGranted,
    subscription: nextRewardsGranted > prevRewardsGranted
      ? grantBonusAccessDays(inviterOnboarding.subscription, 7)
      : normalizeSubscription(inviterOnboarding.subscription),
  }

  const nextCurrentOnboarding = {
    ...currentOnboarding,
    referralAppliedCode: pendingReferral,
    subscription: grantBonusAccessDays(currentOnboarding.subscription, 2),
  }

  const nextCurrentPlan = getEffectivePlanFromOnboarding(nextCurrentOnboarding)
  const nextInviterPlan = getEffectivePlanFromOnboarding(nextInviterOnboarding)
  const updatedAt = new Date().toISOString()

  const { error } = await admin
    .from('garden_data')
    .upsert([
      {
        vk_user_id: inviterId,
        onboarding: nextInviterOnboarding,
        plan: nextInviterPlan,
        updated_at: updatedAt,
      },
      {
        vk_user_id: vkUserId,
        onboarding: nextCurrentOnboarding,
        plan: nextCurrentPlan,
        updated_at: updatedAt,
      },
    ], { onConflict: 'vk_user_id' })

  if (error) throw error

  return json({
    ok: true,
    data: {
      onboarding: nextCurrentOnboarding,
      plan: nextCurrentPlan,
      referralApplied: true,
    },
  })
}

async function handleLoadNotifications(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  await verifyIdentity(body.auth, vkUserId)

  const type = asString(body.type).trim()
  const excludeTypes = asStringArray(body.excludeTypes)
  const limit = Math.min(Math.max(asNumber(body.limit) || 20, 1), 200)

  const admin = getAdminClient()
  let query = admin
    .from('notifications')
    .select('title, body, type, created_at')
    .eq('vk_user_id', vkUserId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) query = query.eq('type', type)
  if (excludeTypes.length > 0) query = query.not('type', 'in', `(${excludeTypes.map(item => `"${item}"`).join(',')})`)

  const { data, error } = await query
  if (error) throw error

  return json({ ok: true, data: data ?? [] })
}

async function handleLoadDiary(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  await verifyIdentity(body.auth, vkUserId)

  const cropId = asString(body.cropId).trim()
  const limit = Math.min(Math.max(asNumber(body.limit) || 50, 1), 200)

  const admin = getAdminClient()
  let query = admin
    .from('diary')
    .select('*')
    .eq('vk_user_id', vkUserId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (cropId) query = query.eq('crop_id', cropId)

  const { data, error } = await query
  if (error) throw error

  return json({ ok: true, data: data ?? [] })
}

async function handleAddDiaryEntry(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  await verifyIdentity(body.auth, vkUserId)

  const cropId = asString(body.cropId).trim() || null
  const operation = asString(body.operation).trim() || null
  const text = asString(body.text).trim()
  const dedupeScope = asString(body.dedupeScope).trim()
  if (!text) throw new Error('Diary text is required')

  const admin = getAdminClient()

  if (dedupeScope === 'daily_task' && cropId && operation) {
    const userRow = await loadExistingUserRow(admin, vkUserId)
    const onboarding = asObject(userRow?.onboarding)
    const timeZone = asString(onboarding.timeZone).trim() || 'Europe/Moscow'
    const todayKey = getDateKeyInTimeZone(new Date(), timeZone)

    const { data: existingEntries, error: existingError } = await admin
      .from('diary')
      .select('*')
      .eq('vk_user_id', vkUserId)
      .eq('crop_id', cropId)
      .eq('operation', operation)
      .order('created_at', { ascending: false })
      .limit(10)

    if (existingError) throw existingError

    const existingEntry = (existingEntries ?? []).find((entry) =>
      getDateKeyInTimeZone(String(entry.created_at), timeZone) === todayKey
    )

    if (existingEntry) {
      return json({ ok: true, data: existingEntry })
    }
  }

  const { data, error } = await admin
    .from('diary')
    .insert({ vk_user_id: vkUserId, crop_id: cropId, operation, text })
    .select('*')
    .single()

  if (error) throw error
  return json({ ok: true, data })
}

async function handleDeleteDiaryEntry(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  await verifyIdentity(body.auth, vkUserId)

  const entryId = asNumber(body.entryId)
  if (!entryId) throw new Error('entryId is required')

  const admin = getAdminClient()
  const { error } = await admin
    .from('diary')
    .delete()
    .eq('id', entryId)
    .eq('vk_user_id', vkUserId)

  if (error) throw error
  return json({ ok: true, data: { deleted: true } })
}

async function handleDeleteAccount(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  const identity = await verifyIdentity(body.auth, vkUserId)

  const admin = getAdminClient()

  const deletions = [
    admin.from('notification_jobs').delete().eq('vk_user_id', vkUserId),
    admin.from('notifications').delete().eq('vk_user_id', vkUserId),
    admin.from('diary').delete().eq('vk_user_id', vkUserId),
    admin.from('seasons').delete().eq('vk_user_id', vkUserId),
    admin.from('billing_payments').delete().eq('vk_user_id', vkUserId),
    admin.from('analytics_events').delete().eq('vk_user_id', vkUserId),
    admin.from('garden_data').delete().eq('vk_user_id', vkUserId),
  ]

  const results = await Promise.all(deletions)
  const failed = results.find(result => result.error)
  if (failed?.error) throw failed.error

  if (identity.provider === 'email' && identity.authUserId) {
    const { error } = await admin.auth.admin.deleteUser(identity.authUserId)
    if (error) throw error
  }

  return json({ ok: true, data: { deleted: true } })
}

async function handleLoadSeasons(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  await verifyIdentity(body.auth, vkUserId)

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('seasons')
    .select('*')
    .eq('vk_user_id', vkUserId)
    .order('year', { ascending: false })

  if (error) throw error
  return json({ ok: true, data: data ?? [] })
}

async function handleSaveSeasonSnapshot(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  await verifyIdentity(body.auth, vkUserId)

  const year = asNumber(body.year)
  if (!year) throw new Error('year is required')

  const snapshot = asObject(body.snapshot)
  const summary = asString(body.summary).trim() || null
  const admin = getAdminClient()
  const { error } = await admin
    .from('seasons')
    .upsert({ vk_user_id: vkUserId, year, snapshot, summary }, { onConflict: 'vk_user_id,year' })

  if (error) throw error
  return json({ ok: true, data: { saved: true } })
}

async function handleTrackAnalyticsEvent(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  await verifyIdentity(body.auth, vkUserId)

  const eventType = asString(body.eventType).trim()
  if (!eventType) throw new Error('eventType is required')

  const source = asString(body.source).trim() || null
  const metadata = asObject(body.metadata)
  const admin = getAdminClient()
  const { error } = await admin
    .from('analytics_events')
    .insert({
      vk_user_id: vkUserId,
      event_type: eventType,
      source,
      metadata,
    })

  if (error) throw error
  return json({ ok: true, data: { tracked: true } })
}

async function handleSendTestTelegram(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  const identity = await verifyIdentity(body.auth, vkUserId)
  const admin = getAdminClient()
  const row = await loadExistingUserRow(admin, vkUserId)
  const onboarding = asObject(row?.onboarding)
  const telegramChatId = asNumber(onboarding.telegramChatId) || identity.telegramId || 0

  if (!telegramChatId) {
    throw new Error('Telegram ещё не привязан. Сначала войдите через Telegram.')
  }

  const displayName = asString(onboarding.displayName).trim()
  const city = asString(onboarding.city).trim()
  const morning = asString(onboarding.notifMorning).trim() || '06:00'
  const evening = asString(onboarding.notifEvening).trim() || '19:00'
  const greeting = displayName ? `, ${displayName}` : ''
  const cityLine = city ? `Город: ${city}.\n` : ''
  const text = [
    `Тест уведомлений МойАгронома${greeting}`,
    '',
    `${cityLine}Telegram-канал подключён правильно.`,
    `Утренний совет: ${morning}`,
    `Вечерний совет: ${evening}`,
    '',
    'Если вы видите это сообщение, значит бот сможет присылать вам советы сюда.',
  ].join('\n')

  await sendTelegramMessage(telegramChatId, text)

  return json({ ok: true, data: { sent: true } })
}

async function handleLoadAdminStats(body: Record<string, unknown>) {
  const identity = await verifyIdentity(body.auth)
  const email = identity.email?.toLowerCase() ?? ''
  const ownerTelegramIds = getOwnerTelegramIds()
  const ownerTelegramUsernames = getOwnerTelegramUsernames()
  const admin = getAdminClient()
  const ownerRow = await loadExistingUserRow(admin, OWNER_VK_ID)
  const ownerOnboarding = asObject(ownerRow?.onboarding)
  const ownerTelegramChatId = asNumber(ownerOnboarding.telegramChatId)
  const ownerTelegramUsername = asString(ownerOnboarding.telegramUsername).trim().replace(/^@+/, '').toLowerCase()
  const telegramMatchesOwner = identity.provider === 'telegram' && (
    (identity.telegramId != null && identity.telegramId > 0 && (
      identity.telegramId === ownerTelegramChatId
      || ownerTelegramIds.includes(identity.telegramId)
    ))
    || Boolean(identity.telegramUsername && (
      identity.telegramUsername.toLowerCase() === ownerTelegramUsername
      || ownerTelegramUsernames.includes(identity.telegramUsername.toLowerCase())
    ))
  )

  const isOwner = identity.vkUserId === OWNER_VK_ID
    || Boolean(email && OWNER_EMAILS.includes(email))
    || telegramMatchesOwner
  if (!isOwner) {
    return json({ error: 'Forbidden' }, 403)
  }

  const now = Date.now()
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    totalUsersRes,
    newUsersRes,
    newUsers30dRes,
    activeProfiles7dRes,
    activeProfiles30dRes,
    diaryRes,
    paidPaymentsRes,
    paidPayments7dRes,
    paidPayments30dRes,
    gardenRowsRes,
    eventsRes,
  ] = await Promise.all([
    admin.from('garden_data').select('*', { count: 'exact', head: true }),
    admin.from('garden_data').select('*', { count: 'exact', head: true }).gte('created_at', since7d),
    admin.from('garden_data').select('*', { count: 'exact', head: true }).gte('created_at', since30d),
    admin.from('garden_data').select('*', { count: 'exact', head: true }).gte('updated_at', since7d),
    admin.from('garden_data').select('*', { count: 'exact', head: true }).gte('updated_at', since30d),
    admin.from('diary').select('*', { count: 'exact', head: true }),
    admin.from('billing_payments').select('amount, created_at').eq('status', 'succeeded'),
    admin.from('billing_payments').select('amount, created_at').eq('status', 'succeeded').gte('created_at', since7d),
    admin.from('billing_payments').select('amount, created_at').eq('status', 'succeeded').gte('created_at', since30d),
    admin.from('garden_data').select('plan, onboarding'),
    admin.from('analytics_events').select('event_type, created_at').gte('created_at', since30d),
  ])

  const totalUsers = totalUsersRes.count ?? 0
  const newUsers7d = newUsersRes.count ?? 0
  const newUsers30d = newUsers30dRes.count ?? 0
  const activeProfiles7d = activeProfiles7dRes.count ?? 0
  const activeProfiles30d = activeProfiles30dRes.count ?? 0
  const diaryEntries = diaryRes.count ?? 0
  const successfulPayments = (paidPaymentsRes.data ?? []).length
  const successfulPayments7d = (paidPayments7dRes.data ?? []).length
  const revenueTotal = (paidPaymentsRes.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const revenue7d = (paidPayments7dRes.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const revenue30d = (paidPayments30dRes.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const paymentSucceeded30d = (paidPayments30dRes.data ?? []).length

  const activePaidUsers = (gardenRowsRes.data ?? []).reduce((count, row) => {
    const onboarding = asObject(row.onboarding)
    const subscription = normalizeSubscription(onboarding.subscription)
    return subscription && !isSubscriptionExpired(subscription) ? count + 1 : count
  }, 0)

  const events = eventsRes.data ?? []
  const countEvents = (eventType: string, sinceIso: string) => events.filter(event => event.event_type === eventType && String(event.created_at) >= sinceIso).length

  return json({
    ok: true,
    data: {
      totalUsers,
      newUsers7d,
      newUsers30d,
      activeProfiles7d,
      activeProfiles30d,
      activePaidUsers,
      diaryEntries,
      successfulPayments,
      successfulPayments7d,
      revenueTotal,
      revenue7d,
      revenue30d,
      authSuccesses7d: countEvents('auth_success', since7d),
      authSuccesses30d: countEvents('auth_success', since30d),
      onboardingCompleted7d: countEvents('onboarding_complete', since7d),
      onboardingCompleted30d: countEvents('onboarding_complete', since30d),
      checkoutOpened7d: countEvents('checkout_opened', since7d),
      checkoutOpened30d: countEvents('checkout_opened', since30d),
      paymentSucceeded30d,
      referralApplied7d: countEvents('referral_applied', since7d),
      referralApplied30d: countEvents('referral_applied', since30d),
      vkShares7d: countEvents('vk_share', since7d),
      vkShares30d: countEvents('vk_share', since30d),
    },
  })
}

async function handleAnalyzePlantPhoto(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  await verifyIdentity(body.auth, vkUserId)

  const parsedImage = parseDataUrlImage(asString(body.imageDataUrl))
  const cropName = asString(body.cropName)
  const city = asString(body.city)
  const note = asString(body.note)
  const weather = asObject(body.weather)

  const result = await analyzePlantPhotoWithOpenAI({
    imageDataUrl: parsedImage.dataUrl,
    cropName,
    city,
    note,
    weather,
  })

  return json({ ok: true, data: result })
}

async function handleAskAgronomist(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  await verifyIdentity(body.auth, vkUserId)

  const question = asString(body.question).trim()
  if (!question) {
    throw new Error('Вопрос для агронома не передан')
  }

  const gardenContext = asObject(body.gardenContext)
  const plan = asString(body.plan).trim() || 'free'
  const payload = await requestGardenAgent<WorkerChatPayload>('/chat', {
    vk_user_id: vkUserId,
    question,
    garden_context: gardenContext,
    plan,
  })
  const answer = asString(payload.answer).trim()
  if (!answer) {
    throw new Error('Сервис агронома вернул пустой ответ')
  }

  return json({ ok: true, data: { answer } })
}

function normalizeWeeklyPlanResponse(payload: WorkerWeeklyPlanPayload) {
  const plan = Array.isArray(payload.plan) ? payload.plan : []
  return plan.map(day => ({
    date: asString(day.date),
    tasks: (Array.isArray(day.tasks) ? day.tasks : [])
      .map(task => ({
        crop: asString(task.crop).trim(),
        action: asString(task.action).trim(),
        reason: asString(task.reason).trim(),
      }))
      .filter(task => task.crop && task.action),
  }))
}

async function handleLoadWeeklyPlan(body: Record<string, unknown>) {
  const vkUserId = asNumber(body.vkUserId)
  await verifyIdentity(body.auth, vkUserId)

  const gardenContext = asObject(body.gardenContext)
  const payload = await requestGardenAgent<WorkerWeeklyPlanPayload>('/weekly-plan', {
    vk_user_id: vkUserId,
    garden_context: gardenContext,
  })

  return json({ ok: true, data: { plan: normalizeWeeklyPlanResponse(payload) } })
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return json({ ok: true })

  try {
    const body = asObject(await request.json().catch(() => ({})))
    const action = asString(body.action)

    switch (action) {
      case 'load_user_data':
        return await handleLoadUserData(body)
      case 'save_user_data':
        return await handleSaveUserData(body)
      case 'apply_referral':
        return await handleApplyReferral(body)
      case 'load_notifications':
        return await handleLoadNotifications(body)
      case 'load_diary':
        return await handleLoadDiary(body)
      case 'add_diary_entry':
        return await handleAddDiaryEntry(body)
      case 'delete_diary_entry':
        return await handleDeleteDiaryEntry(body)
      case 'delete_account':
        return await handleDeleteAccount(body)
      case 'load_seasons':
        return await handleLoadSeasons(body)
      case 'save_season_snapshot':
        return await handleSaveSeasonSnapshot(body)
      case 'track_analytics_event':
        return await handleTrackAnalyticsEvent(body)
      case 'send_test_telegram':
        return await handleSendTestTelegram(body)
      case 'load_admin_stats':
        return await handleLoadAdminStats(body)
      case 'analyze_plant_photo':
        return await handleAnalyzePlantPhoto(body)
      case 'ask_agronomist':
        return await handleAskAgronomist(body)
      case 'load_weekly_plan':
        return await handleLoadWeeklyPlan(body)
      default:
        return json({ error: 'Unknown action' }, 400)
    }
  } catch (error) {
    console.error('user-data error:', error)
    return json({
      error: error instanceof Error ? error.message : 'User data API failed',
    }, 400)
  }
})
