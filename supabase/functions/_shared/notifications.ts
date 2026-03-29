import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
interface SubscriptionInfo {
  level: 'base' | 'pro'
  period: 'monthly' | 'seasonal'
  status: 'active' | 'expired'
  startsAt: string
  endsAt: string
  monthlyPrice: number
  amount: number
  baseAmount: number
  discountPercent: number
  source: 'manual' | 'vk_pay' | 'yookassa'
}

interface CropVariety {
  name: string
  note?: string
}

interface CropEntry {
  id: string
  status: 'planned' | 'planted'
  varieties?: CropVariety[]
}

interface FertilizerItem {
  name: string
  brand?: string
  composition?: string
  note?: string
}

interface OnboardingData {
  city?: string
  terrain?: string
  cropEntries?: CropEntry[]
  gardenObjects?: { name?: string }[]
  fertilizers?: FertilizerItem[]
  experience?: string
  notifMorning?: string
  notifChannels?: string[]
  notificationEmail?: string
  vkContactUserId?: number
  timeZone?: string
  subscription?: SubscriptionInfo | null
}

interface GardenRow {
  vk_user_id: number
  plan: 'free' | 'base' | 'pro'
  onboarding: OnboardingData | null
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

function handleCors(request: Request) {
  if (request.method === 'OPTIONS') return json({ ok: true })
  return null
}

function getEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

function getOptionalEnv(name: string) {
  return Deno.env.get(name)?.trim() ?? ''
}

function getAdminClient() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))
}

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function buildAgronomistContext(data: OnboardingData, plan: string) {
  const crops = (data.cropEntries ?? []).map(entry => {
    const varieties = (entry.varieties ?? [])
      .filter(variety => variety.name?.trim())
      .map(variety => {
        const note = variety.note?.trim() ? ` (${variety.note.trim()})` : ''
        return `${variety.name.trim()}${note}`
      })
      .join(', ')
    const status = entry.status === 'planted' ? 'посажена' : 'в планах'
    return `${entry.id}: ${status}${varieties ? `; сорта ${varieties}` : ''}`
  })

  const objects = (data.gardenObjects ?? []).map(object => object.name?.trim()).filter(Boolean)
  const fertilizers = (data.fertilizers ?? [])
    .map(item => [item.name, item.brand, item.composition, item.note].filter(Boolean).join(' · '))
    .filter(Boolean)

  return [
    'Контекст огорода пользователя.',
    `Тариф: ${plan}.`,
    data.city ? `Город: ${data.city}.` : '',
    data.terrain ? `Климат/местность: ${data.terrain}.` : '',
    objects.length ? `Объекты: ${objects.join(', ')}.` : '',
    crops.length ? `Культуры: ${crops.join('; ')}.` : '',
    fertilizers.length ? `Удобрения в наличии: ${fertilizers.join('; ')}.` : '',
    data.experience ? `Опыт пользователя: ${data.experience}.` : '',
    'Сформируй короткий утренний совет для огорода на сегодня: 2-4 предложения, без воды, конкретно что проверить или сделать утром.',
  ].filter(Boolean).join(' ')
}

async function requestAdviceFromAgent(vkUserId: number, data: OnboardingData, plan: string) {
  const response = await fetch('https://garden-agent.gorant1991.workers.dev/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vk_user_id: vkUserId,
      question: buildAgronomistContext(data, plan),
      garden_context: data,
      plan,
    }),
  })

  if (!response.ok) {
    throw new Error(`Advice API failed with status ${response.status}`)
  }

  const payload = await response.json().catch(() => null)
  const answer = typeof payload?.answer === 'string' ? payload.answer.trim() : ''
  if (!answer) throw new Error('Advice API returned empty response')
  return answer
}

function buildFallbackAdvice(data: OnboardingData) {
  const city = data.city?.trim() ? `в ${data.city.trim()}` : ''
  const cropCount = data.cropEntries?.length ?? 0
  const firstCrop = data.cropEntries?.[0]?.id
  return [
    `Доброе утро${city ? `, огород ${city}` : ''}.`,
    cropCount > 0
      ? `С утра осмотрите ${firstCrop ? `культуру ${firstCrop}` : 'основные культуры'}: влажность почвы, листья и новые признаки болезней или вредителей.`
      : 'С утра проверьте влажность почвы, состояние грядок и укрытий после ночи.',
    'Если земля сухая сверху и день обещает быть тёплым, подготовьте полив на первую половину дня.',
  ].join(' ')
}

function parseTimeToMinutes(value: string | undefined) {
  const match = value?.match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function getLocalDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  )

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function isDueNow(now: Date, timeZone: string, targetTime: string, toleranceMinutes = 10) {
  const targetMinutes = parseTimeToMinutes(targetTime)
  if (targetMinutes === null) return false
  const local = getLocalDateParts(now, timeZone)
  return local.minutes >= targetMinutes && local.minutes < targetMinutes + toleranceMinutes
}

async function alreadySentToday(admin: ReturnType<typeof getAdminClient>, vkUserId: number, timeZone: string, now: Date) {
  const { data } = await admin
    .from('notifications')
    .select('created_at')
    .eq('vk_user_id', vkUserId)
    .eq('type', 'daily_advice')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.created_at) return false
  return getLocalDateParts(new Date(data.created_at), timeZone).dateKey === getLocalDateParts(now, timeZone).dateKey
}

async function insertDailyAdvice(admin: ReturnType<typeof getAdminClient>, vkUserId: number, title: string, body: string) {
  const { error } = await admin.from('notifications').insert({
    vk_user_id: vkUserId,
    type: 'daily_advice',
    title,
    body,
  })

  if (error) throw error
}

async function sendEmailAdvice(email: string, title: string, body: string) {
  const apiKey = getOptionalEnv('RESEND_API_KEY')
  const fromEmail = getOptionalEnv('ADVICE_FROM_EMAIL')
  if (!apiKey || !fromEmail || !normalizeEmail(email)) return { sent: false, skipped: true }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [normalizeEmail(email)],
      subject: title,
      text: body,
    }),
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`Resend error: ${payload}`)
  }

  return { sent: true, skipped: false }
}

async function sendVkAdvice(vkUserId: number, title: string, body: string) {
  const token = getOptionalEnv('VK_COMMUNITY_TOKEN')
  const apiVersion = getOptionalEnv('VK_API_VERSION') || '5.199'
  if (!token) return { sent: false, skipped: true }

  const randomId = Math.floor((Date.now() + vkUserId) % 2147483647)
  const params = new URLSearchParams({
    user_id: String(vkUserId),
    random_id: String(randomId),
    message: `${title}\n\n${body}`,
    access_token: token,
    v: apiVersion,
  })

  const response = await fetch('https://api.vk.com/method/messages.send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`VK API HTTP ${response.status}`)
  }

  if (payload?.error) {
    const message = payload.error.error_msg || 'VK messages.send failed'
    throw new Error(message)
  }

  return { sent: true, skipped: false }
}

function resolveVkRecipientId(row: GardenRow) {
  const contactVkUserId = Number(row.onboarding?.vkContactUserId ?? 0)
  if (Number.isFinite(contactVkUserId) && contactVkUserId > 0) return contactVkUserId
  return row.vk_user_id
}

export async function generateMorningAdvice(input: {
  nowIso?: string
  targetVkUserId?: number
  force?: boolean
}) {
  const admin = getAdminClient()
  const now = input.nowIso ? new Date(input.nowIso) : new Date()
  const force = Boolean(input.force)

  let query = admin
    .from('garden_data')
    .select('vk_user_id, plan, onboarding')
    .neq('vk_user_id', 1)

  if (input.targetVkUserId) {
    query = query.eq('vk_user_id', input.targetVkUserId)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as GardenRow[]
  const results: Array<Record<string, unknown>> = []

  for (const row of rows) {
    const onboarding = row.onboarding ?? {}
    const timeZone = onboarding.timeZone?.trim() || 'Europe/Moscow'
    const targetTime = onboarding.notifMorning?.trim() || '06:00'

    if (!force && !isDueNow(now, timeZone, targetTime)) {
      results.push({ vkUserId: row.vk_user_id, status: 'skipped_not_due', timeZone, targetTime })
      continue
    }

    if (!force && await alreadySentToday(admin, row.vk_user_id, timeZone, now)) {
      results.push({ vkUserId: row.vk_user_id, status: 'skipped_already_sent' })
      continue
    }

    const title = `Совет на утро · ${targetTime}`
    let body = ''

    try {
      body = await requestAdviceFromAgent(row.vk_user_id, onboarding, row.plan)
    } catch (error) {
      console.error('Advice generation fallback:', error)
      body = buildFallbackAdvice(onboarding)
    }

    await insertDailyAdvice(admin, row.vk_user_id, title, body)

    const email = normalizeEmail(onboarding.notificationEmail)
    const channels = onboarding.notifChannels ?? []
    const vkRecipientId = resolveVkRecipientId(row)
    let vkResult = { sent: false, skipped: true }
    if (channels.includes('vk')) {
      try {
        vkResult = await sendVkAdvice(vkRecipientId, title, body)
      } catch (error) {
        console.error('VK send error:', error)
        vkResult = { sent: false, skipped: false }
      }
    }

    const emailResult = channels.includes('email') && email
      ? await sendEmailAdvice(email, title, body)
      : { sent: false, skipped: true }

    results.push({
      vkUserId: row.vk_user_id,
      vkRecipientId,
      status: 'sent',
      vkSent: vkResult.sent,
      vkSkipped: vkResult.skipped,
      emailSent: emailResult.sent,
      emailSkipped: emailResult.skipped,
    })
  }

  return json({
    ok: true,
    processed: rows.length,
    results,
  })
}

export { handleCors, json }
