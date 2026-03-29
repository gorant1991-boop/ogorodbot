import type { BillingPeriod, OnboardingData, Plan, SubscriptionInfo } from '../types'

export const OBJECT_LIMITS: Record<Plan, number> = { free: 1, base: 3, pro: 999 }
export const MONTHLY_PRICES: Record<Plan, number> = { free: 0, base: 150, pro: 300 }
export const SEASON_DISCOUNT_PERCENT = 20

type PaidPlan = Exclude<Plan, 'free'>

interface PlanSummaryCard {
  id: Plan
  icon: string
  name: string
  price: string
  badge?: string
  features: string[]
}

export interface SubscriptionOffer {
  id: string
  level: PaidPlan
  period: BillingPeriod
  icon: string
  title: string
  subtitle: string
  priceLabel: string
  amount: number
  baseAmount: number
  savings: number
  discountPercent: number
  endsAt: string
  days: number
  features: string[]
}

const PAID_PLAN_FEATURES: Record<PaidPlan, string[]> = {
  base: [
    'До 15 культур',
    'До 3 объектов',
    'Все уведомления',
    'Прогноз на 7 дней',
    'Лунный календарь',
    'Чат без лимита',
  ],
  pro: [
    'Без лимитов по культурам',
    'Без лимитов по объектам',
    'План работ на 7 дней',
    'Свои сорта',
    'Совместимость культур',
    'История сезонов и экспорт',
  ],
}

export const PLAN_SUMMARY_CARDS: PlanSummaryCard[] = [
  { 
    id: 'free' as Plan, 
    icon: '🌱', 
    name: 'Бесплатно', 
    price: '0 ₽',
    features: ['До 10 культур', '1 объект', 'Критичные уведомления', '3 вопроса агроному/день'] 
  },
  { 
    id: 'base' as Plan, 
    icon: '🌿', 
    name: 'Базовая', 
    price: 'от 150 ₽',
    badge: 'Месяц и сезон',
    features: ['До 15 культур', 'До 3 объектов', 'Все уведомления', 'Прогноз на 7 дней', 'Лунный календарь', 'Чат без лимита'] 
  },
  { 
    id: 'pro' as Plan, 
    icon: '🏆', 
    name: 'Про', 
    price: 'от 300 ₽',
    badge: 'Сезон -20%',
    features: ['Без ограничений', 'Свои сорта', 'План работ на 7 дней', 'Совместимость культур', 'История сезонов', 'Экспорт дневника'] 
  },
]

export const PLANS = PLAN_SUMMARY_CARDS

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

export function formatPrice(amount: number): string {
  return `${amount.toLocaleString('ru-RU')} ₽`
}

export function formatDateLabel(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function buildSubscriptionOffers(now = new Date()): SubscriptionOffer[] {
  const seasonEnd = getSeasonEndDate(now)

  return (['base', 'pro'] as PaidPlan[]).flatMap(level => {
    const monthlyPrice = MONTHLY_PRICES[level]
    const monthlyEndsAt = addDays(now, 30)
    const seasonDays = diffDaysInclusive(now, seasonEnd)
    const seasonBaseAmount = Math.ceil((monthlyPrice / 30) * seasonDays)
    const seasonAmount = Math.ceil(seasonBaseAmount * (1 - SEASON_DISCOUNT_PERCENT / 100))

    return [
      {
        id: `${level}-monthly`,
        level,
        period: 'monthly' as BillingPeriod,
        icon: level === 'base' ? '🌿' : '🏆',
        title: level === 'base' ? 'Базовая на месяц' : 'Про на месяц',
        subtitle: '30 дней доступа',
        priceLabel: `${formatPrice(monthlyPrice)} / месяц`,
        amount: monthlyPrice,
        baseAmount: monthlyPrice,
        savings: 0,
        discountPercent: 0,
        endsAt: monthlyEndsAt.toISOString(),
        days: 30,
        features: PAID_PLAN_FEATURES[level],
      },
      {
        id: `${level}-seasonal`,
        level,
        period: 'seasonal' as BillingPeriod,
        icon: level === 'base' ? '🍃' : '🌾',
        title: level === 'base' ? 'Базовая на сезон' : 'Про на сезон',
        subtitle: `До ${formatDateLabel(seasonEnd.toISOString())}`,
        priceLabel: `${formatPrice(seasonAmount)} за сезон`,
        amount: seasonAmount,
        baseAmount: seasonBaseAmount,
        savings: seasonBaseAmount - seasonAmount,
        discountPercent: SEASON_DISCOUNT_PERCENT,
        endsAt: seasonEnd.toISOString(),
        days: seasonDays,
        features: PAID_PLAN_FEATURES[level],
      },
    ]
  })
}

export function createSubscriptionFromOffer(offer: SubscriptionOffer, now = new Date()): SubscriptionInfo {
  return {
    level: offer.level,
    period: offer.period,
    status: 'active',
    startsAt: now.toISOString(),
    endsAt: offer.endsAt,
    monthlyPrice: MONTHLY_PRICES[offer.level],
    amount: offer.amount,
    baseAmount: offer.baseAmount,
    discountPercent: offer.discountPercent,
    source: 'manual',
  }
}

export function isSubscriptionExpired(subscription: SubscriptionInfo | null | undefined, now = new Date()): boolean {
  if (!subscription) return false
  return new Date(subscription.endsAt).getTime() < now.getTime()
}

export function getEffectivePlan(storedPlan: Plan, subscription: SubscriptionInfo | null | undefined, now = new Date()): Plan {
  if (!subscription) return storedPlan
  if (isSubscriptionExpired(subscription, now)) return 'free'
  return subscription.level
}

export function getSubscriptionStatusLabel(subscription: SubscriptionInfo | null | undefined): string {
  if (!subscription) return 'Бесплатный доступ'
  if (subscription.period === 'seasonal') {
    return `${subscription.level === 'base' ? 'Базовая' : 'Про'} · сезон`
  }
  return `${subscription.level === 'base' ? 'Базовая' : 'Про'} · месяц`
}

export interface SubscriptionNotice {
  title: string
  body: string
  tone: 'warning' | 'expired'
}

export function getSubscriptionNotice(subscription: SubscriptionInfo | null | undefined, now = new Date()): SubscriptionNotice | null {
  if (!subscription) return null

  const end = new Date(subscription.endsAt)
  const diffMs = end.getTime() - now.getTime()
  if (Number.isNaN(end.getTime())) return null

  if (diffMs < 0) {
    return {
      title: 'Подписка закончилась',
      body: `Платный доступ завершился ${formatDateLabel(subscription.endsAt)}. Тариф уже переведён на бесплатный, продлите доступ, чтобы вернуть все функции.`,
      tone: 'expired',
    }
  }

  const daysLeft = Math.ceil(diffMs / 86400000)
  if (daysLeft <= 3) {
    return {
      title: daysLeft <= 1 ? 'Подписка заканчивается сегодня' : `До конца подписки ${daysLeft} дня`,
      body: `Доступ активен до ${formatDateLabel(subscription.endsAt)}. Продлите заранее, чтобы не потерять расширенные функции и лимиты.`,
      tone: 'warning',
    }
  }

  return null
}

export const empty: OnboardingData = {
  city: '', 
  terrain: '', 
  gardenObjects: [], 
  cropEntries: [],
  fertilizers: [],
  notificationEmail: '',
  vkContactUserId: 0,
  referralCode: '',
  referralAppliedCode: '',
  referralInvitesAccepted: 0,
  referralRewardsGranted: 0,
  promoPostShares: 0,
  lastPromoShareAt: null,
  experience: '', 
  tools: [], 
  timeZone: '',
  notifMorning: '06:00', 
  notifEvening: '19:00',
  notifLevel: 'standard', 
  notifChannels: ['vk'],
  subscription: null,
}
