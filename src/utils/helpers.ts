import type { CropEntry, DiaryEntry, DiaryEntryKind, GardenObject, OnboardingData, RainObservation, RainObservationStatus } from './types'
import { CROP_OPERATIONS, DEFAULT_OPS, CROP_CATEGORIES, GROW_OPTIONS } from './constants'

type CropCase = 'nominative' | 'genitive' | 'dative' | 'accusative' | 'instrumental' | 'prepositional'

const CROP_CASE_FORMS: Record<string, Record<CropCase, string>> = {
  tomato: { nominative: 'томат', genitive: 'томата', dative: 'томату', accusative: 'томат', instrumental: 'томатом', prepositional: 'томате' },
  cucumber: { nominative: 'огурец', genitive: 'огурца', dative: 'огурцу', accusative: 'огурец', instrumental: 'огурцом', prepositional: 'огурце' },
  pepper: { nominative: 'перец', genitive: 'перца', dative: 'перцу', accusative: 'перец', instrumental: 'перцем', prepositional: 'перце' },
  eggplant: { nominative: 'баклажан', genitive: 'баклажана', dative: 'баклажану', accusative: 'баклажан', instrumental: 'баклажаном', prepositional: 'баклажане' },
  zucchini: { nominative: 'кабачок', genitive: 'кабачка', dative: 'кабачку', accusative: 'кабачок', instrumental: 'кабачком', prepositional: 'кабачке' },
  pumpkin: { nominative: 'тыква', genitive: 'тыквы', dative: 'тыкве', accusative: 'тыкву', instrumental: 'тыквой', prepositional: 'тыкве' },
  cabbage: { nominative: 'капуста', genitive: 'капусты', dative: 'капусте', accusative: 'капусту', instrumental: 'капустой', prepositional: 'капусте' },
  onion: { nominative: 'лук', genitive: 'лука', dative: 'луку', accusative: 'лук', instrumental: 'луком', prepositional: 'луке' },
  garlic: { nominative: 'чеснок', genitive: 'чеснока', dative: 'чесноку', accusative: 'чеснок', instrumental: 'чесноком', prepositional: 'чесноке' },
  corn: { nominative: 'кукуруза', genitive: 'кукурузы', dative: 'кукурузе', accusative: 'кукурузу', instrumental: 'кукурузой', prepositional: 'кукурузе' },
  pea: { nominative: 'горох', genitive: 'гороха', dative: 'гороху', accusative: 'горох', instrumental: 'горохом', prepositional: 'горохе' },
  carrot: { nominative: 'морковь', genitive: 'моркови', dative: 'моркови', accusative: 'морковь', instrumental: 'морковью', prepositional: 'моркови' },
  potato: { nominative: 'картофель', genitive: 'картофеля', dative: 'картофелю', accusative: 'картофель', instrumental: 'картофелем', prepositional: 'картофеле' },
  beet: { nominative: 'свекла', genitive: 'свеклы', dative: 'свекле', accusative: 'свеклу', instrumental: 'свеклой', prepositional: 'свекле' },
  radish: { nominative: 'редис', genitive: 'редиса', dative: 'редису', accusative: 'редис', instrumental: 'редисом', prepositional: 'редисе' },
  turnip: { nominative: 'репа', genitive: 'репы', dative: 'репе', accusative: 'репу', instrumental: 'репой', prepositional: 'репе' },
  daikon: { nominative: 'дайкон', genitive: 'дайкона', dative: 'дайкону', accusative: 'дайкон', instrumental: 'дайконом', prepositional: 'дайконе' },
  parsnip: { nominative: 'пастернак', genitive: 'пастернака', dative: 'пастернаку', accusative: 'пастернак', instrumental: 'пастернаком', prepositional: 'пастернаке' },
  celery_root: { nominative: 'сельдерей', genitive: 'сельдерея', dative: 'сельдерею', accusative: 'сельдерей', instrumental: 'сельдереем', prepositional: 'сельдерее' },
  dill: { nominative: 'укроп', genitive: 'укропа', dative: 'укропу', accusative: 'укроп', instrumental: 'укропом', prepositional: 'укропе' },
  parsley: { nominative: 'петрушка', genitive: 'петрушки', dative: 'петрушке', accusative: 'петрушку', instrumental: 'петрушкой', prepositional: 'петрушке' },
  lettuce: { nominative: 'салат', genitive: 'салата', dative: 'салату', accusative: 'салат', instrumental: 'салатом', prepositional: 'салате' },
  spinach: { nominative: 'шпинат', genitive: 'шпината', dative: 'шпинату', accusative: 'шпинат', instrumental: 'шпинатом', prepositional: 'шпинате' },
  arugula: { nominative: 'руккола', genitive: 'рукколы', dative: 'рукколе', accusative: 'рукколу', instrumental: 'рукколой', prepositional: 'рукколе' },
  basil: { nominative: 'базилик', genitive: 'базилика', dative: 'базилику', accusative: 'базилик', instrumental: 'базиликом', prepositional: 'базилике' },
  strawberry: { nominative: 'клубника', genitive: 'клубники', dative: 'клубнике', accusative: 'клубнику', instrumental: 'клубникой', prepositional: 'клубнике' },
  raspberry: { nominative: 'малина', genitive: 'малины', dative: 'малине', accusative: 'малину', instrumental: 'малиной', prepositional: 'малине' },
  currant: { nominative: 'смородина', genitive: 'смородины', dative: 'смородине', accusative: 'смородину', instrumental: 'смородиной', prepositional: 'смородине' },
  gooseberry: { nominative: 'крыжовник', genitive: 'крыжовника', dative: 'крыжовнику', accusative: 'крыжовник', instrumental: 'крыжовником', prepositional: 'крыжовнике' },
  blackberry: { nominative: 'ежевика', genitive: 'ежевики', dative: 'ежевике', accusative: 'ежевику', instrumental: 'ежевикой', prepositional: 'ежевике' },
  blueberry: { nominative: 'голубика', genitive: 'голубики', dative: 'голубике', accusative: 'голубику', instrumental: 'голубикой', prepositional: 'голубике' },
  honeysuckle: { nominative: 'жимолость', genitive: 'жимолости', dative: 'жимолости', accusative: 'жимолость', instrumental: 'жимолостью', prepositional: 'жимолости' },
  seabuckthorn: { nominative: 'облепиха', genitive: 'облепихи', dative: 'облепихе', accusative: 'облепиху', instrumental: 'облепихой', prepositional: 'облепихе' },
  mint: { nominative: 'мята', genitive: 'мяты', dative: 'мяте', accusative: 'мяту', instrumental: 'мятой', prepositional: 'мяте' },
  melissa: { nominative: 'мелисса', genitive: 'мелиссы', dative: 'мелиссе', accusative: 'мелиссу', instrumental: 'мелиссой', prepositional: 'мелиссе' },
  tarragon: { nominative: 'эстрагон', genitive: 'эстрагона', dative: 'эстрагону', accusative: 'эстрагон', instrumental: 'эстрагоном', prepositional: 'эстрагоне' },
  sorrel: { nominative: 'щавель', genitive: 'щавеля', dative: 'щавелю', accusative: 'щавель', instrumental: 'щавелем', prepositional: 'щавеле' },
}

/**
 * Получить список операций для конкретной культуры
 */
export function getOps(id: string) {
  const baseOps = CROP_OPERATIONS[id] ?? DEFAULT_OPS
  if (baseOps.some(op => op.id === 'spraying')) return baseOps
  const diseaseIndex = baseOps.findIndex(op => op.id === 'disease')
  const sprayingOp = { id: 'spraying', label: '🫧 Опрыскивание' }
  if (diseaseIndex === -1) return [...baseOps, sprayingOp]
  return [...baseOps.slice(0, diseaseIndex), sprayingOp, ...baseOps.slice(diseaseIndex)]
}

export function getPrimaryOp(id: string) {
  return getOps(id).find(o => o.id !== 'disease') ?? getOps(id)[0] ?? { id: 'watering', label: '💧 Полив' }
}

export function getCropName(id: string): string {
  return CROP_CATEGORIES.flatMap(category => category.crops).find(crop => crop.id === id)?.name ?? id
}

export function getCropNameCase(id: string, grammaticalCase: CropCase): string {
  return CROP_CASE_FORMS[id]?.[grammaticalCase] ?? getCropName(id).toLowerCase()
}

export function getOperationLabel(cropId: string, operationId: string | null | undefined): string {
  if (!operationId) return ''
  return getOps(cropId).find(item => item.id === operationId)?.label ?? operationId
}

const OPERATION_COOLDOWN_DAYS: Record<string, number> = {
  watering: 1,
  feeding: 10,
  spraying: 5,
  pinching: 7,
  pinching_tip: 7,
  pinching_mustache: 7,
  tying: 21,
  support: 30,
  pruning: 30,
  hilling: 10,
  weeding: 4,
}

const OPERATION_MEMORY_MAX_AGE_DAYS = 150

const DIARY_ENTRY_KIND_LABELS: Record<DiaryEntryKind, string> = {
  done: 'Сделано',
  observation: 'Наблюдение',
  plan: 'План',
}

const RAIN_OBSERVATION_LABELS: Record<RainObservationStatus, string> = {
  soaked: 'хорошо промочило',
  light: 'только слегка',
  missed: 'дождь обошёл',
}

const OPERATION_DETAIL_OPTIONS: Record<string, string[]> = {
  watering: ['слегка пролил', 'хорошо промочил'],
  feeding: ['под корень', 'по листу', 'мягкая стартовая'],
  spraying: ['профилактика', 'от болезней', 'от вредителей'],
  support: ['частично', 'полностью'],
  tying: ['частично', 'полностью'],
  pinching: ['частично', 'основные побеги'],
  pinching_tip: ['частично', 'основные побеги'],
  pinching_mustache: ['частично', 'основные усы'],
  pruning: ['санитарно', 'основная обрезка'],
  hilling: ['первое окучивание', 'повторное'],
  weeding: ['частично', 'полностью'],
}

function getDateLike(value?: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value ?? Date.now())
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function getDateKey(value?: string | Date) {
  return getDateLike(value).toISOString().slice(0, 10)
}

function isOperationMemoryFresh(lastDoneAt: string, atDate?: string | Date) {
  const targetDate = getDateLike(atDate)
  const operationDate = getDateLike(lastDoneAt)
  const diffDays = (targetDate.getTime() - operationDate.getTime()) / 86400000
  return diffDays >= 0 && diffDays <= OPERATION_MEMORY_MAX_AGE_DAYS
}

export function getOperationCooldownDays(operationId: string): number {
  return OPERATION_COOLDOWN_DAYS[operationId] ?? 3
}

export function getOperationMemoryEntry(entry: CropEntry, operationId: string) {
  const memory = entry.operationMemory ?? {}
  return memory[operationId] ?? null
}

export function wasOperationDoneRecently(entry: CropEntry, operationId: string, atDate?: string | Date, cooldownDays = getOperationCooldownDays(operationId)) {
  const record = getOperationMemoryEntry(entry, operationId)
  if (!record?.lastDoneAt) return false
  if (!isOperationMemoryFresh(record.lastDoneAt, atDate)) return false
  const targetDate = getDateLike(atDate)
  const lastDoneAt = getDateLike(record.lastDoneAt)
  const diffDays = (targetDate.getTime() - lastDoneAt.getTime()) / 86400000
  return diffDays >= 0 && diffDays < cooldownDays
}

export function formatOperationMemorySummary(entry: CropEntry, maxItems = 3) {
  const memoryEntries = Object.entries(entry.operationMemory ?? {})
    .filter(([, record]) => record?.lastDoneAt && isOperationMemoryFresh(record.lastDoneAt))
    .sort((left, right) => new Date(right[1].lastDoneAt).getTime() - new Date(left[1].lastDoneAt).getTime())
    .slice(0, maxItems)

  if (memoryEntries.length === 0) return ''

  return memoryEntries
    .map(([operationId, record]) => {
      const dateLabel = getDateLike(record.lastDoneAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      const varietyLabel = record.varietyName?.trim() ? `, сорт ${record.varietyName.trim()}` : ''
      const detailLabel = record.lastDetail?.trim() ? `, ${record.lastDetail.trim()}` : ''
      return `${getOperationLabel(entry.id, operationId)} ${dateLabel}${varietyLabel}${detailLabel}`
    })
    .join('; ')
}

export function getDiaryEntryKindLabel(kind: DiaryEntryKind) {
  return DIARY_ENTRY_KIND_LABELS[kind]
}

export function getDiaryEntryKindOptions() {
  return (Object.entries(DIARY_ENTRY_KIND_LABELS) as Array<[DiaryEntryKind, string]>)
    .map(([value, label]) => ({ value, label }))
}

export function getOperationDetailOptions(operationId: string) {
  return (OPERATION_DETAIL_OPTIONS[operationId] ?? []).map(value => ({ value, label: value }))
}

export function getRainObservationLabel(status: RainObservationStatus) {
  return RAIN_OBSERVATION_LABELS[status]
}

export function upsertRainObservation(observations: RainObservation[] | undefined, date: string | Date, status: RainObservationStatus) {
  const dateKey = getDateKey(date)
  const nextEntry: RainObservation = {
    date: dateKey,
    status,
    updatedAt: new Date().toISOString(),
  }

  const rest = (observations ?? []).filter(item => getDateKey(item.date) !== dateKey)
  return [nextEntry, ...rest]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 10)
}

export function getRainObservation(observations: RainObservation[] | undefined, date: string | Date) {
  const dateKey = getDateKey(date)
  return (observations ?? []).find(item => getDateKey(item.date) === dateKey) ?? null
}

export function formatRainObservationSummary(observations: RainObservation[] | undefined, maxItems = 2) {
  const items = (observations ?? [])
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, maxItems)

  if (items.length === 0) return ''

  return items
    .map(item => `${getDateLike(item.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}: ${getRainObservationLabel(item.status)}`)
    .join('; ')
}

export function getObjectBaseName(type: string): string {
  if (type === 'open') return 'Грядка'
  if (type === 'greenhouse') return 'Теплица'
  if (type === 'hotbed') return 'Парник'
  return GROW_OPTIONS.find(option => option.id === type)?.title ?? 'Объект'
}

export function buildObjectName(type: string, index: number): string {
  const base = getObjectBaseName(type)
  return index <= 1 ? base : `${base} ${index}`
}

export function getObjectNamePlaceholder(type: string): string {
  if (type === 'open') return 'Например: грядка у теплицы'
  if (type === 'greenhouse') return 'Например: теплица за домом'
  if (type === 'hotbed') return 'Например: парник у забора'
  if (type === 'berry') return 'Например: клубника у забора'
  if (type === 'flowerbed') return 'Например: клумба у входа'
  if (type === 'pots') return 'Например: балкон, южная сторона'
  return 'Например: объект у дома'
}

/**
 * Получить первую операцию (без болезней)
 */
export function getFirstOp(id: string): string {
  return getPrimaryOp(id).label
}

/**
 * Проверка, является ли культура многолетней
 */
export const isPerennial = (id: string) => CROP_CATEGORIES[3].crops.some(c => c.id === id)

/**
 * Количество дней с момента даты
 */
export function daysSince(dateStr: string): number {
  if (!dateStr) return -1
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000))
}

/**
 * Определить стадию развития культуры по дням
 */
export function getCropStage(days: number, totalDays: number, options: { afterEmergence?: boolean } = {}): string {
  if (days < 0) return '—'
  if (!options.afterEmergence && days === 0) return 'Всходы'
  const pct = days / totalDays
  if (!options.afterEmergence && pct < 0.1) return 'Всходы'
  if (pct < 0.35) return 'Рост'
  if (pct < 0.65) return 'Цветение'
  if (pct < 0.9) return 'Налив'
  return '🎉 Сбор!'
}

/**
 * Генерировать уникальный ID
 */
export function makeUid(): string {
  return Math.random().toString(36).slice(2, 9)
}

/**
 * Создать объект GardenObject с параметрами по умолчанию
 */
export function makeObject(type: string, name?: string): GardenObject {
  const opt = GROW_OPTIONS.find(o => o.id === type)!
  return {
    uid: makeUid(),
    type,
    name: name || opt.title,
    length: '',
    width: '',
    height: '',
    ventilationReminders: true,
    ventilationMorning: '06:00',
    ventilationEvening: '19:00',
    soilType: '',
    substrate: '',
    drainageIssue: false,
  }
}

/**
 * Сформировать текст записи в дневник с пометкой сорта без изменения схемы БД
 */
export function buildDiaryText(
  text: string,
  varietyOrOptions?: string | {
    varietyName?: string | null
    entryKind?: DiaryEntryKind
    operationDetail?: string | null
  },
): string {
  const note = text.trim()
  const options = typeof varietyOrOptions === 'string'
    ? { varietyName: varietyOrOptions }
    : (varietyOrOptions ?? {})
  const variety = options.varietyName?.trim()
  const entryKind = options.entryKind
  const operationDetail = options.operationDetail?.trim()
  const lines: string[] = []

  if (variety) lines.push(`Сорт: ${variety}`)
  if (entryKind) lines.push(`Тип записи: ${entryKind}`)
  if (operationDetail) lines.push(`Детали: ${operationDetail}`)
  lines.push(note)

  return lines.join('\n')
}

/**
 * Разобрать текст записи и достать сорт, если он сохранен в начале заметки
 */
export function parseDiaryText(text: string): {
  varietyName: string | null
  entryKind: DiaryEntryKind | null
  operationDetail: string | null
  text: string
} {
  const lines = text.split('\n')
  let index = 0
  let varietyName: string | null = null
  let entryKind: DiaryEntryKind | null = null
  let operationDetail: string | null = null

  while (index < lines.length) {
    const line = lines[index].trim()
    if (!line) {
      index += 1
      continue
    }
    if (line.startsWith('Сорт:')) {
      varietyName = line.slice('Сорт:'.length).trim() || null
      index += 1
      continue
    }
    if (line.startsWith('Тип записи:')) {
      const value = line.slice('Тип записи:'.length).trim() as DiaryEntryKind
      entryKind = ['done', 'observation', 'plan'].includes(value) ? value : null
      index += 1
      continue
    }
    if (line.startsWith('Детали:')) {
      operationDetail = line.slice('Детали:'.length).trim() || null
      index += 1
      continue
    }
    break
  }

  return {
    varietyName,
    entryKind,
    operationDetail,
    text: lines.slice(index).join('\n').trim(),
  }
}

export function resolveDiaryEntryKind(entry: DiaryEntry) {
  const parsed = parseDiaryText(entry.text)
  return parsed.entryKind ?? (entry.operation ? 'done' : 'observation')
}

export function isDiaryEntryCompletedOperation(entry: DiaryEntry) {
  return Boolean(entry.operation) && resolveDiaryEntryKind(entry) === 'done'
}

export function applyDiaryEntryToOnboardingData(data: OnboardingData, entry: DiaryEntry): OnboardingData {
  if (!entry.crop_id || !entry.operation) return data

  const operationId = entry.operation
  const parsed = parseDiaryText(entry.text)
  const entryKind = parsed.entryKind ?? 'done'
  if (entryKind !== 'done') return data
  const createdAt = entry.created_at || new Date().toISOString()

  return {
    ...data,
    cropEntries: data.cropEntries.map(cropEntry => {
      if (cropEntry.id !== entry.crop_id) return cropEntry

      const currentMemory = cropEntry.operationMemory ?? {}
      const previousRecord = currentMemory[operationId] ?? null
      const nextCount = previousRecord?.lastEntryId === entry.id
        ? previousRecord.count
        : (previousRecord?.count ?? 0) + 1

      return {
        ...cropEntry,
        operationMemory: {
          ...currentMemory,
          [operationId]: {
            lastDoneAt: createdAt,
            count: nextCount,
            lastNote: parsed.text.trim().slice(0, 180),
            varietyName: parsed.varietyName,
            lastEntryId: entry.id,
            lastDetail: parsed.operationDetail,
          },
        },
      }
    }),
  }
}

export function rebuildOperationMemoryFromDiary(data: OnboardingData, entries: DiaryEntry[]) {
  const resetData: OnboardingData = {
    ...data,
    cropEntries: data.cropEntries.map(entry => ({ ...entry, operationMemory: {} })),
  }

  return [...entries]
    .filter(entry => entry.crop_id && entry.operation)
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .reduce((acc, entry) => applyDiaryEntryToOnboardingData(acc, entry), resetData)
}

/**
 * Получить риски по погоде для текущих культур
 */
export function getWeatherRisks(
  temp: number,
  humidity: number,
  crops: CropEntry[],
  gardenObjects: GardenObject[] = []
): { text: string; type: 'ok' | 'warn' | 'danger' }[] {
  const risks: { text: string; type: 'ok' | 'warn' | 'danger' }[] = []
  const ids = crops.map(c => c.id)
  const enclosedObjects = gardenObjects.filter(
    object => (object.type === 'greenhouse' || object.type === 'hotbed') && object.ventilationReminders
  )

  if (temp <= 0) risks.push({ text: '❄️ Заморозок! Укройте растения', type: 'danger' })
  else if (temp <= 3) risks.push({ text: '🌡️ Риск заморозка ночью', type: 'warn' })
  else risks.push({ text: '✓ Заморозков нет', type: 'ok' })

  if (temp <= 3 && enclosedObjects.length > 0) {
    const enclosedLabel = enclosedObjects.length === 1 ? enclosedObjects[0].name : 'парники и теплицы'
    risks.push({
      text: `🏠 Ночью похолодание: закройте ${enclosedLabel}`,
      type: temp <= 0 ? 'danger' : 'warn',
    })
  }

  if (temp >= 15 && temp <= 25 && humidity >= 75 && ids.some(id => ['tomato', 'potato'].includes(id)))
    risks.push({ text: '⚠️ Риск фитофторы', type: 'warn' })

  if (temp >= 25 && humidity < 50 && ids.some(id => ['cucumber', 'pepper', 'eggplant'].includes(id)))
    risks.push({ text: '🕷️ Риск паутинного клеща', type: 'warn' })

  if (temp >= 20 && temp <= 25 && humidity >= 70 && ids.some(id => ['cucumber', 'zucchini'].includes(id)))
    risks.push({ text: '🍄 Риск мучнистой росы', type: 'warn' })

  return risks
}
