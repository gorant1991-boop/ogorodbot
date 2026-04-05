import { useEffect, useState } from 'react'
import type { OnboardingData } from '../utils/types'
import { getCropName, getCropNameCase, getOps, getPrimaryOp, getRainObservation, isPerennial, wasOperationDoneRecently } from '../utils/constants'
import { loadWeeklyPlan, type WeeklyPlanDay, type WeeklyPlanTask } from '../supabase'
import { fetchForecastSnapshot, type WeatherForecastDay } from './useForecast'

export type WeekTask = WeeklyPlanTask
export type WeekDay = WeeklyPlanDay

function normalizeText(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

function buildDataSignature(data: OnboardingData) {
  return JSON.stringify({
    city: data.city,
    siteNotes: data.siteNotes ?? '',
    fertilizers: (data.fertilizers ?? []).map(item => ({
      id: item.id,
      name: item.name,
      brand: item.brand ?? '',
      composition: item.composition ?? '',
      note: item.note ?? '',
    })),
    objects: data.gardenObjects.map(object => ({ uid: object.uid, type: object.type, name: object.name })),
    crops: data.cropEntries.map(entry => ({
      id: entry.id,
      status: entry.status,
      location: entry.location,
      sowDate: entry.sowDate,
      emergenceDate: entry.emergenceDate ?? '',
      varieties: entry.varieties.map(variety => ({ name: variety.name, note: variety.note ?? '' })),
      operationMemory: entry.operationMemory ?? {},
    })),
    rainObservations: data.rainObservations ?? [],
  })
}

function sanitizeTaskText(text: string) {
  return text
    .replace(/\bculture\b/gi, 'культура')
    .replace(/\bcrop\b/gi, 'культура')
    .replace(/\bwatering\b/gi, 'полив')
    .replace(/\bfeeding\b/gi, 'подкормка')
    .replace(/\bweeding\b/gi, 'прополка')
    .replace(/\bdisease\b/gi, 'болезни')
    .replace(/\s+/g, ' ')
    .trim()
}

function ensureSentence(value: string) {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function inferSiteSignals(siteNotes: string) {
  const normalized = normalizeText(siteNotes)
  return {
    driesFast: normalized.includes('пересых') || normalized.includes('сохнет'),
    retainsMoisture: normalized.includes('пруд') || normalized.includes('вода рядом') || normalized.includes('грунтов') || normalized.includes('сыр') || normalized.includes('мокр') || normalized.includes('вода стоит'),
    highGroundwater: normalized.includes('грунтов'),
    windy: normalized.includes('ветер') || normalized.includes('продува'),
    shade: normalized.includes('тень') || normalized.includes('затен'),
  }
}

function formatLocationPhrase(locationName: string | undefined) {
  const trimmed = locationName?.trim()
  return trimmed ? `в зоне «${trimmed}»` : 'на участке'
}

function getDateLike(value?: string) {
  const parsed = value ? new Date(value) : new Date()
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function getDateKey(value?: string) {
  return getDateLike(value).toISOString().slice(0, 10)
}

function isSpringWindow(value?: string) {
  const month = getDateLike(value).getMonth()
  return month >= 2 && month <= 4
}

function buildForecastMap(days: WeatherForecastDay[]) {
  return new Map(days.map(day => [getDateKey(day.date), day]))
}

function resolveOperationIdFromAction(entryId: string | undefined, action: string) {
  if (!entryId) return ''

  const normalizedAction = normalizeText(action)
  const operationKeywords: Array<[string, string[]]> = [
    ['watering', ['полив']],
    ['feeding', ['подкорм']],
    ['spraying', ['опрыск']],
    ['pinching_mustache', ['усы']],
    ['pinching_tip', ['прищип']],
    ['pinching', ['пасынк', 'прищип']],
    ['tying', ['подвяз']],
    ['support', ['опор']],
    ['pruning', ['обрез']],
    ['hilling', ['окуч']],
    ['weeding', ['пропол']],
  ]
  const byKeyword = operationKeywords.find(([, keywords]) => keywords.some(keyword => normalizedAction.includes(keyword)))

  if (byKeyword && getOps(entryId).some(op => op.id === byKeyword[0])) {
    return byKeyword[0]
  }

  return getOps(entryId).find(op => normalizedAction.includes(normalizeText(op.label)))?.id ?? ''
}

function buildWeatherHint(data: OnboardingData, action: string, dateIso: string | undefined, forecastByDate: Map<string, WeatherForecastDay>, reason = '') {
  const forecast = forecastByDate.get(getDateKey(dateIso))
  const normalizedAction = normalizeText(action)
  const normalizedReason = normalizeText(reason)
  if (normalizedReason.includes('дожд') || normalizedReason.includes('осад')) return ''
  const rainObservation = getRainObservation(data.rainObservations, dateIso ?? '')
  const hasForecastRain = Boolean(forecast?.rainExpected)

  if (!rainObservation && !hasForecastRain) return ''

  if (rainObservation?.status === 'missed') {
    if (normalizedAction.includes('полив')) {
      return 'По вашей отметке дождь участок обошёл, так что полив имеет смысл оценивать по реальной сухости, а не по общему прогнозу.'
    }
    return ''
  }

  if (rainObservation?.status === 'soaked') {
    if (normalizedAction.includes('полив')) {
      return 'По вашей отметке дождь хорошо промочил участок, поэтому полив сейчас обычно лучше отложить и проверить почву позже.'
    }
    if (normalizedAction.includes('опрыск')) {
      return 'По вашей отметке участок хорошо намок, поэтому опрыскивание лучше перенести на сухое окно.'
    }
    return ''
  }

  if (rainObservation?.status === 'light') {
    if (normalizedAction.includes('полив')) {
      return 'По вашей отметке дождь прошёл только слегка, поэтому перед поливом стоит проверить, промокла ли почва глубже верхнего слоя.'
    }
    if (normalizedAction.includes('опрыск')) {
      return 'По вашей отметке дождь был слабый, но опрыскивание всё равно лучше делать в устойчиво сухое окно.'
    }
    return ''
  }

  if (!forecast?.rainExpected) return ''

  const precipitationLabel = forecast.precipitationMm >= 2 ? 'ожидаются осадки' : 'возможен дождь'

  if (normalizedAction.includes('полив')) {
    return `По прогнозу на этот день ${precipitationLabel}, поэтому полив лучше делать только после проверки фактической влажности у корней.`
  }

  if (normalizedAction.includes('опрыск')) {
    return `По прогнозу на этот день ${precipitationLabel}, поэтому опрыскивание лучше сдвинуть на сухое окно, чтобы раствор не смыло.`
  }

  return ''
}

function buildOperationHistoryHint(data: OnboardingData, action: string, entryId?: string, dateIso?: string) {
  if (!entryId) return ''

  const entry = data.cropEntries.find(item => item.id === entryId)
  if (!entry) return ''

  const operationId = resolveOperationIdFromAction(entryId, action)
  if (!operationId || !wasOperationDoneRecently(entry, operationId, dateIso)) return ''

  const record = entry.operationMemory?.[operationId]
  if (!record?.lastDoneAt) return ''

  const dateLabel = getDateLike(record.lastDoneAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

  const detailLabel = record.lastDetail?.trim() ? ` Последний раз вы отмечали: ${record.lastDetail.trim()}.` : ''

  if (operationId === 'feeding') {
    return `Подкормка у вас уже отмечалась ${dateLabel}, поэтому повторять её сейчас стоит только если есть отдельная причина по стадии или состоянию растения.${detailLabel}`
  }

  if (operationId === 'watering') {
    return `Полив по этой культуре уже отмечался ${dateLabel}, поэтому ориентируйтесь на реальную влажность, а не на повтор по привычке.${detailLabel}`
  }

  if (operationId === 'spraying') {
    return `Опрыскивание по этой культуре уже отмечалось ${dateLabel}, поэтому повторять его подряд стоит только по понятной задаче и в подходящую погоду.${detailLabel}`
  }

  return `${sanitizeTaskText(action)} по этой культуре уже отмечалось ${dateLabel}, поэтому сначала проверьте, действительно ли пора повторять эту операцию.${detailLabel}`
}

function getCropKeywordHints(entryId: string) {
  const cropLabel = normalizeText(getCropName(entryId))
  const keywords = [entryId, cropLabel]

  if (entryId === 'strawberry') keywords.push('клубник', 'ягод')
  if (['raspberry', 'currant', 'gooseberry', 'blackberry', 'blueberry', 'honeysuckle', 'seabuckthorn'].includes(entryId)) {
    keywords.push('ягод', 'куст')
  }
  if (entryId === 'blueberry') keywords.push('голубик', 'кисл')
  if (entryId === 'currant') keywords.push('смородин')
  if (entryId === 'gooseberry') keywords.push('крыжовник')
  if (entryId === 'raspberry') keywords.push('малин')

  return Array.from(new Set(keywords.filter(Boolean)))
}

function pickRelevantFertilizers(data: OnboardingData, entryId?: string) {
  const fertilizers = Array.isArray(data.fertilizers) ? data.fertilizers : []
  if (fertilizers.length === 0) return []

  const keywords = entryId ? getCropKeywordHints(entryId) : []
  const scored = fertilizers.map((item, index) => {
    const haystack = normalizeText([item.name, item.brand, item.composition, item.note].filter(Boolean).join(' '))
    const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 2 : 0), 0)
      + (haystack.includes('универс') ? 1 : 0)
      + (haystack.includes('компост') || haystack.includes('биогумус') ? 1 : 0)
    return {
      label: [item.brand?.trim(), item.name.trim()].filter(Boolean).join(' '),
      score,
      index,
    }
  })

  scored.sort((left, right) => right.score - left.score || left.index - right.index)

  return scored
    .map(item => item.label)
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 2)
}

function buildFertilizerHint(data: OnboardingData, action: string, entryId?: string, reason = '') {
  if (!normalizeText(action).includes('подкорм')) return ''

  const fertilizers = pickRelevantFertilizers(data, entryId)
  const normalizedReason = normalizeText(reason)
  if (fertilizers.some(item => normalizedReason.includes(normalizeText(item)))) return ''

  if (fertilizers.length === 0) {
    return 'Подкормку здесь лучше выбирать под текущую стадию культуры, а не вносить первое попавшееся удобрение наугад.'
  }

  if (fertilizers.length === 1) {
    return `Из того, что у вас уже есть, сначала проверьте по инструкции ${fertilizers[0]}.`
  }

  return `Из ваших удобрений сюда сначала смотрите ${fertilizers[0]} или ${fertilizers[1]} по инструкции и стадии роста.`
}

function buildSeasonalPerennialHint(action: string, entryId?: string, dateIso?: string) {
  if (!entryId || !isPerennial(entryId) || !isSpringWindow(dateIso)) return ''

  const normalizedAction = normalizeText(action)

  if (entryId === 'strawberry' && normalizedAction.includes('подкорм')) {
    return 'Весной клубнику обычно сначала очищают от сухих листьев и старой мульчи, а затем дают мягкую стартовую подкормку.'
  }

  if (entryId === 'strawberry' && normalizedAction.includes('осмотр')) {
    return 'Весной у клубники полезно отдельно проверить сухие листья, сердечки кустов и состояние старой мульчи.'
  }

  if (normalizedAction.includes('обрез')) {
    return 'Весной у ягодных многолетников в первую очередь убирают сухие, слабые и подмёрзшие побеги.'
  }

  if (normalizedAction.includes('подвяз')) {
    return 'Весной побеги удобнее развести и подвязать заранее, пока куст не загустел и не пошёл активный рост.'
  }

  if (normalizedAction.includes('подкорм')) {
    return 'Весной ягодные кусты обычно подкармливают после санитарной обрезки, когда почва уже оттаяла и пошёл рост.'
  }

  if (normalizedAction.includes('осмотр')) {
    return 'Весной у ягодных многолетников полезно отдельно смотреть, что перезимовало слабо и что лучше убрать до активного роста.'
  }

  return ''
}

function buildSiteHint(data: OnboardingData, action: string, entryId?: string, reason = '') {
  const entry = entryId ? data.cropEntries.find(item => item.id === entryId) : null
  const location = entry ? data.gardenObjects.find(object => object.uid === entry.location) : null
  const siteSignals = inferSiteSignals(data.siteNotes ?? '')
  const normalizedAction = normalizeText(action)
  const normalizedReason = normalizeText(reason)
  const reasonAlreadyCoversMoisture = normalizedReason.includes('влаж') || normalizedReason.includes('сыр') || normalizedReason.includes('полив')
  const soilType = normalizeText(location?.soilType ?? '')
  const objectType = location?.type ?? ''
  const hasDrainageIssue = Boolean(location?.drainageIssue)
  const driesFast = siteSignals.driesFast || soilType === 'sandy'
  const retainsMoisture = siteSignals.retainsMoisture || hasDrainageIssue || soilType === 'clay' || soilType === 'peat'
  const localMoistureRisk = hasDrainageIssue || soilType === 'clay' || soilType === 'peat' || objectType === 'greenhouse' || objectType === 'hotbed'
  const isWateringTask = normalizedAction.includes('полив')
  const isInspectionTask = normalizedAction.includes('осмотр') || normalizedReason.includes('проверь')

  if (retainsMoisture && isWateringTask && !reasonAlreadyCoversMoisture) {
    return siteSignals.highGroundwater
      ? 'По вашей заметке грунтовые воды здесь могут быть высокими. Это не обязательно плохо само по себе, но перед поливом лучше сначала проверить фактическую влажность у корней.'
      : 'По вашей заметке влага здесь может уходить медленнее. Поэтому перед поливом лучше сначала проверить фактическую влажность, а не поливать по привычке.'
  }

  if (driesFast && isWateringTask && !reasonAlreadyCoversMoisture) {
    return 'По вашей заметке верхний слой здесь может пересыхать быстрее обычного, поэтому ориентируйтесь на реальную влажность почвы, а не только на вид поверхности.'
  }

  if (localMoistureRisk && isInspectionTask && !reasonAlreadyCoversMoisture) {
    return objectType === 'greenhouse' || objectType === 'hotbed'
      ? 'Если ваша заметка по сырости всё ещё актуальна, после полива или прохладной ночи стоит проверить, не сыреет ли корневая зона и воздух в укрытии.'
      : 'Если ваша заметка по сырости всё ещё актуальна, после дождя или полива полезно смотреть, не застаивается ли влага у корней.'
  }

  if (siteSignals.windy && !normalizedReason.includes('вет')) {
    return 'Если участок по-прежнему продувается ветром, верхний слой почвы и листья могут пересыхать быстрее, чем кажется.'
  }

  if (siteSignals.shade && isInspectionTask) {
    return 'Если здесь по-прежнему много тени, после прохладных ночей и полива листья могут просыхать медленнее обычного.'
  }

  return ''
}

function polishReasonText(reason: string) {
  if (!reason.trim()) return ''

  return ensureSentence(
    sanitizeTaskText(reason)
      .replace(/^объект:\s*/i, 'Место: ')
      .replace(/^пометка:\s*/i, 'Важно: ')
      .replace(/\bосновной уход\b/gi, 'Базовый уход')
      .replace(/\bтекущий ритм ухода\b/gi, 'нынешний режим ухода')
      .replace(/\s+([.,!?])/g, '$1')
  )
}

function resolveCropLabel(taskCrop: string, data: OnboardingData) {
  const normalizedTaskCrop = normalizeText(taskCrop)
  const entry = data.cropEntries.find(item =>
    normalizeText(item.id) === normalizedTaskCrop
    || normalizeText(getCropName(item.id)) === normalizedTaskCrop
  )
  return entry ? getCropName(entry.id) : taskCrop
}

function enrichReason(taskCrop: string, action: string, reason: string, data: OnboardingData, forecastByDate: Map<string, WeatherForecastDay>, dateIso?: string) {
  const normalizedTaskCrop = normalizeText(taskCrop)
  const entry = data.cropEntries.find(item =>
    normalizeText(item.id) === normalizedTaskCrop
    || normalizeText(getCropName(item.id)) === normalizedTaskCrop
  )
  const location = entry ? data.gardenObjects.find(object => object.uid === entry.location) : null
  const locationHint = location?.name?.trim() ? `Место: ${location.name}.` : ''
  const siteHint = buildSiteHint(data, action, entry?.id, reason)
  const fertilizerHint = buildFertilizerHint(data, action, entry?.id, reason)
  const perennialHint = buildSeasonalPerennialHint(action, entry?.id, dateIso)
  const weatherHint = buildWeatherHint(data, action, dateIso, forecastByDate, reason)
  const operationHint = buildOperationHistoryHint(data, action, entry?.id, dateIso)

  if (reason.trim()) {
    return `${polishReasonText(reason)}${locationHint ? ` ${locationHint}` : ''}${siteHint ? ` ${siteHint}` : ''}${weatherHint ? ` ${weatherHint}` : ''}${operationHint ? ` ${operationHint}` : ''}${fertilizerHint ? ` ${fertilizerHint}` : ''}${perennialHint ? ` ${perennialHint}` : ''}`.trim()
  }

  if (locationHint || siteHint || weatherHint || operationHint || fertilizerHint || perennialHint) {
    return `${locationHint}${siteHint ? ` ${siteHint}` : ''}${weatherHint ? ` ${weatherHint}` : ''}${operationHint ? ` ${operationHint}` : ''}${fertilizerHint ? ` ${fertilizerHint}` : ''}${perennialHint ? ` ${perennialHint}` : ''}`.trim()
  }

  return 'Под ваш огород и текущий режим ухода.'
}

function normalizeWeeklyPlan(plan: WeekDay[] | undefined, data: OnboardingData, forecastByDate: Map<string, WeatherForecastDay>) {
  return (plan ?? []).map(day => ({
    date: day.date,
    tasks: (day.tasks ?? []).slice(0, 5).map(task => ({
      crop: resolveCropLabel(sanitizeTaskText(task.crop), data),
      action: sanitizeTaskText(task.action),
      reason: enrichReason(task.crop, task.action, task.reason, data, forecastByDate, day.date),
    })),
  }))
}

function pickFallbackAction(data: OnboardingData, entryId: string, index: number, dateIso: string | undefined, forecastByDate: Map<string, WeatherForecastDay>) {
  const entry = data.cropEntries.find(item => item.id === entryId)
  const location = entry ? data.gardenObjects.find(object => object.uid === entry.location) : null
  const siteSignals = inferSiteSignals(data.siteNotes ?? '')
  const soilType = normalizeText(location?.soilType ?? '')
  const retainsMoisture = siteSignals.retainsMoisture || Boolean(location?.drainageIssue) || soilType === 'clay' || soilType === 'peat'
  const forecast = forecastByDate.get(getDateKey(dateIso))
  const rainObservation = getRainObservation(data.rainObservations, dateIso ?? '')
  const operations = getOps(entryId).filter(op => !['disease', 'spraying'].includes(op.id))
  const perennial = isPerennial(entryId)
  const springNow = isSpringWindow(dateIso)

  if (operations.length === 0) return sanitizeTaskText(getPrimaryOp(entryId).label)

  const shouldAvoidWatering = rainObservation?.status === 'soaked'
    || (forecast?.rainExpected && rainObservation?.status !== 'missed')
  const weatherSafeOps = operations.filter(op => !(shouldAvoidWatering && op.id === 'watering'))
  const recentSafeOps = weatherSafeOps.filter(op => !entry || !wasOperationDoneRecently(entry, op.id, dateIso))
  const candidateOps = recentSafeOps.length > 0
    ? recentSafeOps
    : weatherSafeOps.length > 0
      ? weatherSafeOps
      : operations

  if (perennial && springNow) {
    const priorityIds = entryId === 'strawberry'
      ? ['feeding', 'weeding', 'watering', 'pinching_mustache']
      : ['pruning', 'feeding', 'tying', 'watering']
    const seasonalOps = priorityIds
      .map(priorityId => candidateOps.find(op => op.id === priorityId))
      .filter((op): op is NonNullable<typeof op> => Boolean(op))
    if (seasonalOps.length > 0) {
      return sanitizeTaskText(seasonalOps[index % seasonalOps.length].label)
    }
  }

  if (retainsMoisture) {
    const nonWatering = candidateOps.find(op => op.id !== 'watering')
    if (nonWatering) return sanitizeTaskText(nonWatering.label)
  }

  const nextIndex = candidateOps.length > 1 ? index % candidateOps.length : 0
  return sanitizeTaskText(candidateOps[nextIndex].label)
}

function buildFallbackWeeklyPlan(data: OnboardingData, forecastDays: WeatherForecastDay[]): WeekDay[] {
  const planted = data.cropEntries.filter(entry => entry.status === 'planted')
  if (planted.length === 0) return []
  const forecastByDate = buildForecastMap(forecastDays)

  const today = new Date()
  const days: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() + index)
    return {
      date: date.toISOString(),
      tasks: [],
    }
  })

  planted.forEach((entry, index) => {
    const cropName = getCropName(entry.id)
    const cropInstrumental = getCropNameCase(entry.id, 'instrumental')
    const cropGenitive = getCropNameCase(entry.id, 'genitive')
    const primaryDay = days[index % 4]
    const inspectionDay = days[(index + 2) % 7]
    const primaryOp = pickFallbackAction(data, entry.id, index, primaryDay.date, forecastByDate)
    const location = data.gardenObjects.find(object => object.uid === entry.location)
    const locationText = formatLocationPhrase(location?.name)
    const varietyNote = entry.varieties.find(variety => variety.note?.trim())?.note?.trim() ?? ''
    const siteHint = buildSiteHint(data, primaryOp, entry.id)
    const inspectionHint = buildSiteHint(data, 'Осмотр', entry.id)
    const fertilizerHint = buildFertilizerHint(data, primaryOp, entry.id)
    const perennialHint = buildSeasonalPerennialHint(primaryOp, entry.id, primaryDay.date)
    const inspectionPerennialHint = buildSeasonalPerennialHint('Осмотр', entry.id, inspectionDay.date)
    const weatherHint = buildWeatherHint(data, primaryOp, primaryDay.date, forecastByDate)
    const operationHint = buildOperationHistoryHint(data, primaryOp, entry.id, primaryDay.date)

    primaryDay.tasks.push({
      crop: cropName,
      action: primaryOp,
      reason: [
        `Базовый уход за ${cropInstrumental} ${locationText}.`,
        varietyNote ? `Важно: ${ensureSentence(varietyNote)}` : '',
        siteHint,
        weatherHint,
        operationHint,
        fertilizerHint,
        perennialHint,
      ].filter(Boolean).join(' '),
    })

    inspectionDay.tasks.push({
      crop: cropName,
      action: 'Осмотр',
      reason: [
        `Проверьте листья, стебли и верхний слой почвы у ${cropGenitive} ${locationText}.`,
        inspectionHint,
        inspectionPerennialHint,
      ].filter(Boolean).join(' '),
    })
  })

  return days
}

export async function fetchWeeklyPlanSnapshot(
  vkUserId: number,
  data: OnboardingData,
): Promise<WeekDay[]> {
  const forecastDays = data.city.trim()
    ? await fetchForecastSnapshot(data.city).catch(() => [] as WeatherForecastDay[])
    : []
  const forecastByDate = buildForecastMap(forecastDays)

  try {
    const response = await loadWeeklyPlan(vkUserId, data)
    const normalizedPlan = normalizeWeeklyPlan(response.plan, data, forecastByDate)
    return normalizedPlan.some(day => day.tasks.length > 0)
      ? normalizedPlan
      : buildFallbackWeeklyPlan(data, forecastDays)
  } catch {
    return buildFallbackWeeklyPlan(data, forecastDays)
  }
}

/**
 * Hook для получения еженедельного AI плана
 */
export function useWeeklyPlan(
  vkUserId: number,
  enabled: boolean,
  data: OnboardingData,
): {
  days: WeekDay[]
  loading: boolean
  error: boolean
} {
  const requestKey = enabled && vkUserId ? `${vkUserId}:${buildDataSignature(data)}` : ''
  const [state, setState] = useState<{
    days: WeekDay[]
    error: boolean
    key: string
  }>({ days: [], error: false, key: '' })

  useEffect(() => {
    if (!requestKey) return

    let cancelled = false

    Promise.all([
      loadWeeklyPlan(vkUserId, data),
      data.city.trim() ? fetchForecastSnapshot(data.city).catch(() => [] as WeatherForecastDay[]) : Promise.resolve([] as WeatherForecastDay[]),
    ])
      .then(([response, forecastDays]: [{ plan?: WeekDay[] }, WeatherForecastDay[]]) => {
        if (cancelled) return
        const forecastByDate = buildForecastMap(forecastDays)
        const normalizedPlan = normalizeWeeklyPlan(response.plan, data, forecastByDate)
        const nextDays = normalizedPlan.some(day => day.tasks.length > 0)
          ? normalizedPlan
          : buildFallbackWeeklyPlan(data, forecastDays)
        setState({ days: nextDays, error: false, key: requestKey })
      })
      .catch(() => {
        if (cancelled) return
        const fallback = async () => {
          const forecastDays = data.city.trim()
            ? await fetchForecastSnapshot(data.city).catch(() => [] as WeatherForecastDay[])
            : []
          if (cancelled) return
          setState({ days: buildFallbackWeeklyPlan(data, forecastDays), error: false, key: requestKey })
        }
        void fallback()
      })

    return () => {
      cancelled = true
    }
  }, [requestKey, vkUserId, data])

  if (!requestKey) {
    return { days: [], loading: false, error: false }
  }

  return {
    days: state.key === requestKey ? state.days : [],
    loading: state.key !== requestKey,
    error: state.key === requestKey ? state.error : false,
  }
}
