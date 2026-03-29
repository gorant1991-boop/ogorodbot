import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Plan = 'base' | 'pro'
type BillingPeriod = 'monthly' | 'seasonal'

interface SubscriptionOffer {
  id: string
  level: Plan
  period: BillingPeriod
  title: string
  amount: number
  baseAmount: number
  discountPercent: number
  endsAt: string
  monthlyPrice: number
}

interface YooKassaPayment {
  id: string
  status: string
  paid: boolean
  amount: { value: string; currency: string }
  description?: string
  created_at?: string
  paid_at?: string
  payment_method?: { id?: string }
  metadata?: Record<string, string>
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

export function handleCors(request: Request) {
  if (request.method === 'OPTIONS') return json({ ok: true })
  return null
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getSeasonEndDate(now: Date): Date {
  const year = now.getFullYear()
  const seasonEnd = new Date(year, 9, 31, 23, 59, 59, 999)
  if (now <= seasonEnd) return seasonEnd
  return new Date(year + 1, 9, 31, 23, 59, 59, 999)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function diffDaysInclusive(from: Date, to: Date): number {
  const start = startOfDay(from).getTime()
  const end = startOfDay(to).getTime()
  return Math.max(1, Math.ceil((end - start) / 86400000) + 1)
}

function buildOffers(now = new Date()): Record<string, SubscriptionOffer> {
  const seasonEnd = getSeasonEndDate(now)
  const monthlyPrices: Record<Plan, number> = { base: 150, pro: 300 }
  const offers: SubscriptionOffer[] = (['base', 'pro'] as Plan[]).flatMap(level => {
    const monthlyPrice = monthlyPrices[level]
    const monthlyEndsAt = addDays(now, 30)
    const seasonDays = diffDaysInclusive(now, seasonEnd)
    const seasonBaseAmount = Math.ceil((monthlyPrice / 30) * seasonDays)
    const seasonAmount = Math.ceil(seasonBaseAmount * 0.8)
    const planTitle = level === 'base' ? 'Базовая' : 'Про'

    return [
      {
        id: `${level}-monthly`,
        level,
        period: 'monthly',
        title: `${planTitle} на месяц`,
        amount: monthlyPrice,
        baseAmount: monthlyPrice,
        discountPercent: 0,
        endsAt: monthlyEndsAt.toISOString(),
        monthlyPrice,
      },
      {
        id: `${level}-seasonal`,
        level,
        period: 'seasonal',
        title: `${planTitle} на сезон`,
        amount: seasonAmount,
        baseAmount: seasonBaseAmount,
        discountPercent: 20,
        endsAt: seasonEnd.toISOString(),
        monthlyPrice,
      },
    ]
  })

  return Object.fromEntries(offers.map(offer => [offer.id, offer]))
}

function getEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

function getAdminClient() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))
}

async function callYooKassa(path: string, init: RequestInit = {}, idempotenceKey?: string) {
  const shopId = getEnv('YOOKASSA_SHOP_ID')
  const secretKey = getEnv('YOOKASSA_SECRET_KEY')
  const basicAuth = btoa(`${shopId}:${secretKey}`)

  const response = await fetch(`https://api.yookassa.ru/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
      ...(idempotenceKey ? { 'Idempotence-Key': idempotenceKey } : {}),
      ...(init.headers ?? {}),
    },
  })

  const payload = await response.json()
  if (!response.ok) {
    const description = payload?.description || 'YooKassa request failed'
    throw new Error(description)
  }

  return payload
}

async function upsertBillingPayment(admin: ReturnType<typeof getAdminClient>, payment: YooKassaPayment) {
  const metadata = payment.metadata ?? {}
  const amount = Number(payment.amount?.value ?? 0)
  const payload = {
    provider: 'yookassa',
    provider_payment_id: payment.id,
    vk_user_id: Number(metadata.vk_user_id ?? 0),
    offer_id: metadata.offer_id ?? '',
    plan: metadata.subscription_level ?? '',
    period: metadata.subscription_period ?? '',
    amount,
    currency: payment.amount?.currency ?? 'RUB',
    status: payment.status,
    payment_method_id: payment.payment_method?.id ?? null,
    metadata,
    paid_at: payment.paid_at ?? null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin.from('billing_payments').upsert(payload, {
    onConflict: 'provider_payment_id',
  })
  if (error) throw error
}

export async function createEmbeddedPayment(input: { offerId: string; vkUserId: number }) {
  const offers = buildOffers()
  const offer = offers[input.offerId]
  if (!offer) throw new Error('Неизвестный тариф')
  if (!Number.isFinite(input.vkUserId) || input.vkUserId <= 0) throw new Error('Некорректный пользователь')

  const enableRecurring = Deno.env.get('YOOKASSA_ENABLE_RECURRING') === 'true'
  const admin = getAdminClient()

  const metadata = {
    offer_id: offer.id,
    vk_user_id: String(input.vkUserId),
    subscription_level: offer.level,
    subscription_period: offer.period,
    subscription_ends_at: offer.endsAt,
    monthly_price: String(offer.monthlyPrice),
    base_amount: String(offer.baseAmount),
    amount: String(offer.amount),
    discount_percent: String(offer.discountPercent),
    title: offer.title,
  }

  const payment = await callYooKassa('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: { value: offer.amount.toFixed(2), currency: 'RUB' },
      capture: true,
      save_payment_method: enableRecurring,
      description: `ОгородБот — ${offer.title}`,
      confirmation: { type: 'embedded' },
      metadata,
    }),
  }, crypto.randomUUID())

  await upsertBillingPayment(admin, payment)

  return json({
    paymentId: payment.id,
    confirmationToken: payment.confirmation?.confirmation_token,
    amount: offer.amount,
    currency: 'RUB',
    title: offer.title,
  })
}

export async function fetchPaymentStatus(paymentId: string) {
  return callYooKassa(`/payments/${paymentId}`, { method: 'GET' }) as Promise<YooKassaPayment>
}

export async function applySuccessfulPayment(payment: YooKassaPayment) {
  const admin = getAdminClient()
  await upsertBillingPayment(admin, payment)

  const { data: billingRow, error: billingError } = await admin
    .from('billing_payments')
    .select('id, applied_at')
    .eq('provider_payment_id', payment.id)
    .maybeSingle()
  if (billingError) throw billingError

  const metadata = payment.metadata ?? {}
  const vkUserId = Number(metadata.vk_user_id ?? 0)
  if (!vkUserId) throw new Error('Платёж не привязан к пользователю')

  const subscription = {
    level: metadata.subscription_level as Plan,
    period: metadata.subscription_period as BillingPeriod,
    status: 'active' as const,
    startsAt: payment.paid_at ?? payment.created_at ?? new Date().toISOString(),
    endsAt: metadata.subscription_ends_at,
    monthlyPrice: Number(metadata.monthly_price ?? 0),
    amount: Number(metadata.amount ?? payment.amount?.value ?? 0),
    baseAmount: Number(metadata.base_amount ?? payment.amount?.value ?? 0),
    discountPercent: Number(metadata.discount_percent ?? 0),
    source: 'yookassa' as const,
  }

  if (!billingRow?.applied_at) {
    const { data: existingGarden, error: gardenError } = await admin
      .from('garden_data')
      .select('onboarding')
      .eq('vk_user_id', vkUserId)
      .maybeSingle()
    if (gardenError) throw gardenError

    const onboarding = typeof existingGarden?.onboarding === 'object' && existingGarden?.onboarding
      ? { ...(existingGarden.onboarding as Record<string, unknown>) }
      : {}
    onboarding.subscription = subscription

    const { error: upsertGardenError } = await admin
      .from('garden_data')
      .upsert({
        vk_user_id: vkUserId,
        onboarding,
        plan: subscription.level,
      }, {
        onConflict: 'vk_user_id',
      })
    if (upsertGardenError) throw upsertGardenError

    await admin.from('notifications').insert({
      vk_user_id: vkUserId,
      type: 'subscription',
      title: 'Подписка активирована',
      body: `${metadata.title ?? 'Подписка'} оплачена и активна до ${new Date(subscription.endsAt).toLocaleDateString('ru-RU')}.`,
    })

    await admin
      .from('billing_payments')
      .update({ applied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('provider_payment_id', payment.id)
  }

  return subscription
}

export { json }
