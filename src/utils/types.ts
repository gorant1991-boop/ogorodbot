// ============= TypeScript интерфейсы для OgorodBot =============

// ─── Типы ──────────────────────────────────────────────────────────
export type Screen = 'onboarding' | 'main' | 'chat'
export type Tab = 'main' | 'plants' | 'moon' | 'diary' | 'profile'
export type Plan = 'free' | 'base' | 'pro'
export type BillingPeriod = 'monthly' | 'seasonal'

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
  source: 'manual' | 'vk_pay'
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
}

export interface CropEntry {
  id: string
  location: string
  sowDate: string
  sowMethod: 'seeds' | 'seedling' | ''
  status: 'planned' | 'planted'
  priority: 'main' | 'extra'
  notifs: string[]
  varieties: CropVariety[]
  plantYear?: number
}

export interface OnboardingData {
  city: string
  terrain: string
  gardenObjects: GardenObject[]
  cropEntries: CropEntry[]
  experience: string
  tools: string[]
  notifMorning: string
  notifEvening: string
  notifLevel: string
  notifChannels: string[]
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

export interface ForecastDay {
  date: string
  temp: number
  humidity: number
  description: string
  icon: string
}

export interface WeekTask {
  date: string
  day: string
  tasks: string[]
}

export interface WeekDay {
  date: string
  day: string
  temp: number
  humidity: number
}

