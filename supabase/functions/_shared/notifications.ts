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
  days?: number
  note?: string
}

interface CropOperationMemoryEntry {
  lastDoneAt: string
  count: number
  varietyName?: string | null
  lastDetail?: string | null
}

interface RainObservation {
  date: string
  status: 'soaked' | 'light' | 'missed'
  updatedAt: string
}

interface CropEntry {
  id: string
  sowMethod?: 'seeds' | 'seedling' | ''
  sowDate?: string
  status: 'planned' | 'planted'
  varieties?: CropVariety[]
  operationMemory?: Record<string, CropOperationMemoryEntry>
}

interface FertilizerItem {
  name: string
  brand?: string
  composition?: string
  note?: string
}

interface OnboardingData {
  city?: string
  displayName?: string
  addressStyle?: 'informal' | 'formal'
  terrain?: string
  cropEntries?: CropEntry[]
  gardenObjects?: { name?: string }[]
  fertilizers?: FertilizerItem[]
  experience?: string
  tools?: string[]
  siteNotes?: string
  rainObservations?: RainObservation[]
  notifMorning?: string
  notifEvening?: string
  notifChannels?: string[]
  notificationEmail?: string
  vkContactUserId?: number
  telegramChatId?: number
  telegramUsername?: string
  timeZone?: string
  subscription?: SubscriptionInfo | null
}

const CROP_NAMES: Record<string, string> = {
  tomato: 'Томат',
  cucumber: 'Огурец',
  pepper: 'Перец',
  eggplant: 'Баклажан',
  zucchini: 'Кабачок',
  pumpkin: 'Тыква',
  cabbage: 'Капуста',
  onion: 'Лук',
  garlic: 'Чеснок',
  corn: 'Кукуруза',
  pea: 'Горох',
  carrot: 'Морковь',
  potato: 'Картофель',
  beet: 'Свёкла',
  radish: 'Редис',
  turnip: 'Репа',
  daikon: 'Дайкон',
  parsnip: 'Пастернак',
  celery_root: 'Сельдерей',
  dill: 'Укроп',
  parsley: 'Петрушка',
  lettuce: 'Салат',
  spinach: 'Шпинат',
  arugula: 'Руккола',
  basil: 'Базилик',
  strawberry: 'Клубника',
  raspberry: 'Малина',
  currant: 'Смородина',
  gooseberry: 'Крыжовник',
  blackberry: 'Ежевика',
  blueberry: 'Голубика',
  honeysuckle: 'Жимолость',
  seabuckthorn: 'Облепиха',
  mint: 'Мята',
  melissa: 'Мелисса',
  tarragon: 'Эстрагон',
  sorrel: 'Щавель',
}
const GENERIC_TOOL_NAMES = new Set(['🪣 Лейка', '🧯 Шланг', 'Лейка', 'Шланг'])

function getCropName(id: string) {
  return CROP_NAMES[id] ?? id
}

const OPERATION_LABELS: Record<string, string> = {
  watering: 'полив',
  feeding: 'подкормка',
  spraying: 'опрыскивание',
  pinching: 'пасынкование',
  pinching_tip: 'прищипка',
  pinching_mustache: 'усы',
  tying: 'подвязка',
  support: 'опора',
  pruning: 'обрезка',
  hilling: 'окучивание',
  weeding: 'прополка',
}

function formatOperationMemorySummary(entry: CropEntry, maxItems = 3) {
  const items = Object.entries(entry.operationMemory ?? {})
    .filter(([, record]) => record?.lastDoneAt)
    .sort((left, right) => parseIsoTimestamp(right[1].lastDoneAt) - parseIsoTimestamp(left[1].lastDoneAt))
    .slice(0, maxItems)

  if (items.length === 0) return ''

  return items
    .map(([operationId, record]) => {
      const label = OPERATION_LABELS[operationId] ?? operationId
      const date = new Date(record.lastDoneAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      const variety = record.varietyName?.trim() ? `, сорт ${record.varietyName.trim()}` : ''
      const detail = record.lastDetail?.trim() ? `, ${record.lastDetail.trim()}` : ''
      return `${label} ${date}${variety}${detail}`
    })
    .join('; ')
}

function formatRainObservationSummary(items: RainObservation[] | undefined, maxItems = 2) {
  const labels: Record<RainObservation['status'], string> = {
    soaked: 'хорошо промочило',
    light: 'только слегка',
    missed: 'дождь обошёл',
  }

  const selected = (items ?? [])
    .slice()
    .sort((left, right) => parseIsoTimestamp(right.updatedAt) - parseIsoTimestamp(left.updatedAt))
    .slice(0, maxItems)

  if (selected.length === 0) return ''

  return selected
    .map(item => `${new Date(item.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}: ${labels[item.status]}`)
    .join('; ')
}

interface GardenRow {
  vk_user_id: number
  plan: 'free' | 'base' | 'pro'
  onboarding: OnboardingData | null
  created_at?: string
  updated_at?: string
}

type AdviceKind = 'morning' | 'evening'

interface AdviceSchedule {
  kind: AdviceKind
  notificationType: 'morning_advice' | 'evening_advice'
  titlePrefix: string
  targetTime: string
  promptLine: string
}

interface NotificationJobRow {
  id: number
  vk_user_id: number
  job_type: AdviceSchedule['notificationType']
  status: 'pending' | 'processing' | 'done' | 'failed'
  attempts: number
  scheduled_for: string
  started_at?: string | null
  completed_at?: string | null
  error?: string | null
  job_key?: string | null
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

function getRange(from: number, pageSize: number) {
  return { from, to: from + pageSize - 1 }
}

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function normalizeDisplayName(value: string | undefined) {
  return value?.replace(/\s+/g, ' ').trim().slice(0, 30) ?? ''
}

const CROP_NAME_KEYWORDS: Record<string, string[]> = {
  tomato: ['томат', 'помидор'],
  cucumber: ['огурц'],
  zucchini: ['кабач'],
  pumpkin: ['тыкв'],
  watermelon: ['арбуз'],
  melon: ['дын'],
  corn: ['кукуруз'],
  eggplant: ['баклаж'],
  carrot: ['морков'],
  beet: ['свекл'],
  turnip: ['реп'],
  daikon: ['дайкон'],
  cabbage: ['капуст'],
  pea: ['горох'],
  dill: ['укроп'],
  spinach: ['шпинат'],
  strawberry: ['клубник', 'землян'],
  gooseberry: ['крыжовник'],
  currant: ['смородин'],
}

interface CropLifecycleSnapshot {
  id: string
  status: CropEntry['status']
  sowMethod: CropEntry['sowMethod']
  sowDate?: string
  daysSince: number | null
  earliestHarvestDays: number | null
}

function parseIsoTimestamp(value: string | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function getDaysSince(value: string | undefined, now = new Date()) {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor((now.getTime() - parsed) / 86400000))
}

function getEarliestHarvestDays(entry: CropEntry) {
  const values = (entry.varieties ?? [])
    .map(variety => Number(variety.days))
    .filter(days => Number.isFinite(days) && days > 0)
  return values.length > 0 ? Math.min(...values) : null
}

function buildCropLifecycleSnapshots(data: OnboardingData, now = new Date()): CropLifecycleSnapshot[] {
  return (data.cropEntries ?? []).map(entry => ({
    id: entry.id,
    status: entry.status,
    sowMethod: entry.sowMethod,
    sowDate: entry.sowDate,
    daysSince: getDaysSince(entry.sowDate, now),
    earliestHarvestDays: getEarliestHarvestDays(entry),
  }))
}

function formatCropLifecycle(snapshot: CropLifecycleSnapshot) {
  const status = snapshot.status === 'planted' ? 'посажена' : 'только в планах'
  const method = snapshot.sowMethod === 'seedling'
    ? 'через рассаду'
    : snapshot.sowMethod === 'seeds'
      ? 'посевом'
      : 'способ не указан'
  const timing = snapshot.daysSince === null
    ? 'дата не указана'
    : `с указанной даты прошло ${snapshot.daysSince} дн.`
  const harvestWindow = snapshot.earliestHarvestDays && snapshot.daysSince !== null
    ? snapshot.daysSince >= snapshot.earliestHarvestDays
      ? 'до ориентировочной спелости срок уже подошёл'
      : `до ориентировочной спелости ещё около ${snapshot.earliestHarvestDays - snapshot.daysSince} дн.`
    : 'точный срок до спелости не указан'
  return `${getCropName(snapshot.id)}: ${status}; ${method}; ${timing}; ${harvestWindow}`
}

function isLikelyNearHarvest(snapshot: CropLifecycleSnapshot) {
  if (snapshot.status !== 'planted' || snapshot.daysSince === null) return false
  if (snapshot.earliestHarvestDays !== null) {
    return snapshot.daysSince >= Math.max(snapshot.earliestHarvestDays - 7, Math.floor(snapshot.earliestHarvestDays * 0.8))
  }
  return snapshot.daysSince >= 45
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е')
}

function adviceMentionsPrematureHarvest(body: string, snapshots: CropLifecycleSnapshot[]) {
  const text = normalizeText(body)
  const hasHarvestLanguage = [
    'пора собирать',
    'готов к сбору',
    'готовы к сбору',
    'сбор урожая',
    'собрать урожай',
    'снимать плоды',
    'соберите',
  ].some(fragment => text.includes(fragment))

  if (!hasHarvestLanguage) return false
  return !snapshots.some(isLikelyNearHarvest)
}

function adviceMentionsAbsentCrops(body: string, data: OnboardingData) {
  const text = normalizeText(body)
  const presentCropIds = new Set((data.cropEntries ?? []).map(entry => entry.id))

  return Object.entries(CROP_NAME_KEYWORDS).some(([cropId, keywords]) => {
    if (presentCropIds.has(cropId)) return false
    return keywords.some(keyword => text.includes(keyword))
  })
}

function shouldFallbackAdvice(body: string, data: OnboardingData) {
  const snapshots = buildCropLifecycleSnapshots(data)
  return adviceMentionsPrematureHarvest(body, snapshots) || adviceMentionsAbsentCrops(body, data)
}

function buildAgronomistContext(data: OnboardingData, plan: string, schedule: AdviceSchedule) {
  const displayName = normalizeDisplayName(data.displayName)
  const terrainLabel = formatTerrainLabel(data.terrain)
  const cropLifecycle = buildCropLifecycleSnapshots(data)
  const cropDetails = (data.cropEntries ?? []).map(entry => {
    const snapshot = cropLifecycle.find(item => item.id === entry.id)
    const base = snapshot ? formatCropLifecycle(snapshot) : getCropName(entry.id)
    const operationSummary = formatOperationMemorySummary(entry)
    return `${base}${operationSummary ? `; последние операции ${operationSummary}` : ''}`
  })

  const objects = (data.gardenObjects ?? []).map(object => object.name?.trim()).filter(Boolean)
  const fertilizers = (data.fertilizers ?? [])
    .map(item => [item.name, item.brand, item.composition, item.note].filter(Boolean).join(' · '))
    .filter(Boolean)
  const tools = (data.tools ?? [])
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => !GENERIC_TOOL_NAMES.has(item))
  const siteNotes = data.siteNotes?.trim() ?? ''
  const rainSummary = formatRainObservationSummary(data.rainObservations)

  return [
    'Контекст огорода пользователя.',
    `Тариф: ${plan}.`,
    displayName ? `Пользователь называет себя: ${displayName}.` : '',
    data.addressStyle === 'formal'
      ? 'Обращайся к пользователю на "вы".'
      : 'Обращайся к пользователю на "ты".',
    data.city ? `Город: ${data.city}.` : '',
    terrainLabel ? `Климат/местность: ${terrainLabel}.` : '',
    objects.length ? `Объекты: ${objects.join(', ')}.` : '',
    cropDetails.length ? `Культуры со стадиями: ${cropDetails.join('; ')}.` : '',
    fertilizers.length ? `Удобрения в наличии: ${fertilizers.join('; ')}.` : '',
    tools.length
      ? `У пользователя под рукой есть: ${tools.join(', ')}.`
      : 'Инструменты и материалы не указаны. Не делай вид, что у пользователя уже точно есть pH-метр, влагомер, мульча или капельный полив.',
    siteNotes ? `Заметки пользователя об участке: ${siteNotes}. Это наблюдения пользователя, а не проверенные факты.` : '',
    rainSummary ? `Последние уточнения пользователя по дождю: ${rainSummary}. Это наблюдение на месте важнее общего прогноза по городу.` : '',
    data.experience ? `Опыт пользователя: ${data.experience}.` : '',
    fertilizers.length
      ? 'Если советуешь подкормку, сначала смотри на список удобрений пользователя и по возможности опирайся именно на них по названию.'
      : 'Если советуешь подкормку, не выдумывай наличие конкретного удобрения у пользователя.',
    tools.length
      ? 'Если совет зависит от инструмента или материала, сначала проверь список пользователя и по возможности опирайся именно на доступные вещи.'
      : 'Если совет зависит от инструмента, подавай его как вариант, а не как уже имеющуюся вещь.',
    'Строгие правила: упоминай только культуры, которые реально есть в списке; не добавляй огурцы, кукурузу, дыни, арбузы или другие отсутствующие культуры.',
    'Если культура только в планах, не говори о ней как о растущей в грядке.',
    'Если после указанной даты прошло мало времени и до ориентировочной спелости ещё далеко, запрещено советовать сбор урожая, зрелые плоды, пасынкование или другие поздние работы.',
    'Если не уверен в стадии культуры, выбирай консервативный совет: осмотр, влага, защита от холода, вредителей и болезней.',
    'Не пересказывай заметки пользователя дословно без пользы. Если опираешься на них, формулируй осторожно: "по вашей заметке", "если это у вас по-прежнему так", "похоже, что..."',
    'Не выдавай предположения за установленный факт. Не утверждай уверенно про состав почвы, уровень грунтовых вод, болезни, нехватки питания или микроклимат, если это только из заметок пользователя.',
    'Пиши только по-русски. Не используй английские слова и технические id вроде culture, crop, tomato, watering, seedling, planned, planted.',
    schedule.promptLine,
  ].filter(Boolean).join(' ')
}

function formatTerrainLabel(value: string | undefined) {
  if (!value) return ''
  if (value === 'city') return 'город'
  if (value === 'dacha_forest') return 'СНТ или дача у леса'
  if (value === 'lowland') return 'низина'
  if (value === 'highland') return 'возвышенность'
  if (value === 'near_water') return 'участок рядом с водой'
  return value
}

function sanitizeAdviceText(text: string) {
  return text
    .replace(/совет для\s*culture/gi, 'совет по культуре')
    .replace(/совет для\s*crop/gi, 'совет по культуре')
    .replace(/\bcultures\b/gi, 'культуры')
    .replace(/\bculture\b/gi, 'культура')
    .replace(/\bcrops\b/gi, 'культуры')
    .replace(/\bcrop\b/gi, 'культура')
    .replace(/\bwatering\b/gi, 'полив')
    .replace(/\bfeeding\b/gi, 'подкормка')
    .replace(/\bweeding\b/gi, 'прополка')
    .replace(/\bdisease\b/gi, 'болезни')
    .replace(/\bseedling\b/gi, 'рассада')
    .replace(/\bseeds\b/gi, 'семена')
    .replace(/\bplanned\b/gi, 'в планах')
    .replace(/\bplanted\b/gi, 'посажена')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function requestAdviceFromAgent(vkUserId: number, data: OnboardingData, plan: string, schedule: AdviceSchedule) {
  const response = await fetch('https://garden-agent.gorant1991.workers.dev/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getEnv('WORKER_API_KEY')}` },
    body: JSON.stringify({
      vk_user_id: vkUserId,
      question: buildAgronomistContext(data, plan, schedule),
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

function buildFallbackAdvice(data: OnboardingData, kind: AdviceKind) {
  const displayName = normalizeDisplayName(data.displayName)
  const greetingTarget = displayName ? `, ${displayName}` : ''
  const city = data.city?.trim() ? `в ${data.city.trim()}` : ''
  const cropCount = data.cropEntries?.length ?? 0
  const firstCrop = data.cropEntries?.[0]?.id ? getCropName(String(data.cropEntries?.[0]?.id)) : ''
  if (kind === 'evening') {
    return [
      `Добрый вечер${greetingTarget || (city ? `, огород ${city}` : '')}.`,
      cropCount > 0
        ? `Перед ночью осмотрите ${firstCrop ? `культуру ${firstCrop}` : 'основные культуры'}: не пересохла ли почва, не появились ли пятна, слизни или следы вредителей.`
        : 'Перед ночью проверьте состояние грядок, укрытий и влажность почвы после дня.',
      'Если ночь обещает быть прохладной, заранее подготовьте укрытие и отложите лишний вечерний полив.',
    ].join(' ')
  }

  return [
    `Доброе утро${greetingTarget || (city ? `, огород ${city}` : '')}.`,
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

function isDueNow(now: Date, timeZone: string, targetTime: string, kind: AdviceKind) {
  const targetMinutes = parseTimeToMinutes(targetTime)
  if (targetMinutes === null) return false
  const local = getLocalDateParts(now, timeZone)
  if (local.minutes < targetMinutes) return false

  const dueUntilMinutes = kind === 'morning'
    ? Math.min(targetMinutes + 180, 12 * 60)
    : Math.min(targetMinutes + 240, 24 * 60)

  return local.minutes < dueUntilMinutes
}

function getScheduleCandidates(onboarding: OnboardingData): AdviceSchedule[] {
  return [
    {
      kind: 'morning',
      notificationType: 'morning_advice',
      titlePrefix: 'Совет на утро',
      targetTime: onboarding.notifMorning?.trim() || '06:00',
      promptLine: 'Сформируй короткий утренний совет для огорода на сегодня: 2-4 предложения, без воды, конкретно что проверить или сделать утром.',
    },
    {
      kind: 'evening',
      notificationType: 'evening_advice',
      titlePrefix: 'Совет на вечер',
      targetTime: onboarding.notifEvening?.trim() || '19:00',
      promptLine: 'Сформируй короткий вечерний совет для огорода на сегодня: 2-4 предложения, без воды, конкретно что проверить или сделать вечером перед ночью.',
    },
  ]
}

function getScheduleByNotificationType(onboarding: OnboardingData, notificationType: AdviceSchedule['notificationType']) {
  return getScheduleCandidates(onboarding).find(schedule => schedule.notificationType === notificationType) ?? null
}

function buildNotificationJobKey(vkUserId: number, schedule: AdviceSchedule, dateKey: string) {
  return `${vkUserId}:${schedule.notificationType}:${dateKey}`
}

async function loadAllGardenRows(admin: ReturnType<typeof getAdminClient>, targetVkUserId?: number) {
  if (targetVkUserId) {
    const { data, error } = await admin
      .from('garden_data')
      .select('vk_user_id, plan, onboarding, created_at, updated_at')
      .eq('vk_user_id', targetVkUserId)
      .limit(1)

    if (error) throw error
    return (data ?? []) as GardenRow[]
  }

  const pageSize = 1000
  const rows: GardenRow[] = []

  for (let from = 0; ; from += pageSize) {
    const { from: rangeFrom, to: rangeTo } = getRange(from, pageSize)
    const { data, error } = await admin
      .from('garden_data')
      .select('vk_user_id, plan, onboarding, created_at, updated_at')
      .neq('vk_user_id', 1)
      .order('vk_user_id', { ascending: true })
      .range(rangeFrom, rangeTo)

    if (error) throw error

    const page = (data ?? []) as GardenRow[]
    rows.push(...page)

    if (page.length < pageSize) break
  }

  return rows
}

async function alreadySentToday(
  admin: ReturnType<typeof getAdminClient>,
  vkUserId: number,
  timeZone: string,
  now: Date,
  schedule: AdviceSchedule,
) {
  const notificationTypes = schedule.kind === 'morning'
    ? ['daily', 'daily_advice', 'morning_advice']
    : [schedule.notificationType]

  const { data } = await admin
    .from('notifications')
    .select('created_at')
    .eq('vk_user_id', vkUserId)
    .in('type', notificationTypes)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.created_at) return false
  return getLocalDateParts(new Date(data.created_at), timeZone).dateKey === getLocalDateParts(now, timeZone).dateKey
}

async function insertDailyAdvice(
  admin: ReturnType<typeof getAdminClient>,
  vkUserId: number,
  schedule: AdviceSchedule,
  title: string,
  body: string,
) {
  const { error } = await admin.from('notifications').insert({
    vk_user_id: vkUserId,
    type: schedule.notificationType,
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

  const keyboard = JSON.stringify({
    inline: true,
    buttons: [[{
      action: {
        type: 'open_link',
        link: 'https://ogorod-ai.ru',
        label: '🌱 Открыть МойАгроном',
      },
    }]],
  })

  const params = new URLSearchParams({
    user_id: String(vkUserId),
    random_id: String(randomId),
    message: `${title}\n\n${body}`,
    keyboard,
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

async function sendTelegramAdvice(chatId: number, title: string, body: string) {
  const token = getOptionalEnv('TELEGRAM_BOT_TOKEN')
  if (!token || !Number.isFinite(chatId) || chatId <= 0) {
    return { sent: false, skipped: true }
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `${title}\n\n${body}`,
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

  return { sent: true, skipped: false }
}

async function processScheduleForRow(
  admin: ReturnType<typeof getAdminClient>,
  row: GardenRow,
  schedule: AdviceSchedule,
  now: Date,
  options?: { skipDueCheck?: boolean; ignoreAlreadySent?: boolean },
) {
  const onboarding = row.onboarding ?? {}
  const timeZone = onboarding.timeZone?.trim() || 'Europe/Moscow'

  if (!options?.skipDueCheck && !isDueNow(now, timeZone, schedule.targetTime, schedule.kind)) {
    return {
      vkUserId: row.vk_user_id,
      kind: schedule.kind,
      status: 'skipped_not_due',
      timeZone,
      targetTime: schedule.targetTime,
    }
  }

  if (!options?.ignoreAlreadySent && await alreadySentToday(admin, row.vk_user_id, timeZone, now, schedule)) {
    return {
      vkUserId: row.vk_user_id,
      kind: schedule.kind,
      status: 'skipped_already_sent',
    }
  }

  const title = `${schedule.titlePrefix} · ${schedule.targetTime}`
  let body = ''

  try {
    body = sanitizeAdviceText(await requestAdviceFromAgent(row.vk_user_id, onboarding, row.plan, schedule))
    if (shouldFallbackAdvice(body, onboarding)) {
      throw new Error('Advice response contradicted crop stage or mentioned absent crops')
    }
  } catch (error) {
    console.error('Advice generation fallback:', error)
    body = sanitizeAdviceText(buildFallbackAdvice(onboarding, schedule.kind))
  }

  await insertDailyAdvice(admin, row.vk_user_id, schedule, title, body)

  const email = normalizeEmail(onboarding.notificationEmail)
  const channels = onboarding.notifChannels ?? []
  const vkContactUserId = Number(onboarding.vkContactUserId ?? 0)
  const vkRecipientId = resolveVkRecipientId(row)
  const telegramChatId = Number(onboarding.telegramChatId ?? 0)
  let vkResult = { sent: false, skipped: true }
  if (channels.includes('vk') && vkContactUserId > 0) {
    try {
      vkResult = await sendVkAdvice(vkRecipientId, title, body)
    } catch (error) {
      console.error('VK send error:', error)
      vkResult = { sent: false, skipped: false }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  let tgResult = { sent: false, skipped: true }
  if (channels.includes('tg') && telegramChatId > 0) {
    try {
      tgResult = await sendTelegramAdvice(telegramChatId, title, body)
    } catch (error) {
      console.error('Telegram send error:', error)
      tgResult = { sent: false, skipped: false }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const emailResult = channels.includes('email') && email && schedule.kind === 'morning'
    ? await sendEmailAdvice(email, title, body)
    : { sent: false, skipped: true }

  return {
    vkUserId: row.vk_user_id,
    kind: schedule.kind,
    vkRecipientId,
    status: 'sent',
    vkSent: vkResult.sent,
    vkSkipped: vkResult.skipped,
    tgSent: tgResult.sent,
    tgSkipped: tgResult.skipped,
    emailSent: emailResult.sent,
    emailSkipped: emailResult.skipped,
  }
}

function resolveVkRecipientId(row: GardenRow) {
  const contactVkUserId = Number(row.onboarding?.vkContactUserId ?? 0)
  if (Number.isFinite(contactVkUserId) && contactVkUserId > 0) return contactVkUserId
  return row.vk_user_id
}

function compareRowsForRecipient(a: GardenRow, b: GardenRow, recipientVkUserId: number) {
  const aOwnRecipient = a.vk_user_id === recipientVkUserId ? 1 : 0
  const bOwnRecipient = b.vk_user_id === recipientVkUserId ? 1 : 0
  if (aOwnRecipient !== bOwnRecipient) return bOwnRecipient - aOwnRecipient

  const aChannels = a.onboarding?.notifChannels ?? []
  const bChannels = b.onboarding?.notifChannels ?? []
  const aHasVk = aChannels.includes('vk') ? 1 : 0
  const bHasVk = bChannels.includes('vk') ? 1 : 0
  if (aHasVk !== bHasVk) return bHasVk - aHasVk

  const aUpdatedAt = parseIsoTimestamp(a.updated_at) || parseIsoTimestamp(a.created_at)
  const bUpdatedAt = parseIsoTimestamp(b.updated_at) || parseIsoTimestamp(b.created_at)
  if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt

  return b.vk_user_id - a.vk_user_id
}

function pickCanonicalRows(rows: GardenRow[]) {
  const rowsByRecipient = new Map<number, GardenRow[]>()

  for (const row of rows) {
    const recipientVkUserId = resolveVkRecipientId(row)
    const bucket = rowsByRecipient.get(recipientVkUserId) ?? []
    bucket.push(row)
    rowsByRecipient.set(recipientVkUserId, bucket)
  }

  const canonicalRows: GardenRow[] = []
  const skippedRows: Array<{ vkUserId: number; recipientVkUserId: number; status: string; canonicalVkUserId: number }> = []

  for (const [recipientVkUserId, group] of rowsByRecipient.entries()) {
    const sorted = [...group].sort((left, right) => compareRowsForRecipient(left, right, recipientVkUserId))
    const canonical = sorted[0]
    canonicalRows.push(canonical)

    for (const skipped of sorted.slice(1)) {
      skippedRows.push({
        vkUserId: skipped.vk_user_id,
        recipientVkUserId,
        status: 'skipped_duplicate_recipient',
        canonicalVkUserId: canonical.vk_user_id,
      })
    }
  }

  return { canonicalRows, skippedRows }
}

async function enqueueDueAdviceJobs(input: {
  nowIso?: string
  targetVkUserId?: number
  adviceKind?: AdviceKind
}) {
  const admin = getAdminClient()
  const now = input.nowIso ? new Date(input.nowIso) : new Date()
  const rawRows = await loadAllGardenRows(admin, input.targetVkUserId)
  const { canonicalRows, skippedRows } = pickCanonicalRows(rawRows)
  const results: Array<Record<string, unknown>> = [...skippedRows]
  let queued = 0

  for (const row of canonicalRows) {
    const onboarding = row.onboarding ?? {}
    const timeZone = onboarding.timeZone?.trim() || 'Europe/Moscow'
    const localDate = getLocalDateParts(now, timeZone)
    const schedules = getScheduleCandidates(onboarding)
      .filter(schedule => !input.adviceKind || schedule.kind === input.adviceKind)

    for (const schedule of schedules) {
      if (!isDueNow(now, timeZone, schedule.targetTime, schedule.kind)) {
        results.push({
          vkUserId: row.vk_user_id,
          kind: schedule.kind,
          status: 'skipped_not_due',
          timeZone,
          targetTime: schedule.targetTime,
        })
        continue
      }

      if (await alreadySentToday(admin, row.vk_user_id, timeZone, now, schedule)) {
        results.push({ vkUserId: row.vk_user_id, kind: schedule.kind, status: 'skipped_already_sent' })
        continue
      }

      const jobKey = buildNotificationJobKey(row.vk_user_id, schedule, localDate.dateKey)
      const { error } = await admin
        .from('notification_jobs')
        .insert({
          vk_user_id: row.vk_user_id,
          job_type: schedule.notificationType,
          scheduled_for: now.toISOString(),
          job_key: jobKey,
        })

      if (error) {
        const message = error.message ?? ''
        if (message.includes('notification_jobs_job_key_key') || message.includes('duplicate key')) {
          results.push({
            vkUserId: row.vk_user_id,
            kind: schedule.kind,
            status: 'skipped_already_queued',
          })
          continue
        }
        throw error
      }

      queued += 1
      results.push({
        vkUserId: row.vk_user_id,
        kind: schedule.kind,
        status: 'queued',
      })
    }
  }

  return json({
    ok: true,
    mode: 'enqueue',
    scanned: canonicalRows.length,
    queued,
    results,
  })
}

async function processNotificationQueue(input: {
  nowIso?: string
  batchSize?: number
}) {
  const admin = getAdminClient()
  const now = input.nowIso ? new Date(input.nowIso) : new Date()
  const batchSize = Math.min(Math.max(Number(input.batchSize ?? 10) || 10, 1), 25)
  const nowIso = now.toISOString()
  const results: Array<Record<string, unknown>> = []
  let processedCount = 0

  const { data, error } = await admin
    .from('notification_jobs')
    .select('id, vk_user_id, job_type, status, attempts, scheduled_for, started_at, completed_at, error, job_key')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .order('id', { ascending: true })
    .limit(batchSize)

  if (error) throw error

  const pendingJobs = (data ?? []) as NotificationJobRow[]

  for (const job of pendingJobs) {
    const { data: claimed, error: claimError } = await admin
      .from('notification_jobs')
      .update({
        status: 'processing',
        attempts: job.attempts + 1,
        started_at: nowIso,
        completed_at: null,
        error: null,
      })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select('id, vk_user_id, job_type, status, attempts, scheduled_for, started_at, completed_at, error, job_key')
      .maybeSingle()

    if (claimError) throw claimError
    if (!claimed) continue
    processedCount += 1

    try {
      const { data: row, error: rowError } = await admin
        .from('garden_data')
        .select('vk_user_id, plan, onboarding, created_at, updated_at')
        .eq('vk_user_id', claimed.vk_user_id)
        .maybeSingle()

      if (rowError) throw rowError
      if (!row) throw new Error(`garden_data not found for vk_user_id=${claimed.vk_user_id}`)

      const gardenRow = row as GardenRow
      const schedule = getScheduleByNotificationType(gardenRow.onboarding ?? {}, claimed.job_type)
      if (!schedule) throw new Error(`Unknown schedule for job type ${claimed.job_type}`)

      const result = await processScheduleForRow(admin, gardenRow, schedule, now, { skipDueCheck: true })

      const { error: doneError } = await admin
        .from('notification_jobs')
        .update({
          status: 'done',
          completed_at: new Date().toISOString(),
          error: typeof result.status === 'string' && result.status !== 'sent' ? result.status : null,
        })
        .eq('id', claimed.id)

      if (doneError) throw doneError
      results.push({ jobId: claimed.id, ...result })
    } catch (jobError) {
      const message = jobError instanceof Error ? jobError.message : 'Notification job failed'
      await admin
        .from('notification_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: message,
        })
        .eq('id', claimed.id)

      results.push({
        jobId: claimed.id,
        vkUserId: claimed.vk_user_id,
        status: 'failed',
        error: message,
      })
    }
  }

  const { count: remaining } = await admin
    .from('notification_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)

  return json({
    ok: true,
    mode: 'worker',
    processed: processedCount,
    remaining: remaining ?? 0,
    results,
  })
}

// ─── МАСШТАБИРОВАНИЕ: переход на очередь ──────────────────
// Текущая архитектура: Edge Function обходит всех юзеров в цикле.
// При 10K+ юзеров вызов будет таймаутить (150s лимит).
//
// Миграция на очереди (включается флагом USE_QUEUE=true):
// 1. pg_cron создаёт задачи в notification_jobs (1 строка = 1 юзер)
// 2. Воркер обрабатывает по одной задаче за вызов
// 3. Cloudflare Queue или pg_cron запускает N воркеров параллельно
//
// Таблица notification_jobs уже создана — см. миграцию 202604010004
// ─────────────────────────────────────────────────────────

export async function generateMorningAdvice(input: {
  nowIso?: string
  targetVkUserId?: number
  force?: boolean
  adviceKind?: AdviceKind
  mode?: 'direct' | 'enqueue' | 'worker'
  batchSize?: number
}) {
  if (input.mode === 'enqueue') {
    return await enqueueDueAdviceJobs(input)
  }

  if (input.mode === 'worker') {
    return await processNotificationQueue(input)
  }

  const admin = getAdminClient()
  const now = input.nowIso ? new Date(input.nowIso) : new Date()
  const force = Boolean(input.force)
  const rawRows = await loadAllGardenRows(admin, input.targetVkUserId)
  const { canonicalRows, skippedRows } = pickCanonicalRows(rawRows)
  const results: Array<Record<string, unknown>> = [...skippedRows]

  for (const row of canonicalRows) {
    const schedules = getScheduleCandidates(row.onboarding ?? {})
      .filter(schedule => !input.adviceKind || schedule.kind === input.adviceKind)

    for (const schedule of schedules) {
      results.push(await processScheduleForRow(admin, row, schedule, now, {
        skipDueCheck: force,
        ignoreAlreadySent: force,
      }))
    }
  }

  return json({
    ok: true,
    mode: 'direct',
    processed: canonicalRows.length,
    results,
  })
}

export { handleCors, json }
