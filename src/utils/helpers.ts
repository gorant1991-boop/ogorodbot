import type { GardenObject, CropEntry } from './types'
import { CROP_OPERATIONS, DEFAULT_OPS, CROP_CATEGORIES, GROW_OPTIONS } from './constants'

/**
 * Получить список операций для конкретной культуры
 */
export function getOps(id: string) {
  return CROP_OPERATIONS[id] ?? DEFAULT_OPS
}

/**
 * Получить первую операцию (без болезней)
 */
export function getFirstOp(id: string): string {
  return getOps(id).filter(o => o.id !== 'disease')[0]?.label ?? '💧 Полив'
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
export function getCropStage(days: number, totalDays: number): string {
  if (days < 0) return '—'
  const pct = days / totalDays
  if (pct < 0.1) return 'Всходы'
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
export function buildDiaryText(text: string, varietyName?: string | null): string {
  const note = text.trim()
  const variety = varietyName?.trim()

  if (!variety) return note
  return `Сорт: ${variety}\n${note}`
}

/**
 * Разобрать текст записи и достать сорт, если он сохранен в начале заметки
 */
export function parseDiaryText(text: string): { varietyName: string | null; text: string } {
  const match = text.match(/^Сорт:\s*(.+?)\n([\s\S]*)$/)

  if (!match) {
    return { varietyName: null, text: text.trim() }
  }

  return {
    varietyName: match[1].trim() || null,
    text: match[2].trim(),
  }
}

/**
 * Получить риски по погоде для текущих культур
 */
export function getWeatherRisks(
  temp: number,
  humidity: number,
  crops: CropEntry[]
): { text: string; type: 'ok' | 'warn' | 'danger' }[] {
  const risks: { text: string; type: 'ok' | 'warn' | 'danger' }[] = []
  const ids = crops.map(c => c.id)

  if (temp <= 0) risks.push({ text: '❄️ Заморозок! Укройте растения', type: 'danger' })
  else if (temp <= 3) risks.push({ text: '🌡️ Риск заморозка ночью', type: 'warn' })
  else risks.push({ text: '✓ Заморозков нет', type: 'ok' })

  if (temp >= 15 && temp <= 25 && humidity >= 75 && ids.some(id => ['tomato', 'potato'].includes(id)))
    risks.push({ text: '⚠️ Риск фитофторы', type: 'warn' })

  if (temp >= 25 && humidity < 50 && ids.some(id => ['cucumber', 'pepper', 'eggplant'].includes(id)))
    risks.push({ text: '🕷️ Риск паутинного клеща', type: 'warn' })

  if (temp >= 20 && temp <= 25 && humidity >= 70 && ids.some(id => ['cucumber', 'zucchini'].includes(id)))
    risks.push({ text: '🍄 Риск мучнистой росы', type: 'warn' })

  return risks
}
