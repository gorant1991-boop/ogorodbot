// ============= TypeScript интерфейсы для OgorodBot =============

// ─── Типы ──────────────────────────────────────────────────────────
export type Screen = 'onboarding' | 'main' | 'chat' | 'owner-analytics'
export type Tab = 'main' | 'plants' | 'moon' | 'diary' | 'profile'
export type Plan = 'free' | 'base' | 'pro'
export type BillingPeriod = 'monthly' | 'seasonal'
export type CheckoutOfferKind = 'subscription' | 'weekly_plan'
export type AddressStyle = 'informal' | 'formal'
export type UITextScale = 'normal' | 'large'

export interface SubscriptionInfo {
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

export interface GardenObject {
  uid: string
  type: string
  name: string
  length: string
  width: string
  height: string
  ventilationReminders: boolean
  ventilationMorning: string
  ventilationEvening: string
  soilType: string
  substrate: string
  drainageIssue: boolean
}

export interface CropVariety {
  name: string
  days?: number
  desc?: string
  note?: string
}

export interface FertilizerItem {
  id: string
  name: string
  brand?: string
  composition?: string
  note?: string
}

export type DiaryEntryKind = 'done' | 'observation' | 'plan'
export type RainObservationStatus = 'soaked' | 'light' | 'missed'

export interface RainObservation {
  date: string
  status: RainObservationStatus
  updatedAt: string
}

export interface CropOperationMemoryEntry {
  lastDoneAt: string
  count: number
  lastNote?: string
  varietyName?: string | null
  lastEntryId?: number
  lastDetail?: string | null
}

export type CropOperationMemory = Record<string, CropOperationMemoryEntry>

export interface CropEntry {
  id: string
  location: string
  sowDate: string
  emergenceDate?: string
  sowMethod: 'seeds' | 'seedling' | ''
  maturityDays?: number
  status: 'planned' | 'planted'
  priority: 'main' | 'extra'
  notifs: string[]
  varieties: CropVariety[]
  plantYear?: number
  operationMemory?: CropOperationMemory
}

export interface OnboardingData {
  city: string
  displayName: string
  addressStyle: AddressStyle
  uiTextScale: UITextScale
  helpHintsEnabled: boolean
  introSeen?: boolean
  seenHints: string[]
  terrain: string
  gardenObjects: GardenObject[]
  cropEntries: CropEntry[]
  fertilizers: FertilizerItem[]
  notificationEmail: string
  vkContactUserId?: number
  telegramChatId?: number
  telegramUsername?: string
  referralCode?: string
  referralAppliedCode?: string
  referralInvitesAccepted?: number
  referralRewardsGranted?: number
  promoPostShares?: number
  lastPromoShareAt?: string | null
  experience: string
  tools: string[]
  siteNotes?: string
  rainObservations?: RainObservation[]
  timeZone: string
  notifMorning: string
  notifEvening: string
  notifLevel: string
  notifChannels: string[]
  interestingFact: string
  interestingFactDateKey?: string | null
  scienceFact: string
  scienceFactDateKey?: string | null
  weeklyPlanAccessUntil?: string | null
  weeklyPlanText?: string
  weeklyPlanGeneratedAt?: string | null
  subscription?: SubscriptionInfo | null
}

export interface Season {
  id: number
  vk_user_id: number
  year: number
  snapshot: OnboardingData
  summary: string | null
  created_at: string
}

export interface DiaryEntry {
  id: number
  vk_user_id: number
  crop_id: string | null
  operation: string | null
  text: string
  created_at: string
}

export interface WeatherData {
  temp: number
  feels: number
  desc: string
  icon: string
  humidity: number
  wind: number
  loading: boolean
  error?: string
}

export interface MoonData {
  phase: string
  illumination: number
  age: number
  loading: boolean
  daysUntilFullMoon: number
}
