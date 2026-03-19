import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function loadUserData(vkUserId: number) {
  const { data, error } = await supabase
    .from('garden_data')
    .select('*')
    .eq('vk_user_id', vkUserId)
    .single()
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
    .select('title, body, created_at')
    .eq('vk_user_id', vkUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
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
    .single()
  if (error) return null
  return data
}
