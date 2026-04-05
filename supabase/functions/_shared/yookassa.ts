import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Plan = 'base' | 'pro'
type BillingPeriod = 'monthly' | 'seasonal'
type OfferKind = 'subscription' | 'weekly_plan'

interface CheckoutOffer {
  id: string
  kind: OfferKind
  level?: Plan
  period?: BillingPeriod
  title: string
  amount: number
  baseAmount: number
  discountPercent: number
  endsAt: string
  days: number
  monthlyPrice?: number
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function extendWeeklyPlanAccess(currentAccessUntil: unknown, paidAtIso: string, days: number) {
  const paidAt = new Date(paidAtIso)
  const currentDate = typeof currentAccessUntil === 'string' ? new Date(currentAccessUntil) : null
  const currentTime = currentDate?.getTime() ?? Number.NaN
  const base = Number.isFinite(currentTime) && currentTime > paidAt.getTime()
    ? currentDate as Date
    : paidAt

  return addDays(base, days).toISOString()
}

function buildOffers(now = new Date()): Record<string, CheckoutOffer> {
  const monthlyPrices: Record<Plan, number> = { base: 150, pro: 300 }
  const offers: CheckoutOffer[] = (['base', 'pro'] as Plan[]).map(level => {
    const monthlyPrice = monthlyPrices[level]
    const monthlyEndsAt = addDays(now, 30)
    const planTitle = level === 'base' ? 'Базовая' : 'Про'

    return {
      id: `${level}-monthly`,
      kind: 'subscription',
      level,
      period: 'monthly',
      title: `${planTitle} на месяц`,
      amount: monthlyPrice,
      baseAmount: monthlyPrice,
      discountPercent: 0,
      endsAt: monthlyEndsAt.toISOString(),
      days: 30,
      monthlyPrice,
    }
  })

  offers.unshift({
    id: 'weekly-plan-7d',
    kind: 'weekly_plan',
    title: 'План на 7 дней',
    amount: 99,
    baseAmount: 99,
    discountPercent: 0,
    endsAt: addDays(now, 7).toISOString(),
    days: 7,
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

function buildSubscriptionFromOffer(params: {
  offer: CheckoutOffer
  currentSubscription: unknown
  paidAtIso: string
  fallbackAmount: number
}) {
  const { offer, currentSubscription, paidAtIso, fallbackAmount } = params
  if (offer.kind !== 'subscription' || !offer.level || !offer.period) {
    throw new Error('Некорректный оффер подписки')
  }

  const paidAt = new Date(paidAtIso)
  const rawCurrent = typeof currentSubscription === 'object' && currentSubscription
    ? currentSubscription as Record<string, unknown>
    : null
  const currentEndsAt = typeof rawCurrent?.endsAt === 'string'
    ? new Date(rawCurrent.endsAt)
    : null
  const currentEndsAtMs = currentEndsAt?.getTime() ?? Number.NaN
  const baseDate = Number.isFinite(currentEndsAtMs) && currentEndsAtMs > paidAt.getTime()
    ? currentEndsAt as Date
    : paidAt
  const nextEndsAt = addDays(baseDate, offer.days).toISOString()

  return {
    level: offer.level,
    period: offer.period,
    status: 'active' as const,
    startsAt: paidAt.toISOString(),
    endsAt: nextEndsAt,
    monthlyPrice: offer.monthlyPrice ?? offer.amount,
    amount: offer.amount || fallbackAmount,
    baseAmount: offer.baseAmount || fallbackAmount,
    discountPercent: offer.discountPercent,
    source: 'yookassa' as const,
  }
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
    offer_kind: offer.kind,
    vk_user_id: String(input.vkUserId),
    subscription_level: offer.level ?? '',
    subscription_period: offer.period ?? '',
    subscription_ends_at: offer.endsAt,
    monthly_price: String(offer.monthlyPrice ?? 0),
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
      description: `МойАгроном — ${offer.title}`,
      confirmation: { type: 'embedded' },
      metadata,
    }),
  }, crypto.randomUUID())

  await upsertBillingPayment(admin, payment)

  const confirmationToken = payment.confirmation?.confirmation_token
  if (!confirmationToken) {
    throw new Error('ЮKassa не вернула confirmation_token для embedded checkout')
  }

  return json({
    paymentId: payment.id,
    confirmationToken,
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

  const paidAt = payment.paid_at ?? payment.created_at ?? new Date().toISOString()
  const offerKind = (metadata.offer_kind ?? 'subscription') as OfferKind
  const offers = buildOffers(new Date(paidAt))
  const offer = offers[metadata.offer_id ?? '']

  if (!billingRow?.applied_at) {
    const { data: existingGarden, error: gardenError } = await admin
      .from('garden_data')
      .select('onboarding, plan')
      .eq('vk_user_id', vkUserId)
      .maybeSingle()
    if (gardenError) throw gardenError

    const onboarding = typeof existingGarden?.onboarding === 'object' && existingGarden?.onboarding
      ? { ...(existingGarden.onboarding as Record<string, unknown>) }
      : {}
    let onboardingPatch: Record<string, unknown> | null = null
    const subscription = offerKind === 'subscription' && offer
      ? buildSubscriptionFromOffer({
          offer,
          currentSubscription: onboarding.subscription,
          paidAtIso: paidAt,
          fallbackAmount: Number(payment.amount?.value ?? 0),
        })
      : null

    if (subscription) {
      onboarding.subscription = subscription
    } else if (offerKind === 'weekly_plan') {
      const nextAccessUntil = extendWeeklyPlanAccess(onboarding.weeklyPlanAccessUntil, paidAt, 7)
      onboarding.weeklyPlanAccessUntil = nextAccessUntil
      onboardingPatch = { weeklyPlanAccessUntil: nextAccessUntil }
    }

    const { error: upsertGardenError } = await admin
      .from('garden_data')
      .upsert({
        vk_user_id: vkUserId,
        onboarding,
        plan: subscription?.level ?? (existingGarden?.plan ?? 'free'),
      }, {
        onConflict: 'vk_user_id',
      })
    if (upsertGardenError) throw upsertGardenError

    const weeklyPlanEndsAt = onboardingPatch?.weeklyPlanAccessUntil ?? metadata.subscription_ends_at
    await admin.from('notifications').insert({
      vk_user_id: vkUserId,
      type: subscription ? 'subscription' : 'weekly_plan_access',
      title: subscription ? 'Подписка активирована' : 'План на 7 дней активирован',
      body: subscription
        ? `${metadata.title ?? 'Подписка'} оплачена и активна до ${new Date(subscription.endsAt).toLocaleDateString('ru-RU')}.`
        : `${metadata.title ?? 'План на 7 дней'} оплачен и доступен до ${new Date(String(weeklyPlanEndsAt)).toLocaleDateString('ru-RU')}.`,
    })

    await admin
      .from('billing_payments')
      .update({ applied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('provider_payment_id', payment.id)

    return {
      subscription,
      onboardingPatch,
      offerId: metadata.offer_id ?? null,
    }
  }

  let subscription = null
  if (offerKind === 'subscription' && offer) {
    const { data: currentGarden } = await admin
      .from('garden_data')
      .select('onboarding')
      .eq('vk_user_id', vkUserId)
      .maybeSingle()

    const currentOnboarding = currentGarden?.onboarding as Record<string, unknown> | null
    const currentSubscription = currentOnboarding?.subscription
    subscription = currentSubscription && typeof currentSubscription === 'object'
      ? currentSubscription
      : buildSubscriptionFromOffer({
          offer,
          currentSubscription: null,
          paidAtIso: paidAt,
          fallbackAmount: Number(payment.amount?.value ?? 0),
        })
  }
  let onboardingPatch: Record<string, unknown> | null = null
  if (offerKind === 'weekly_plan') {
    const { data: currentGarden } = await admin
      .from('garden_data')
      .select('onboarding')
      .eq('vk_user_id', vkUserId)
      .maybeSingle()

    const currentOnboarding = currentGarden?.onboarding as Record<string, unknown> | null
    const currentAccessUntil = typeof currentOnboarding?.weeklyPlanAccessUntil === 'string'
      ? currentOnboarding.weeklyPlanAccessUntil
      : null
    if (currentAccessUntil) {
      onboardingPatch = { weeklyPlanAccessUntil: currentAccessUntil }
    }
  }

  return {
    subscription,
    onboardingPatch,
    offerId: metadata.offer_id ?? null,
  }
}

export { json }
