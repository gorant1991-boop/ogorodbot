import { useState, useEffect, useRef } from 'react'
import './App.css'
import { loadUserData, saveUserData, loadLastNotification, loadDiary, addDiaryEntry, loadSeasons, saveSeasonSnapshot, loadSubscriptionNotif } from './supabase'
import * as SunCalc from 'suncalc'

// ─── Типы ──────────────────────────────────────────────────────────
type Screen = 'onboarding' | 'main' | 'chat'
type Tab = 'main' | 'plants' | 'moon' | 'profile'
type Plan = 'free' | 'base' | 'pro'

interface GardenObject {
  uid: string      // уникальный ID (uuid-like)
  type: string     // 'open' | 'greenhouse' | 'hotbed'
  name: string     // своё название: "Большая теплица", "Парник у забора"
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

interface CropVariety {
  name: string
  days?: number
}

interface CropEntry {
  id: string
  location: string  // uid объекта GardenObject
  sowDate: string
  sowMethod: 'seeds' | 'seedling' | ''
  status: 'planned' | 'planted'
  priority: 'main' | 'extra'
  notifs: string[]
  varieties: CropVariety[]
  plantYear?: number
}

interface OnboardingData {
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
}

interface Season {
  id: number
  vk_user_id: number
  year: number
  snapshot: OnboardingData
  summary: string | null
  created_at: string
}

interface DiaryEntry {
  id: number
  vk_user_id: number
  crop_id: string | null
  operation: string | null
  text: string
  created_at: string
}

// ─── Базовое время созревания ───────────────────────────────────────
const CROP_DAYS: Record<string, number> = {
  tomato: 90, cucumber: 55, carrot: 70, potato: 80, onion: 90,
  garlic: 90, cabbage: 80, pepper: 100, eggplant: 100, zucchini: 55,
  beet: 70, dill: 40, parsley: 60, lettuce: 45, radish: 30,
  turnip: 60, daikon: 60, parsnip: 90, celery_root: 120,
  pumpkin: 100, corn: 80, pea: 60, spinach: 40, arugula: 35, basil: 50,
  strawberry: 60, raspberry: 365, currant: 365, gooseberry: 365,
  blackberry: 365, blueberry: 365, honeysuckle: 365, seabuckthorn: 365,
  mint: 60, melissa: 60, tarragon: 60, sorrel: 60,
}

// ─── Категории культур ─────────────────────────────────────────────
const CROP_CATEGORIES = [
  {
    id: 'vegetables',
    label: '🥦 Овощи',
    crops: [
      { id: 'tomato',    icon: '🍅', name: 'Томат' },
      { id: 'cucumber',  icon: '🥒', name: 'Огурец' },
      { id: 'pepper',    icon: '🫑', name: 'Перец' },
      { id: 'eggplant',  icon: '🍆', name: 'Баклажан' },
      { id: 'zucchini',  icon: '🥗', name: 'Кабачок' },
      { id: 'pumpkin',   icon: '🎃', name: 'Тыква' },
      { id: 'cabbage',   icon: '🥬', name: 'Капуста' },
      { id: 'onion',     icon: '🧅', name: 'Лук' },
      { id: 'garlic',    icon: '🧄', name: 'Чеснок' },
      { id: 'corn',      icon: '🌽', name: 'Кукуруза' },
      { id: 'pea',       icon: '🟢', name: 'Горох' },
    ]
  },
  {
    id: 'roots',
    label: '🥕 Корнеплоды',
    crops: [
      { id: 'carrot',      icon: '🥕', name: 'Морковь' },
      { id: 'potato',      icon: '🥔', name: 'Картофель' },
      { id: 'beet',        icon: '🔴', name: 'Свёкла' },
      { id: 'radish',      icon: '🌰', name: 'Редис' },
      { id: 'turnip',      icon: '🟣', name: 'Репа' },
      { id: 'daikon',      icon: '⚪', name: 'Редька' },
      { id: 'parsnip',     icon: '🤍', name: 'Пастернак' },
      { id: 'celery_root', icon: '🟤', name: 'Сельдерей' },
    ]
  },
  {
    id: 'greens',
    label: '🌿 Зелень',
    crops: [
      { id: 'dill',    icon: '🌿', name: 'Укроп' },
      { id: 'parsley', icon: '🌱', name: 'Петрушка' },
      { id: 'lettuce', icon: '🥗', name: 'Салат' },
      { id: 'spinach', icon: '🍃', name: 'Шпинат' },
      { id: 'arugula', icon: '🌿', name: 'Руккола' },
      { id: 'basil',   icon: '🌱', name: 'Базилик' },
    ]
  },
  {
    id: 'perennials',
    label: '🍓 Многолетние',
    crops: [
      { id: 'strawberry',   icon: '🍓', name: 'Клубника' },
      { id: 'raspberry',    icon: '🫐', name: 'Малина' },
      { id: 'currant',      icon: '🍇', name: 'Смородина' },
      { id: 'gooseberry',   icon: '🟢', name: 'Крыжовник' },
      { id: 'blackberry',   icon: '🫐', name: 'Ежевика' },
      { id: 'blueberry',    icon: '🔵', name: 'Голубика' },
      { id: 'honeysuckle',  icon: '🌸', name: 'Жимолость' },
      { id: 'seabuckthorn', icon: '🟠', name: 'Облепиха' },
      { id: 'mint',         icon: '🌿', name: 'Мята' },
      { id: 'melissa',      icon: '🌱', name: 'Мелисса' },
      { id: 'tarragon',     icon: '🌿', name: 'Эстрагон' },
      { id: 'sorrel',       icon: '🍃', name: 'Щавель' },
    ]
  },
]

// Плоский список всех культур
const CROPS = CROP_CATEGORIES.flatMap(cat => cat.crops)

const NOTIF_CHANNELS = [
  { id: 'vk',   icon: '💙', label: 'ВКонтакте' },
  { id: 'tg',   icon: '✈️', label: 'Telegram' },
  { id: 'ok',   icon: '🟠', label: 'Одноклассники' },
  { id: 'push', icon: '🔔', label: 'Push (браузер)' },
]

const GROW_OPTIONS = [
  { id: 'open',       icon: '🌱', title: 'Открытый грунт', sub: 'Грядки, огород' },
  { id: 'greenhouse', icon: '🏠', title: 'Теплица',         sub: 'Стационарная или плёночная' },
  { id: 'hotbed',     icon: '🫧', title: 'Парник',          sub: 'Дуги, мини-парник' },
]

const SOIL_LABELS: Record<string, string> = {
  loam: 'Суглинок', clay: 'Глинистая', sandy: 'Песчаная',
  peat: 'Торфяная', black: 'Чернозём',
  ready: 'Покупной грунт', coconut: 'Кокосовый', hydro: 'Гидропоника', own: 'Своя смесь',
}

const CROP_OPERATIONS: Record<string, { id: string; label: string }[]> = {
  tomato:      [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pinching', label:'✂️ Пасынкование' }, { id:'tying', label:'🪢 Подвязка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  cucumber:    [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pinching_tip', label:'✂️ Прищипка' }, { id:'tying', label:'🪢 Подвязка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  pepper:      [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pinching', label:'✂️ Пасынкование' }, { id:'tying', label:'🪢 Подвязка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  eggplant:    [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pinching', label:'✂️ Пасынкование' }, { id:'tying', label:'🪢 Подвязка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  potato:      [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'hilling', label:'⛏️ Окучивание' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  carrot:      [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  beet:        [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  cabbage:     [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'hilling', label:'⛏️ Окучивание' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  onion:       [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  garlic:      [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  zucchini:    [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pinching_tip', label:'✂️ Прищипка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  pumpkin:     [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pinching_tip', label:'✂️ Прищипка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  pea:         [{ id:'watering', label:'💧 Полив' }, { id:'support', label:'🪴 Опора' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  corn:        [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  dill:        [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  parsley:     [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  lettuce:     [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  spinach:     [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  arugula:     [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  basil:       [{ id:'watering', label:'💧 Полив' }, { id:'pinching', label:'✂️ Прищипка' }, { id:'disease', label:'⚠️ Болезни' }],
  radish:      [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  turnip:      [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  daikon:      [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  parsnip:     [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  celery_root: [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  strawberry:  [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pinching_mustache', label:'✂️ Усы' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
  raspberry:   [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pruning', label:'✂️ Обрезка' }, { id:'tying', label:'🪢 Подвязка' }, { id:'disease', label:'⚠️ Болезни' }],
  currant:     [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pruning', label:'✂️ Обрезка' }, { id:'disease', label:'⚠️ Болезни' }],
  gooseberry:  [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pruning', label:'✂️ Обрезка' }, { id:'disease', label:'⚠️ Болезни' }],
  blackberry:  [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pruning', label:'✂️ Обрезка' }, { id:'tying', label:'🪢 Подвязка' }, { id:'disease', label:'⚠️ Болезни' }],
  blueberry:   [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pruning', label:'✂️ Обрезка' }, { id:'disease', label:'⚠️ Болезни' }],
  honeysuckle: [{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pruning', label:'✂️ Обрезка' }, { id:'disease', label:'⚠️ Болезни' }],
  seabuckthorn:[{ id:'watering', label:'💧 Полив' }, { id:'feeding', label:'🌿 Подкормка' }, { id:'pruning', label:'✂️ Обрезка' }, { id:'disease', label:'⚠️ Болезни' }],
  mint:        [{ id:'watering', label:'💧 Полив' }, { id:'disease', label:'⚠️ Болезни' }],
  melissa:     [{ id:'watering', label:'💧 Полив' }, { id:'disease', label:'⚠️ Болезни' }],
  tarragon:    [{ id:'watering', label:'💧 Полив' }, { id:'disease', label:'⚠️ Болезни' }],
  sorrel:      [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }],
}
const DEFAULT_OPS = [{ id:'watering', label:'💧 Полив' }, { id:'weeding', label:'🌾 Прополка' }, { id:'disease', label:'⚠️ Болезни' }]
function getOps(id: string) { return CROP_OPERATIONS[id] ?? DEFAULT_OPS }
function getFirstOp(id: string) { return getOps(id).filter(o => o.id !== 'disease')[0]?.label ?? '💧 Полив' }
const isPerennial = (id: string) => CROP_CATEGORIES[3].crops.some(c => c.id === id)

function daysSince(dateStr: string): number {
  if (!dateStr) return -1
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000))
}
function getCropStage(days: number, totalDays: number): string {
  if (days < 0) return '—'
  const pct = days / totalDays
  if (pct < 0.1) return 'Всходы'
  if (pct < 0.35) return 'Рост'
  if (pct < 0.65) return 'Цветение'
  if (pct < 0.9) return 'Налив'
  return '🎉 Сбор!'
}

// ─── Матрица сортов ────────────────────────────────────────────────
const CROP_VARIETIES: Record<string, { name: string; days: number; desc: string }[]> = {
  tomato: [
    { name: 'Бычье сердце',       days: 110, desc: 'Крупноплодный, мясистый' },
    { name: 'Черри',              days: 85,  desc: 'Мелкий, сладкий, урожайный' },
    { name: 'Де Барао',           days: 120, desc: 'Высокорослый, лёжкий' },
    { name: 'Белый налив',        days: 85,  desc: 'Ранний, неприхотливый' },
    { name: 'Сливка',             days: 90,  desc: 'Для консервации' },
    { name: 'Ультраскороспелый',  days: 75,  desc: 'Для открытого грунта севера' },
    { name: 'Розовый мёд',        days: 100, desc: 'Розовые, очень сладкие' },
    { name: 'Чёрный принц',       days: 105, desc: 'Тёмно-бордовый, насыщенный' },
    { name: 'Президент',          days: 95,  desc: 'Крупный, транспортабельный' },
    { name: 'Финик',              days: 90,  desc: 'Гроздевой, длительное плодоношение' },
  ],
  cucumber: [
    { name: 'Родничок',           days: 45, desc: 'Классический, проверенный' },
    { name: 'Герман',             days: 42, desc: 'Партенокарпик, для теплицы' },
    { name: 'Муромский',          days: 38, desc: 'Ранний, хрустящий' },
    { name: 'Зозуля',             days: 45, desc: 'Длинноплодный, теплица' },
    { name: 'Конкурент',          days: 48, desc: 'Для засолки' },
    { name: 'Кураж',              days: 42, desc: 'Партенокарпик, урожайный' },
    { name: 'Засолочный',         days: 50, desc: 'Крепкий, хрустящий' },
    { name: 'Китайский длинный',  days: 55, desc: 'До 40 см, теплица' },
    { name: 'Изящный',            days: 45, desc: 'Открытый грунт, неприхотливый' },
    { name: 'Директор',           days: 40, desc: 'Ранний, партенокарпик' },
  ],
  carrot: [
    { name: 'Нантская',           days: 65, desc: 'Классическая, цилиндрическая' },
    { name: 'Шантенэ',            days: 75, desc: 'Конусовидная, хранится долго' },
    { name: 'Лосиноостровская',   days: 80, desc: 'Сладкая, хранение' },
    { name: 'Каротель',           days: 60, desc: 'Короткая, ранняя' },
    { name: 'Витаминная 6',       days: 75, desc: 'Высокое содержание каротина' },
    { name: 'Самсон',             days: 70, desc: 'Голландская, выровненная' },
    { name: 'Флаккэ',             days: 80, desc: 'Длинная, до 25 см' },
    { name: 'Тушон',              days: 65, desc: 'Короткая, для тяжёлых почв' },
    { name: 'Абако',              days: 70, desc: 'Гибрид, устойчивый' },
    { name: 'Курода',             days: 75, desc: 'Японская, сладкая' },
  ],
  potato: [
    { name: 'Импала',             days: 60, desc: 'Ранний, жёлтая мякоть' },
    { name: 'Ривьера',            days: 55, desc: 'Сверхранний' },
    { name: 'Невский',            days: 80, desc: 'Классика, белая мякоть' },
    { name: 'Синеглазка',         days: 80, desc: 'Народный сорт, вкусный' },
    { name: 'Розара',             days: 75, desc: 'Розовая кожура, рассыпчатый' },
    { name: 'Ред Скарлет',        days: 70, desc: 'Красный, ранний' },
    { name: 'Пикассо',            days: 90, desc: 'Пятнистая кожура, хранение' },
    { name: 'Удача',              days: 65, desc: 'Ранний, урожайный' },
    { name: 'Колобок',            days: 80, desc: 'Круглый, лёжкий' },
    { name: 'Голубизна',          days: 85, desc: 'Поздний, хранение' },
  ],
  pepper: [
    { name: 'Калифорнийское чудо', days: 95,  desc: 'Крупный, сладкий' },
    { name: 'Ласточка',           days: 100, desc: 'Конусовидный, сочный' },
    { name: 'Богатырь',           days: 110, desc: 'Крупноплодный' },
    { name: 'Белозёрка',          days: 90,  desc: 'Молочно-белый, нежный' },
    { name: 'Купец',              days: 95,  desc: 'Урожайный гибрид' },
    { name: 'Геракл',             days: 105, desc: 'Красный, толстостенный' },
    { name: 'Какаду',             days: 100, desc: 'Длинный, желтеет' },
    { name: 'Оранжевое чудо',     days: 95,  desc: 'Оранжевый, витаминный' },
    { name: 'Тёща',               days: 90,  desc: 'Острый, для маринования' },
    { name: 'Гогошары',           days: 100, desc: 'Томатовидный, сладкий' },
  ],
  cabbage: [
    { name: 'Июньская',           days: 60,  desc: 'Ранняя, нежная' },
    { name: 'Слава',              days: 85,  desc: 'Средняя, для засолки' },
    { name: 'Амагер',             days: 120, desc: 'Поздняя, хранение' },
    { name: 'Московская поздняя', days: 130, desc: 'Зимнее хранение' },
    { name: 'Белорусская',        days: 100, desc: 'Средняя, универсальная' },
    { name: 'Мегатон',            days: 90,  desc: 'Гибрид, крупные кочаны' },
    { name: 'Краутман',           days: 95,  desc: 'Немецкий, для квашения' },
    { name: 'Агрессор',           days: 115, desc: 'Поздний, устойчивый' },
    { name: 'Колобок',            days: 110, desc: 'Круглый, плотный' },
    { name: 'Атрия',              days: 105, desc: 'Гибрид, лёжкий' },
  ],
  onion: [
    { name: 'Штутгартер',         days: 75, desc: 'Немецкий, плоский' },
    { name: 'Эксибишен',          days: 90, desc: 'Гигантский, сладкий' },
    { name: 'Центурион',          days: 80, desc: 'Гибрид, лёжкий' },
    { name: 'Ред Барон',          days: 75, desc: 'Красный, сладкий' },
    { name: 'Стригуновский',      days: 70, desc: 'Острый, народный' },
    { name: 'Бессоновский',       days: 65, desc: 'Местный, лёжкий' },
    { name: 'Геркулес',           days: 80, desc: 'Крупный, урожайный' },
    { name: 'Золотистый Семко',   days: 85, desc: 'Гибрид, транспортный' },
    { name: 'Мячковский',         days: 75, desc: 'Полуострый, хранение' },
    { name: 'Халцедон',           days: 80, desc: 'Жёлтый, лёжкий' },
  ],
  strawberry: [
    { name: 'Клери',              days: 30, desc: 'Ранняя, итальянская' },
    { name: 'Азия',               days: 35, desc: 'Ранняя, крупная' },
    { name: 'Альба',              days: 28, desc: 'Очень ранняя' },
    { name: 'Хоней',              days: 35, desc: 'Американская, сладкая' },
    { name: 'Эльсанта',           days: 40, desc: 'Голландская, транспортная' },
    { name: 'Полка',              days: 45, desc: 'Поздняя, ароматная' },
    { name: 'Зефир',              days: 38, desc: 'Крупная, розовая' },
    { name: 'Мальвина',           days: 50, desc: 'Поздняя, устойчивая' },
    { name: 'Флоренс',            days: 45, desc: 'Позднеспелая, британская' },
    { name: 'Королева Елизавета', days: 30, desc: 'Ремонтантная' },
  ],
  zucchini: [
    { name: 'Цукеша',             days: 45, desc: 'Цилиндрический, тёмный' },
    { name: 'Аэронавт',           days: 42, desc: 'Ранний, компактный' },
    { name: 'Белый',              days: 48, desc: 'Белоплодный, нежный' },
    { name: 'Желтоплодный',       days: 45, desc: 'Декоративный, вкусный' },
    { name: 'Искандер',           days: 40, desc: 'Гибрид, партенокарпик' },
    { name: 'Ролик',              days: 45, desc: 'Круглый, для фарширования' },
    { name: 'Грибовский',         days: 50, desc: 'Классика, неприхотливый' },
    { name: 'Квета',              days: 42, desc: 'Чешский, урожайный' },
    { name: 'Чёрный красавец',    days: 44, desc: 'Тёмно-зелёный, сочный' },
    { name: 'Арал',               days: 40, desc: 'Гибрид, ультраранний' },
  ],
}

// ─── Погода ────────────────────────────────────────────────────────
const OWM_KEY = '74da32bba104679e8fe0a5d77b2d18fd'
interface WeatherData { temp: number; feels: number; desc: string; icon: string; humidity: number; wind: number; loading: boolean; error: boolean }

function useWeather(city: string): WeatherData {
  const [w, setW] = useState<WeatherData>({ temp: 0, feels: 0, desc: '', icon: '⛅', humidity: 0, wind: 0, loading: true, error: false })
  useState(() => {
    if (!city.trim()) { setW(p => ({ ...p, loading: false, error: true })); return }
    fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OWM_KEY}&units=metric&lang=ru`)
      .then(r => r.json())
      .then(d => {
        if (d.cod !== 200) { setW(p => ({ ...p, loading: false, error: true })); return }
        const temp = Math.round(d.main.temp)
        const id = d.weather[0].id
        let icon = '⛅'
        if (id >= 200 && id < 300) icon = '⛈️'
        else if (id >= 300 && id < 600) icon = '🌧️'
        else if (id >= 600 && id < 700) icon = '❄️'
        else if (id >= 700 && id < 800) icon = '🌫️'
        else if (id === 800) icon = '☀️'
        setW({ temp, feels: Math.round(d.main.feels_like), desc: d.weather[0].description, icon, humidity: d.main.humidity, wind: Math.round(d.wind.speed), loading: false, error: false })
      })
      .catch(() => setW(p => ({ ...p, loading: false, error: true })))
  })
  return w
}

// ─── Лунный календарь (локальный расчёт) ──────────────────────────
const MOON_PHASE_NAMES: Record<string, string> = {
  'New Moon': '🌑 Новолуние',
  'Waxing Crescent': '🌒 Растущий серп',
  'First Quarter': '🌓 Первая четверть',
  'Waxing Gibbous': '🌔 Растущая луна',
  'Full Moon': '🌕 Полнолуние',
  'Waning Gibbous': '🌖 Убывающая луна',
  'Third Quarter': '🌗 Последняя четверть',
  'Waning Crescent': '🌘 Убывающий серп',
}

const MOON_GOOD: Record<string, string> = {
  'New Moon': 'Посев зелени, планирование',
  'Waxing Crescent': 'Посев надземных культур, полив',
  'First Quarter': 'Посев, пересадка рассады',
  'Waxing Gibbous': 'Полив, подкормка, пересадка',
  'Full Moon': 'Сбор урожая, консервация',
  'Waning Gibbous': 'Обрезка, прополка, борьба с вредителями',
  'Third Quarter': 'Посев корнеплодов, внесение удобрений',
  'Waning Crescent': 'Обрезка, пересадка многолетников',
}

const MOON_BAD: Record<string, string> = {
  'New Moon': 'Пересадка, обрезка',
  'Waxing Crescent': 'Посев корнеплодов, обрезка',
  'First Quarter': 'Обрезка, сбор урожая',
  'Waxing Gibbous': 'Обрезка, посев корнеплодов',
  'Full Moon': 'Посев, пересадка',
  'Waning Gibbous': 'Посев надземных культур',
  'Third Quarter': 'Посев надземных культур, полив',
  'Waning Crescent': 'Посев, прививка',
}

interface MoonData { phase: string; illumination: number; age: number; loading: boolean; error: boolean; dayStart?: Date; dayEnd?: Date }

function calcMoon(): MoonData & { dayStart: Date; dayEnd: Date } {
  const now = new Date()
  const SYNODIC = 29.53058867 // дней в лунном месяце

  // Точный возраст луны через suncalc
  const illum = SunCalc.getMoonIllumination(now)
  // illum.phase: 0 = новолуние, 0.5 = полнолуние, 1 = новолуние
  const age = illum.phase * SYNODIC

  // Определяем фазу
  let phase = 'New Moon'
  if (age < 1.85) phase = 'New Moon'
  else if (age < 7.38) phase = 'Waxing Crescent'
  else if (age < 9.22) phase = 'First Quarter'
  else if (age < 14.77) phase = 'Waxing Gibbous'
  else if (age < 16.61) phase = 'Full Moon'
  else if (age < 22.15) phase = 'Waning Gibbous'
  else if (age < 23.99) phase = 'Third Quarter'
  else phase = 'Waning Crescent'

  const illumination = Math.round(illum.fraction * 100)
  const lunarDay = Math.floor(age) + 1

  // Вычисляем начало и конец текущего лунного дня
  // Один лунный день = SYNODIC / 29.53 * 24ч ≈ 24ч 50мин
  const msPerLunarDay = (SYNODIC / 29.53058867) * 24 * 60 * 60 * 1000
  // Момент последнего новолуния
  // Начало текущего лунного дня
  const dayStart = new Date(now.getTime() - (age % 1) * 24 * 60 * 60 * 1000)
  const dayEnd = new Date(dayStart.getTime() + msPerLunarDay)

  return { phase, illumination, age: lunarDay, loading: false, error: false, dayStart, dayEnd }
}

function useMoon(): MoonData & { dayStart: Date; dayEnd: Date } {
  const [m] = useState(() => calcMoon())
  return m
}

// ─── Прогноз 7 дней ────────────────────────────────────────────────
interface ForecastDay { date: string; icon: string; tempMax: number; tempMin: number; desc: string }

function useForecast(city: string): { days: ForecastDay[]; loading: boolean; error: boolean } {
  const [f, setF] = useState<{ days: ForecastDay[]; loading: boolean; error: boolean }>({ days: [], loading: true, error: false })
  useEffect(() => {
    if (!city.trim()) { setF(p => ({ ...p, loading: false, error: true })); return }
    fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${OWM_KEY}&units=metric&lang=ru&cnt=56`)
      .then(r => r.json())
      .then(d => {
        if (d.cod !== '200') { setF(p => ({ ...p, loading: false, error: true })); return }
        // Группируем по дням — берём запись около полудня
        const byDay: Record<string, any> = {}
        d.list.forEach((item: any) => {
          const date = item.dt_txt.slice(0, 10)
          if (!byDay[date] || item.dt_txt.includes('12:00')) byDay[date] = item
        })
        const days: ForecastDay[] = Object.entries(byDay).slice(0, 7).map(([date, item]: any) => {
          const id = item.weather[0].id
          let icon = '⛅'
          if (id >= 200 && id < 300) icon = '⛈️'
          else if (id >= 300 && id < 600) icon = '🌧️'
          else if (id >= 600 && id < 700) icon = '❄️'
          else if (id >= 700 && id < 800) icon = '🌫️'
          else if (id === 800) icon = '☀️'
          return {
            date,
            icon,
            tempMax: Math.round(item.main.temp_max),
            tempMin: Math.round(item.main.temp_min),
            desc: item.weather[0].description,
          }
        })
        setF({ days, loading: false, error: false })
      })
      .catch(() => setF(p => ({ ...p, loading: false, error: true })))
  }, [city])
  return f
}

function getWeatherRisks(temp: number, humidity: number, crops: CropEntry[]): { text: string; type: 'ok' | 'warn' | 'danger' }[] {
  const risks: { text: string; type: 'ok' | 'warn' | 'danger' }[] = []
  const ids = crops.map(c => c.id)
  if (temp <= 0) risks.push({ text: '❄️ Заморозок! Укройте растения', type: 'danger' })
  else if (temp <= 3) risks.push({ text: '🌡️ Риск заморозка ночью', type: 'warn' })
  else risks.push({ text: '✓ Заморозков нет', type: 'ok' })
  if (temp >= 15 && temp <= 25 && humidity >= 75 && ids.some(id => ['tomato','potato'].includes(id)))
    risks.push({ text: '⚠️ Риск фитофторы', type: 'warn' })
  if (temp >= 25 && humidity < 50 && ids.some(id => ['cucumber','pepper','eggplant'].includes(id)))
    risks.push({ text: '🕷️ Риск паутинного клеща', type: 'warn' })
  if (temp >= 20 && temp <= 25 && humidity >= 70 && ids.some(id => ['cucumber','zucchini'].includes(id)))
    risks.push({ text: '🍄 Риск мучнистой росы', type: 'warn' })
  return risks
}

function makeUid(): string {
  return Math.random().toString(36).slice(2, 9)
}

function makeObject(type: string, name?: string): GardenObject {
  const opt = GROW_OPTIONS.find(o => o.id === type)!
  return { uid: makeUid(), type, name: name || opt.title, length: '', width: '', height: '', ventilationReminders: true, ventilationMorning: '06:00', ventilationEvening: '19:00', soilType: '', substrate: '', drainageIssue: false }
}

const OBJECT_LIMITS: Record<Plan, number> = { free: 1, base: 3, pro: 999 }

const empty: OnboardingData = {
  city: '', terrain: '', gardenObjects: [], cropEntries: [],
  experience: '', tools: [], notifMorning: '06:00', notifEvening: '19:00',
  notifLevel: 'standard', notifChannels: ['vk'],
}

const PLANS = [
  { id: 'free' as Plan, icon: '🌱', name: 'Бесплатно', price: '0 ₽',
    features: ['До 10 культур', '1 объект', 'Критичные уведомления', '3 вопроса агроному/день'] },
  { id: 'base' as Plan, icon: '🌿', name: 'Базовая', price: '150 ₽/мес',
    features: ['До 15 культур', 'До 3 объектов', 'Все уведомления', 'Прогноз на 7 дней', 'Персональный совет', 'Лунный календарь', 'Чат без лимита'] },
  { id: 'pro' as Plan, icon: '🏆', name: 'Про', price: '300 ₽/мес',
    features: ['Без ограничений', 'Свои растения (экзотика)', 'Рекомендации совместимости', 'Матрица болезней по погоде', 'История сезонов', 'Экспорт дневника'] },
]


// ─── СОВМЕСТИМОСТЬ КУЛЬТУР ─────────────────────────────────────────
const CROP_COMPAT: Record<string, { good: string[]; bad: string[] }> = {
  tomato:    { good: ['basil','carrot','parsley','garlic'], bad: ['potato','fennel','beet'] },
  cucumber:  { good: ['dill','pea','corn','lettuce'], bad: ['tomato','potato','garlic'] },
  potato:    { good: ['corn','cabbage','garlic','horseradish'], bad: ['tomato','cucumber','sunflower','raspberry'] },
  carrot:    { good: ['onion','lettuce','tomato','pea'], bad: ['dill','parsley','beet'] },
  onion:     { good: ['carrot','beet','lettuce','strawberry'], bad: ['pea','bean'] },
  garlic:    { good: ['tomato','strawberry','carrot','beet'], bad: ['pea','bean','cabbage'] },
  cabbage:   { good: ['dill','potato','onion','beet'], bad: ['tomato','strawberry','garlic'] },
  pepper:    { good: ['basil','carrot','parsley'], bad: ['potato','fennel'] },
  beet:      { good: ['onion','cabbage','lettuce'], bad: ['carrot','tomato','garlic'] },
  strawberry:{ good: ['garlic','onion','lettuce','spinach'], bad: ['cabbage','fennel'] },
  pea:       { good: ['carrot','corn','cucumber','radish'], bad: ['onion','garlic'] },
  corn:      { good: ['pea','cucumber','potato','squash'], bad: ['tomato'] },
  dill:      { good: ['cucumber','cabbage','onion'], bad: ['carrot','tomato'] },
  basil:     { good: ['tomato','pepper'], bad: ['cucumber'] },
  lettuce:   { good: ['carrot','onion','strawberry','cucumber'], bad: [] },
  radish:    { good: ['pea','lettuce','cucumber'], bad: ['hyssop'] },
  zucchini:  { good: ['corn','pea','dill'], bad: ['potato'] },
  pumpkin:   { good: ['corn','pea','dill'], bad: ['potato'] },
}

// ─── МАТРИЦА БОЛЕЗНЕЙ ──────────────────────────────────────────────
const DISEASE_MATRIX: { condition: (temp: number, humidity: number) => boolean; crops: string[]; name: string; advice: string; severity: 'warn' | 'danger' }[] = [
  {
    name: '🍄 Фитофтора',
    condition: (t, h) => t >= 15 && t <= 25 && h >= 75,
    crops: ['tomato', 'potato'],
    advice: 'Обработайте медным купоросом или фунгицидом. Избегайте полива сверху.',
    severity: 'danger',
  },
  {
    name: '🕷️ Паутинный клещ',
    condition: (t, h) => t >= 25 && h < 50,
    crops: ['cucumber', 'pepper', 'eggplant', 'tomato'],
    advice: 'Опрыскайте акарицидом или мыльным раствором. Повысьте влажность.',
    severity: 'warn',
  },
  {
    name: '🌫️ Мучнистая роса',
    condition: (t, h) => t >= 18 && t <= 26 && h >= 60 && h <= 80,
    crops: ['cucumber', 'zucchini', 'pumpkin', 'strawberry'],
    advice: 'Обработайте содовым раствором или фунгицидом. Улучшите вентиляцию.',
    severity: 'warn',
  },
  {
    name: '🦟 Белокрылка',
    condition: (t, h) => t >= 22 && h >= 70,
    crops: ['tomato', 'pepper', 'eggplant', 'cucumber'],
    advice: 'Используйте жёлтые клеевые ловушки, обработайте инсектицидом.',
    severity: 'warn',
  },
  {
    name: '🐛 Капустная совка',
    condition: (t, h) => t >= 18 && t <= 28 && h >= 65,
    crops: ['cabbage'],
    advice: 'Осмотрите листья снизу, удалите яйца вручную. Обработайте Лепидоцидом.',
    severity: 'warn',
  },
  {
    name: '❄️ Риск заморозка',
    condition: (t, _h) => t <= 3,
    crops: ['tomato', 'cucumber', 'pepper', 'eggplant', 'zucchini', 'pumpkin', 'basil'],
    advice: 'Укройте растения агроволокном или плёнкой на ночь.',
    severity: 'danger',
  },
]

// ─── UI хелперы ────────────────────────────────────────────────────
function TermsCheckbox({ accepted, onChange }: { accepted: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '12px 0 4px', cursor: 'pointer' }}
      onClick={() => onChange(!accepted)}>
      <div style={{
        width: 20, height: 20, borderRadius: 6, border: '2px solid',
        borderColor: accepted ? '#4ade80' : 'rgba(255,255,255,0.3)',
        background: accepted ? 'rgba(74,222,128,0.2)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1, transition: 'all .2s',
      }}>
        {accepted && <span style={{ color: '#4ade80', fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span>}
      </div>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
        Я принимаю{' '}
        <a href="https://ogorod-ai.ru/terms-privacy.html" target="_blank" rel="noopener noreferrer"
          style={{ color: '#4ade80', textDecoration: 'underline' }}
          onClick={e => e.stopPropagation()}>
          пользовательское соглашение и политику конфиденциальности
        </a>
      </span>
    </div>
  )
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return <div className="ob-progress"><div className="ob-progress-fill" style={{ width: `${(step / total) * 100}%` }} /></div>
}
function NavButtons({ onBack, onNext, onSkip, nextLabel = 'Далее →', nextDisabled = false, showSkip = true }:
  { onBack?: () => void; onNext: () => void; onSkip?: () => void; nextLabel?: string; nextDisabled?: boolean; showSkip?: boolean }) {
  return (
    <div className="ob-nav">
      {onBack ? <button className="btn-back" onClick={onBack}>← Назад</button> : <div />}
      <div className="ob-nav-right">
        {showSkip && onSkip && <button className="btn-skip" onClick={onSkip}>Пропустить</button>}
        <button className="btn-primary" onClick={onNext} disabled={nextDisabled}>{nextLabel}</button>
      </div>
    </div>
  )
}

// ─── МОДАЛКА ВЫБОРА СОРТОВ (при добавлении культуры) ───────────────
function CropVarietyPickerModal({ cropId, onConfirm, onClose, plan = 'free' }: {
  cropId: string
  onConfirm: (varieties: CropVariety[]) => void
  onClose: () => void
  plan?: Plan
}) {
  const crop = CROPS.find(c => c.id === cropId)!
  const suggested = CROP_VARIETIES[cropId] ?? []
  const [selected, setSelected] = useState<CropVariety[]>([])
  const [customName, setCustomName] = useState('')
  const [customDays, setCustomDays] = useState('')

  const toggle = (v: { name: string; days: number }) => {
    setSelected(prev => prev.some(p => p.name === v.name)
      ? prev.filter(p => p.name !== v.name)
      : [...prev, { name: v.name, days: v.days }]
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <span className="modal-icon">{crop.icon}</span>
          <span className="modal-title">{crop.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {suggested.length > 0 ? (
          <>
            <div className="variety-suggest-label">Выберите сорта (или пропустите):</div>
            <div className="variety-suggest-list">
              {suggested.map(s => {
                const isSel = selected.some(p => p.name === s.name)
                return (
                  <button key={s.name} className={`variety-suggest-btn ${isSel ? 'selected' : ''}`} onClick={() => toggle(s)}>
                    <span className="variety-suggest-name">{s.name}</span>
                    <span className="variety-suggest-meta">{s.days}д · {s.desc}</span>
                    {isSel && <span style={{ color: '#4ade80', fontWeight: 800, flexShrink: 0 }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <div className="empty-hint">Для этой культуры пока нет списка сортов</div>
        )}

        {plan === 'pro' ? (
          <>
            <div className="variety-suggest-label" style={{ marginTop: 12 }}>Свой сорт:</div>
            <div className="ob-variety-row">
              <input className="ob-variety-input" value={customName}
                placeholder="Название сорта" onChange={e => setCustomName(e.target.value)} />
              <input className="ob-variety-input" value={customDays}
                placeholder="Дней" type="number" min="1" max="365"
                style={{ width: 70, flexShrink: 0 }}
                onChange={e => setCustomDays(e.target.value)} />
              <button className="profile-edit-save" onClick={() => {
                if (customName.trim()) {
                  const days = customDays ? parseInt(customDays) : undefined
                  setSelected(prev => [...prev, { name: customName.trim(), ...(days ? { days } : {}) }])
                  setCustomName('')
                  setCustomDays('')
                }
              }}>+</button>
            </div>
          </>
        ) : (
          <div className="empty-hint" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            🔒 Свои сорта — только в тарифе <strong>Про</strong>
          </div>
        )}
        {selected.filter(v => !suggested.some(s => s.name === v.name)).map((v, i) => (
          <div key={i} className="ob-variety-row">
            <span className="ob-variety-input" style={{ display: 'flex', alignItems: 'center' }}>
              {v.name}{v.days ? ` · ${v.days}д` : ''}
            </span>
            <button className="ob-variety-del" onClick={() => setSelected(prev => prev.filter(p => p.name !== v.name))}>✕</button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => { onConfirm(selected); onClose() }}>
            {selected.length > 0 ? `Добавить с ${selected.length} сорт(ами)` : 'Добавить без сорта'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── МОДАЛКА РЕДАКТИРОВАНИЯ КУЛЬТУРЫ ──────────────────────────────
function CropEditModal({ entry, gardenObjects, onSave, onDelete, onClose, onAddDiary, plan = 'free' }: {
  entry: CropEntry
  gardenObjects: GardenObject[]
  onSave: (e: CropEntry) => void
  onDelete: () => void
  onClose: () => void
  onAddDiary: (cropId: string) => void
  plan?: Plan
}) {
  const [e, setE] = useState<CropEntry>({ ...entry, varieties: [...entry.varieties] })
  const crop = CROPS.find(c => c.id === e.id)!
  const upd = (patch: Partial<CropEntry>) => setE(prev => ({ ...prev, ...patch }))
  const suggestedVarieties = CROP_VARIETIES[e.id] ?? []
  const addedNames = e.varieties.map(v => v.name)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const perennial = isPerennial(e.id)
  const locObj = gardenObjects.find(o => o.uid === e.location)
  const isEnclosed = locObj?.type === 'greenhouse' || locObj?.type === 'hotbed'
  const ops = getOps(e.id)
  const opList = isEnclosed ? [...ops, { id: 'ventilation', label: '🏠 Проветривание' }] : ops

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={ev => ev.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <span className="modal-icon">{crop.icon}</span>
          <span className="modal-title">{crop.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-section-label">Статус</div>
        <div className="modal-chips">
          <button className={`ob-chip ${e.status === 'planned' ? 'selected' : ''}`}
            onClick={() => upd({ status: 'planned' })}>📋 Готовлюсь</button>
          <button className={`ob-chip ${e.status === 'planted' ? 'selected' : ''}`}
            onClick={() => upd({ status: 'planted' })}>✅ Уже посадил</button>
        </div>

        {gardenObjects.length > 0 && (
          <>
            <div className="modal-section-label">Место</div>
            <div className="modal-chips">
              {gardenObjects.map(obj => {
                const opt = GROW_OPTIONS.find(o => o.id === obj.type)!
                return (
                  <button key={obj.uid} className={`ob-chip ${e.location === obj.uid ? 'selected' : ''}`}
                    onClick={() => upd({ location: obj.uid })}>
                    {opt.icon} {opt.title}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Дата — для многолетних добавляем год */}
        <div className="modal-section-label">{perennial ? 'Дата посадки' : 'Дата посева/высадки'}</div>
        <div className="ob-sow-row" style={{ marginBottom: perennial ? 8 : 12 }}>
          <div className="ob-dim-field" style={{ flex: 2 }}>
            <input type="date" value={e.sowDate} onChange={ev => upd({ sowDate: ev.target.value })} />
          </div>
          {!perennial && (
            <div style={{ flex: 3, display: 'flex', gap: 6 }}>
              <button className={`ob-chip ${e.sowMethod === 'seeds' ? 'selected' : ''}`}
                style={{ flex: 1 }} onClick={() => upd({ sowMethod: 'seeds' })}>🌱 Семена</button>
              <button className={`ob-chip ${e.sowMethod === 'seedling' ? 'selected' : ''}`}
                style={{ flex: 1 }} onClick={() => upd({ sowMethod: 'seedling' })}>🪴 Рассада</button>
            </div>
          )}
        </div>
        {e.sowMethod === 'seedling' && (
          <div className="ob-hint" style={{ marginTop: -8, marginBottom: 8 }}>
            💡 Для рассады укажите дату посева семян — так прогресс созревания будет точнее
          </div>
        )}
        {perennial && (
          <div className="ob-dim-field" style={{ marginBottom: 12 }}>
            <label>Год посадки (если давно, необязательно)</label>
            <input type="number" min="1990" max="2025"
              value={e.plantYear ?? ''}
              onChange={ev => upd({ plantYear: ev.target.value ? parseInt(ev.target.value) : undefined })}
              placeholder="Например: 2015" />
          </div>
        )}

        <div className="modal-section-label">Сорта</div>
        {e.varieties.map((v, vi) => (
          <div key={vi} className="ob-variety-row">
            <input className="ob-variety-input" value={v.name} placeholder={`Сорт ${vi + 1}`}
              onChange={ev => {
                const vars = [...e.varieties]; vars[vi] = { ...vars[vi], name: ev.target.value }; upd({ varieties: vars })
              }} />
            {v.days && <span className="variety-days-badge">{v.days}д</span>}
            <button className="ob-variety-del" onClick={() => upd({ varieties: e.varieties.filter((_, i) => i !== vi) })}>✕</button>
          </div>
        ))}
        {suggestedVarieties.filter(s => !addedNames.includes(s.name)).length > 0 && (
          <>
            <div className="variety-suggest-label">Популярные сорта:</div>
            <div className="variety-suggest-list">
              {suggestedVarieties.filter(s => !addedNames.includes(s.name)).map(s => (
                <button key={s.name} className="variety-suggest-btn"
                  onClick={() => upd({ varieties: [...e.varieties, { name: s.name, days: s.days }] })}>
                  <span className="variety-suggest-name">{s.name}</span>
                  <span className="variety-suggest-meta">{s.days}д · {s.desc}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {plan === 'pro' ? (
          <button className="ob-add-variety" onClick={() => upd({ varieties: [...e.varieties, { name: '' }] })}>+ Свой сорт</button>
        ) : (
          <div className="empty-hint" style={{ marginTop: 8, fontSize: 13 }}>
            🔒 Свои сорта — только в тарифе <strong>Про</strong>
          </div>
        )}

        {/* Уведомления */}
        <div className="modal-section-label" style={{ marginTop: 16 }}>Уведомления</div>
        <div className="ob-notif-toggles" style={{ marginBottom: 12 }}>
          {opList.map(op => {
            const isOn = e.notifs.includes(op.id)
            const isCritical = op.id === 'disease'
            return (
              <div key={op.id} className="ob-notif-toggle-row">
                <span className="ob-notif-label">{op.label}</span>
                <button className={`ob-toggle ${isOn ? 'on' : ''} ${isCritical ? 'locked' : ''}`}
                  onClick={() => {
                    if (isCritical) return
                    upd({ notifs: isOn ? e.notifs.filter(x => x !== op.id) : [...e.notifs, op.id] })
                  }} />
              </div>
            )
          })}
        </div>
        <div className="ob-hint">⚠️ Болезни нельзя отключить</div>

        <button className="btn-primary btn-full" style={{ marginTop: 16 }} onClick={() => onSave(e)}>Сохранить</button>
        <button className="btn-diary-add" style={{ marginTop: 8 }} onClick={() => onAddDiary(e.id)}>📝 Добавить в дневник</button>

        {showDeleteConfirm ? (
          <div className="delete-confirm">
            <span>Удалить из огорода?</span>
            <button className="btn-delete-yes" onClick={() => { onDelete(); onClose() }}>Да, удалить</button>
            <button className="btn-delete-no" onClick={() => setShowDeleteConfirm(false)}>Отмена</button>
          </div>
        ) : (
          <button className="btn-delete-crop" onClick={() => setShowDeleteConfirm(true)}>🗑️ Удалить из огорода</button>
        )}
      </div>
    </div>
  )
}

// ─── ОНБОРДИНГ ─────────────────────────────────────────────────────
function Onboarding({ onDone }: { onDone: (d: OnboardingData) => void }) {
  const [step, setStep] = useState(0)
  const [d, setD] = useState<OnboardingData>(empty)
  const [objIdx, setObjIdx] = useState(0)
  const [activeCat, setActiveCat] = useState(0)
  const [pickerCropId, setPickerCropId] = useState<string | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)

  const set = (patch: Partial<OnboardingData>) => setD(prev => ({ ...prev, ...patch }))
  const setObj = (idx: number, patch: Partial<GardenObject>) =>
    setD(prev => ({ ...prev, gardenObjects: prev.gardenObjects.map((o, i) => i === idx ? { ...o, ...patch } : o) }))
  const updateEntry = (id: string, patch: Partial<CropEntry>) =>
    setD(prev => ({ ...prev, cropEntries: prev.cropEntries.map(e => e.id === id ? { ...e, ...patch } : e) }))

  const TOTAL = 11
  const next = () => setStep(s => s + 1)
  const back = () => setStep(s => s - 1)
  const skip = () => setStep(s => s + 1)
  const enclosedObjects = d.gardenObjects.filter(o => o.type === 'greenhouse' || o.type === 'hotbed')

  // Шаг 0: Приветствие + тарифы
  if (step === 0) return (
    <div className="screen onboarding">
      <div className="ob-bg" />
      <div className="ob-content">
        <div className="ob-icon">🌱</div>
        <h1>Ваш личный агроном</h1>
        <p>Точные советы каждое утро — с учётом погоды, почвы и ваших культур</p>
        <div className="plan-cards">
          {PLANS.map(p => (
            <div key={p.id} className={`plan-card plan-${p.id}`}>
              {p.id === 'pro' && <div className="plan-badge">ХИТ</div>}
              <div className="plan-header">
                <span className="plan-icon">{p.icon}</span>
                <div><div className="plan-name">{p.name}</div><div className="plan-price">{p.price}</div></div>
              </div>
              <ul className="plan-features">{p.features.map(f => <li key={f}>{f}</li>)}</ul>
            </div>
          ))}
        </div>
        <TermsCheckbox accepted={termsAccepted} onChange={setTermsAccepted} />
        <button className="btn-primary btn-full" style={{ marginTop: 12 }} onClick={next} disabled={!termsAccepted}>Начать бесплатно →</button>
      </div>
    </div>
  )

  // Шаг 1: Город
  if (step === 1) return (
    <div className="screen onboarding">
      <div className="ob-bg" />
      <div className="ob-content">
        <ProgressBar step={1} total={TOTAL} />
        <div className="ob-icon">🗺️</div>
        <h1>Ваш город</h1>
        <p>Введите название — подберём погоду и предупредим о заморозках</p>
        <div className="ob-city-input-wrap">
          <input className="ob-city-input" type="text" value={d.city}
            onChange={e => set({ city: e.target.value })}
            placeholder="Например: Коряжма" autoFocus />
          {d.city && <span className="ob-city-check">✓</span>}
        </div>
        <p className="ob-city-hint">Можно написать на русском или английском</p>
        <NavButtons onNext={next} nextDisabled={!d.city.trim()} showSkip={false} />
      </div>
    </div>
  )

  // Шаг 2: Климат
  if (step === 2) return (
    <div className="screen onboarding">
      <div className="ob-bg" />
      <div className="ob-content">
        <ProgressBar step={2} total={TOTAL} />
        <div className="ob-icon">🌤️</div>
        <h1>Уточните климат</h1>
        <p>Влияет на сроки заморозков и влажность</p>
        <div className="ob-cards">
          {[
            { id: 'lowland',    icon: '🌊', title: 'Низина',            sub: 'Заморозки раньше, туманы' },
            { id: 'highland',   icon: '⛰️', title: 'Возвышенность',     sub: 'Ветрено, прохладнее' },
            { id: 'near_water', icon: '🏞️', title: 'Рядом с водоёмом', sub: 'Влажность выше' },
            { id: 'city',       icon: '🏙️', title: 'Город',            sub: '+2–3°C тепловой остров' },
          ].map(o => (
            <button key={o.id} className={`ob-card ${d.terrain === o.id ? 'selected' : ''}`} onClick={() => set({ terrain: o.id })}>
              <span className="ob-card-icon">{o.icon}</span>
              <div><div className="ob-card-title">{o.title}</div><div className="ob-card-sub">{o.sub}</div></div>
              {d.terrain === o.id && <span className="ob-check">✓</span>}
            </button>
          ))}
        </div>
        <NavButtons onBack={back} onNext={next} onSkip={skip} />
      </div>
    </div>
  )

  // Шаг 3: Где выращиваете — несколько объектов одного типа
  if (step === 3) {
    const addObject = (type: string) => {
      const opt = GROW_OPTIONS.find(o => o.id === type)!
      const count = d.gardenObjects.filter(o => o.type === type).length
      const name = count === 0 ? opt.title : `${opt.title} ${count + 1}`
      setD(prev => ({ ...prev, gardenObjects: [...prev.gardenObjects, makeObject(type, name)] }))
    }
    const removeObject = (uid: string) => {
      setD(prev => ({
        ...prev,
        gardenObjects: prev.gardenObjects.filter(o => o.uid !== uid),
        cropEntries: prev.cropEntries.map(e => e.location === uid
          ? { ...e, location: prev.gardenObjects.find(o => o.uid !== uid)?.uid ?? '' }
          : e
        )
      }))
    }
    const renameObject = (uid: string, name: string) => {
      setD(prev => ({ ...prev, gardenObjects: prev.gardenObjects.map(o => o.uid === uid ? { ...o, name } : o) }))
    }
    return (
      <div className="screen onboarding">
        <div className="ob-bg" />
        <div className="ob-content">
          <ProgressBar step={3} total={TOTAL} />
          <div className="ob-icon">🏡</div>
          <h1>Где выращиваете?</h1>
          <p>Добавьте все объекты — теплицы, парники, грядки</p>

          {/* Добавленные объекты */}
          {d.gardenObjects.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {d.gardenObjects.map(obj => {
                const opt = GROW_OPTIONS.find(o => o.id === obj.type)!
                return (
                  <div key={obj.uid} className="ob-object-row">
                    <span className="ob-object-icon">{opt.icon}</span>
                    <input className="ob-object-name-input" value={obj.name}
                      onChange={e => renameObject(obj.uid, e.target.value)}
                      placeholder={opt.title} />
                    <button className="ob-object-del" onClick={() => removeObject(obj.uid)}>✕</button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Кнопки добавления */}
          <div className="ob-section-label">Добавить объект</div>
          <div className="ob-cards">
            {GROW_OPTIONS.map(o => (
              <button key={o.id} className="ob-card" onClick={() => addObject(o.id)}>
                <span className="ob-card-icon">{o.icon}</span>
                <div><div className="ob-card-title">{o.title}</div><div className="ob-card-sub">{o.sub}</div></div>
                <span className="ob-card-add">+</span>
              </button>
            ))}
          </div>
          <NavButtons onBack={back} onNext={next} nextDisabled={d.gardenObjects.length === 0} showSkip={false} />
        </div>
      </div>
    )
  }

  // Шаг 4: Параметры теплицы
  if (step === 4) {
    if (enclosedObjects.length === 0) { setStep(5); return null }
    const obj = enclosedObjects[objIdx] ?? enclosedObjects[0]
    const globalIdx = d.gardenObjects.findIndex(o => o.uid === obj.uid)
    const isLast = objIdx >= enclosedObjects.length - 1
    const vol = obj.length && obj.width && obj.height
      ? (parseFloat(obj.length) * parseFloat(obj.width) * parseFloat(obj.height)).toFixed(1) : null
    const goNext = () => { if (!isLast) setObjIdx(i => i + 1); else { setObjIdx(0); next() } }
    return (
      <div className="screen onboarding">
        <div className="ob-bg" />
        <div className="ob-content">
          <ProgressBar step={4} total={TOTAL} />
          <div className="ob-icon">{obj.type === 'greenhouse' ? '🏠' : '🫧'}</div>
          <h1>Параметры: {obj.name}</h1>
          {enclosedObjects.length > 1 && <p>{objIdx + 1} из {enclosedObjects.length}</p>}
          <div className="ob-section-label">Размеры (м)</div>
          <div className="ob-dims">
            {(['length', 'width', 'height'] as const).map(k => (
              <div key={k} className="ob-dim-field">
                <label>{k === 'length' ? 'Длина' : k === 'width' ? 'Ширина' : 'Высота'}</label>
                <input type="number" value={obj[k]} onChange={e => setObj(globalIdx, { [k]: e.target.value })} placeholder="0" />
              </div>
            ))}
          </div>
          {vol && <div className="ob-vol-badge">📐 Объём: {vol} м³</div>}
          <div className="ob-section-label" style={{ marginTop: 12 }}>Напоминания</div>
          <button className={`ob-toggle-row ${obj.ventilationReminders ? 'active' : ''}`}
            onClick={() => setObj(globalIdx, { ventilationReminders: !obj.ventilationReminders })}>
            <div><div className="ob-card-title">🌬️ Проветривание и закрытие</div><div className="ob-card-sub">По погоде — открыть/закрыть</div></div>
            <div className={`ob-toggle ${obj.ventilationReminders ? 'on' : ''}`} />
          </button>
          {obj.ventilationReminders && (
            <div className="ob-time-row">
              <div className="ob-time-field"><label>☀️ Утром</label>
                <input type="time" value={obj.ventilationMorning} onChange={e => setObj(globalIdx, { ventilationMorning: e.target.value })} /></div>
              <div className="ob-time-field"><label>🌙 Вечером</label>
                <input type="time" value={obj.ventilationEvening} onChange={e => setObj(globalIdx, { ventilationEvening: e.target.value })} /></div>
            </div>
          )}
          <NavButtons onBack={back} onNext={goNext} onSkip={goNext} nextLabel={isLast ? 'Далее →' : 'Следующий →'} />
        </div>
      </div>
    )
  }

  // Шаг 5: Культуры с категориями + пикер сортов
  if (step === 5) {
    const FREE_CROP_LIMIT = 10
    const obLimitReached = d.cropEntries.length >= FREE_CROP_LIMIT
    const handleCropTap = (id: string) => {
      const exists = d.cropEntries.find(e => e.id === id)
      if (exists) {
        setD(prev => ({ ...prev, cropEntries: prev.cropEntries.filter(e => e.id !== id) }))
      } else {
        if (obLimitReached) return // блокируем если лимит
        setPickerCropId(id)
      }
    }
    return (
      <div className="screen onboarding">
        <div className="ob-bg" />
        {pickerCropId && (
          <CropVarietyPickerModal
            cropId={pickerCropId}
            onConfirm={varieties => {
              if (d.cropEntries.length >= FREE_CROP_LIMIT) { setPickerCropId(null); return }
              const loc = d.gardenObjects[0]?.uid ?? 'open'
              setD(prev => ({
                ...prev,
                cropEntries: [...prev.cropEntries, {
                  id: pickerCropId, location: loc, sowDate: '', sowMethod: '',
                  status: 'planned', priority: 'extra',
                  notifs: getOps(pickerCropId).map(o => o.id), varieties,
                }]
              }))
              setPickerCropId(null)
            }}
            onClose={() => setPickerCropId(null)}
          />
        )}
        <div className="ob-content">
          <ProgressBar step={5} total={TOTAL} />
          <div className="ob-icon">🌿</div>
          <h1>Ваши культуры</h1>
          <p>Выберите всё, что планируете выращивать</p>
          {/* Счётчик и предупреждение */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', fontWeight: 700 }}>
              Выбрано: {d.cropEntries.length} / {FREE_CROP_LIMIT}
            </span>
            {obLimitReached && (
              <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>
                🔒 Лимит бесплатного плана
              </span>
            )}
          </div>
          <div className="cat-tabs">
            {CROP_CATEGORIES.map((cat, i) => (
              <button key={cat.id} className={`cat-tab ${activeCat === i ? 'active' : ''}`}
                onClick={() => setActiveCat(i)}>{cat.label}</button>
            ))}
          </div>
          <div className="ob-crops-grid">
            {CROP_CATEGORIES[activeCat].crops.map(c => {
              const sel = d.cropEntries.some(e => e.id === c.id)
              return (
                <button key={c.id}
                  className={`ob-crop-card ${sel ? 'selected' : ''} ${!sel && obLimitReached ? 'locked' : ''}`}
                  onClick={() => handleCropTap(c.id)}
                  style={!sel && obLimitReached ? { opacity: 0.4 } : {}}>
                  <div className="ob-crop-icon">{c.icon}</div>
                  <div className="ob-crop-name">{c.name}</div>
                  {sel && <div className="ob-crop-check">✓</div>}
                </button>
              )
            })}
          </div>
          <NavButtons onBack={back} onNext={next} nextDisabled={d.cropEntries.length === 0} showSkip={false} />
        </div>
      </div>
    )
  }

  // Шаг 6: Где растёт каждая
  if (step === 6) return (
    <div className="screen onboarding">
      <div className="ob-bg" />
      <div className="ob-content">
        <ProgressBar step={6} total={TOTAL} />
        <div className="ob-icon">📍</div>
        <h1>Где растёт каждая?</h1>
        <p>Место, статус и дата высадки</p>
        <div className="ob-scroll-list">
          {d.cropEntries.map(entry => {
            const crop = CROPS.find(c => c.id === entry.id)!
            return (
              <div key={entry.id} className="ob-sow-block">
                <div className="ob-crop-notif-header">
                  <span>{crop.icon}</span><span className="ob-priority-name">{crop.name}</span>
                  {entry.varieties.length > 0 && <span className="ob-loc-badge" style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{entry.varieties.map(v => v.name).join(', ')}</span>}
                </div>
                <div className="ob-chips" style={{ marginBottom: 8 }}>
                  <button className={`ob-chip ${entry.status === 'planned' ? 'selected' : ''}`}
                    onClick={() => updateEntry(entry.id, { status: 'planned' })}>📋 Готовлюсь</button>
                  <button className={`ob-chip ${entry.status === 'planted' ? 'selected' : ''}`}
                    onClick={() => updateEntry(entry.id, { status: 'planted' })}>✅ Уже посадил</button>
                </div>
                {d.gardenObjects.length > 1 && (
                  <div className="ob-chips" style={{ marginBottom: 8 }}>
                    {d.gardenObjects.map(obj => {
                      const opt = GROW_OPTIONS.find(o => o.id === obj.type)!
                      return (
                        <button key={obj.uid} className={`ob-chip ${entry.location === obj.uid ? 'selected' : ''}`}
                          onClick={() => updateEntry(entry.id, { location: obj.uid })}>
                          {opt.icon} {opt.title}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="ob-sow-row">
                  <div className="ob-dim-field" style={{ flex: 2 }}>
                    <label>📅 Дата посева</label>
                    <input type="date" value={entry.sowDate} onChange={e => updateEntry(entry.id, { sowDate: e.target.value })} />
                  </div>
                  <div style={{ flex: 3, display: 'flex', gap: 6 }}>
                    <button className={`ob-chip ${entry.sowMethod === 'seeds' ? 'selected' : ''}`}
                      style={{ flex: 1 }} onClick={() => updateEntry(entry.id, { sowMethod: 'seeds' })}>🌱 Семена</button>
                    <button className={`ob-chip ${entry.sowMethod === 'seedling' ? 'selected' : ''}`}
                      style={{ flex: 1 }} onClick={() => updateEntry(entry.id, { sowMethod: 'seedling' })}>🪴 Рассада</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <NavButtons onBack={back} onNext={next} onSkip={skip} />
      </div>
    </div>
  )

  // Шаг 7: Почва по каждому объекту
  if (step === 7) {
    const curObj = d.gardenObjects[objIdx] ?? d.gardenObjects[0]
    if (!curObj) { next(); return null }
    const globalIdx = d.gardenObjects.findIndex(o => o.uid === curObj.uid)
    const isEnclosed = curObj.type === 'greenhouse' || curObj.type === 'hotbed'
    const isLast = objIdx >= d.gardenObjects.length - 1
    const goNext = () => { if (!isLast) setObjIdx(i => i + 1); else { setObjIdx(0); next() } }
    return (
      <div className="screen onboarding">
        <div className="ob-bg" />
        <div className="ob-content">
          <ProgressBar step={7} total={TOTAL} />
          <div className="ob-icon">🌍</div>
          <h1>Почва: {curObj.name}</h1>
          {d.gardenObjects.length > 1 && <p>{objIdx + 1} из {d.gardenObjects.length}</p>}
          {isEnclosed ? (
            <div className="ob-chips" style={{ flexDirection: 'column', gap: 8 }}>
              {['🌱 Земля + торф + песок (1:1:1)', '🌿 Земля + перегной (1:1)', '🥥 Кокосовый субстрат', '💧 Гидропоника', '🤷 Не знаю'].map(s => (
                <button key={s} className={`ob-list-item ${curObj.substrate === s ? 'selected' : ''}`}
                  onClick={() => setObj(globalIdx, { substrate: s })}>
                  {s}{curObj.substrate === s && <span className="ob-check">✓</span>}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="ob-cards">
                {[
                  { id: 'loam', icon: '🟫', title: 'Суглинок', sub: 'Средний, универсальный' },
                  { id: 'clay', icon: '🔴', title: 'Глинистая', sub: 'Тяжёлая, плохой дренаж' },
                  { id: 'sandy', icon: '🟡', title: 'Песчаная', sub: 'Лёгкая, быстро сохнет' },
                  { id: 'peat', icon: '🟤', title: 'Торфяная', sub: 'Кислая, влагоёмкая' },
                  { id: 'black', icon: '⚫', title: 'Чернозём', sub: 'Богатая, плодородная' },
                ].map(o => (
                  <button key={o.id} className={`ob-card ${curObj.soilType === o.id ? 'selected' : ''}`}
                    onClick={() => setObj(globalIdx, { soilType: o.id })}>
                    <span className="ob-card-icon">{o.icon}</span>
                    <div><div className="ob-card-title">{o.title}</div><div className="ob-card-sub">{o.sub}</div></div>
                    {curObj.soilType === o.id && <span className="ob-check">✓</span>}
                  </button>
                ))}
              </div>
              <button className={`ob-toggle-row ${curObj.drainageIssue ? 'active' : ''}`}
                onClick={() => setObj(globalIdx, { drainageIssue: !curObj.drainageIssue })}>
                <div><div className="ob-card-title">💦 Стоит вода после дождя</div><div className="ob-card-sub">Дадим советы по дренажу</div></div>
                <div className={`ob-toggle ${curObj.drainageIssue ? 'on' : ''}`} />
              </button>
            </>
          )}
          <NavButtons onBack={back} onNext={goNext} onSkip={goNext} nextLabel={isLast ? 'Далее →' : 'Следующий →'} />
        </div>
      </div>
    )
  }

  // Шаг 8: Опыт
  if (step === 8) return (
    <div className="screen onboarding">
      <div className="ob-bg" />
      <div className="ob-content">
        <ProgressBar step={8} total={TOTAL} />
        <div className="ob-icon">👤</div>
        <h1>Ваш опыт</h1>
        <p>Подберём нужный уровень детализации советов</p>
        <div className="ob-cards">
          {[
            { id: 'beginner', icon: '🌱', title: 'Новичок', sub: 'Полные советы с объяснениями' },
            { id: 'amateur', icon: '🌿', title: 'Любитель', sub: 'Советы без лишних объяснений' },
            { id: 'experienced', icon: '🧑‍🌾', title: 'Опытный', sub: 'Только напоминания и аномалии' },
            { id: 'expert', icon: '🏆', title: 'Эксперт', sub: 'Только критичные алерты' },
          ].map(o => (
            <button key={o.id} className={`ob-card ${d.experience === o.id ? 'selected' : ''}`} onClick={() => set({ experience: o.id })}>
              <span className="ob-card-icon">{o.icon}</span>
              <div><div className="ob-card-title">{o.title}</div><div className="ob-card-sub">{o.sub}</div></div>
              {d.experience === o.id && <span className="ob-check">✓</span>}
            </button>
          ))}
        </div>
        <NavButtons onBack={back} onNext={next} nextDisabled={!d.experience} showSkip={false} />
      </div>
    </div>
  )

  // Шаг 9: Инструменты + уведомления
  if (step === 9) return (
    <div className="screen onboarding">
      <div className="ob-bg" />
      <div className="ob-content">
        <ProgressBar step={9} total={TOTAL} />
        <div className="ob-icon">🛠️</div>
        <h1>Ваши возможности</h1>
        <p>Советы будут под то, что реально есть</p>
        <div className="ob-chips ob-chips-wrap">
          {['💧 Капельный полив', '🌾 Мульча', '♻️ Компост', '🧴 Удобрения', '🌡️ Термометр', '💊 Фунгициды', '🐛 Инсектициды', '📏 pH-метр'].map(t => {
            const sel = d.tools.includes(t)
            return <button key={t} className={`ob-chip ${sel ? 'selected' : ''}`}
              onClick={() => set({ tools: sel ? d.tools.filter(x => x !== t) : [...d.tools, t] })}>{t}</button>
          })}
        </div>
        <div className="ob-section-label" style={{ marginTop: 16 }}>Когда присылать советы?</div>
        <div className="ob-time-row" style={{ marginBottom: 16 }}>
          <div className="ob-time-field"><label>☀️ Утром</label><input type="time" value={d.notifMorning} onChange={e => set({ notifMorning: e.target.value })} /></div>
          <div className="ob-time-field"><label>🌙 Вечером</label><input type="time" value={d.notifEvening} onChange={e => set({ notifEvening: e.target.value })} /></div>
        </div>
        <div className="ob-section-label">Куда отправлять?</div>
        <div className="ob-chips ob-chips-wrap" style={{ marginBottom: 16 }}>
          {NOTIF_CHANNELS.map(ch => {
            const sel = d.notifChannels.includes(ch.id)
            return <button key={ch.id} className={`ob-chip ${sel ? 'selected' : ''}`}
              onClick={() => set({ notifChannels: sel ? d.notifChannels.filter(x => x !== ch.id) : [...d.notifChannels, ch.id] })}>
              {ch.icon} {ch.label}
            </button>
          })}
        </div>
        <div className="ob-section-label">Уровень уведомлений</div>
        <div className="ob-cards">
          {[
            { id: 'critical', icon: '⚠️', title: 'Только критичные', sub: 'Заморозки, болезни, ЧП' },
            { id: 'standard', icon: '🔔', title: 'Стандарт', sub: 'Полив, подкормка, проветривание' },
            { id: 'max', icon: '📬', title: 'Максимум', sub: 'Ежедневные советы по каждой культуре' },
          ].map(o => (
            <button key={o.id} className={`ob-card ${d.notifLevel === o.id ? 'selected' : ''}`} onClick={() => set({ notifLevel: o.id })}>
              <span className="ob-card-icon">{o.icon}</span>
              <div><div className="ob-card-title">{o.title}</div><div className="ob-card-sub">{o.sub}</div></div>
              {d.notifLevel === o.id && <span className="ob-check">✓</span>}
            </button>
          ))}
        </div>
        <NavButtons onBack={back} onNext={next} showSkip={false} />
      </div>
    </div>
  )

  // Шаг 10: Уведомления по культурам
  if (step === 10) return (
    <div className="screen onboarding">
      <div className="ob-bg" />
      <div className="ob-content">
        <ProgressBar step={10} total={TOTAL} />
        <div className="ob-icon">🌱</div>
        <h1>Уведомления по культурам</h1>
        <p>Настройте для каждой что важно</p>
        <div className="ob-scroll-list">
          {d.cropEntries.map(entry => {
            const crop = CROPS.find(c => c.id === entry.id)!
            const locObj = d.gardenObjects.find(o => o.uid === entry.location)
            const isEnclosed = locObj?.type === 'greenhouse' || locObj?.type === 'hotbed'
            const ops = getOps(entry.id)
            const opList = isEnclosed ? [...ops, { id: 'ventilation', label: '🏠 Проветривание' }] : ops
            return (
              <div key={entry.id} className="ob-crop-notif">
                <div className="ob-crop-notif-header">
                  <span>{crop.icon}</span>
                  <span className="ob-priority-name">{crop.name}</span>
                  {locObj && <span className="ob-loc-badge">{GROW_OPTIONS.find(o => o.id === locObj.type)?.icon}</span>}
                </div>
                <div className="ob-notif-toggles">
                  {opList.map(op => {
                    const isOn = entry.notifs.includes(op.id)
                    const isCritical = op.id === 'disease'
                    return (
                      <div key={op.id} className="ob-notif-toggle-row">
                        <span className="ob-notif-label">{op.label}</span>
                        <button className={`ob-toggle ${isOn ? 'on' : ''} ${isCritical ? 'locked' : ''}`}
                          onClick={() => {
                            if (isCritical) return
                            setD(prev => ({ ...prev, cropEntries: prev.cropEntries.map(e => e.id === entry.id ? { ...e, notifs: isOn ? e.notifs.filter(x => x !== op.id) : [...e.notifs, op.id] } : e) }))
                          }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="ob-hint">⚠️ Болезни и заморозки нельзя отключить</div>
        <NavButtons onBack={back} onNext={next} onSkip={skip} />
      </div>
    </div>
  )

  // Финал
  return (
    <div className="screen onboarding">
      <div className="ob-bg" />
      <div className="ob-content ob-content-center">
        <div style={{ fontSize: 80, marginBottom: 24 }}>🎉</div>
        <h1>Всё готово!</h1>
        <p style={{ marginBottom: 32 }}>Агроном знает ваш огород. Первый совет придёт в {d.notifMorning} 🌅</p>
        <div className="ob-summary">
          {d.city && <div className="ob-summary-item">🗺️ {d.city}</div>}
          {d.gardenObjects.map(o => <div key={o.uid} className="ob-summary-item">{GROW_OPTIONS.find(g => g.id === o.type)?.icon} {o.name}</div>)}
          <div className="ob-summary-item">🌿 {d.cropEntries.length} культур</div>
        </div>
        <button className="btn-primary btn-full" style={{ marginTop: 24 }} onClick={() => onDone(d)}>
          Открыть огород 🌱
        </button>
      </div>
    </div>
  )
}

const CROP_LIMITS: Record<Plan, number> = { free: 10, base: 15, pro: 999 }

// ─── Экран: Растения ───────────────────────────────────────────────
function PlantsScreen({ data, plan, onUpdateEntry, onAddEntry, onDeleteEntry, vkUserId }: {
  data: OnboardingData
  plan: Plan
  onUpdateEntry: (id: string, patch: Partial<CropEntry>) => void
  onAddEntry: (entry: CropEntry) => void
  onDeleteEntry: (id: string) => void
  vkUserId: number
}) {
  const [editEntry, setEditEntry] = useState<CropEntry | null>(null)
  const [showDiaryAdd, setShowDiaryAdd] = useState(false)
  const [diaryCropId, setDiaryCropId] = useState<string>('')
  const [diaryText, setDiaryText] = useState('')
  const [diaryOp, setDiaryOp] = useState('')
  const [diarySaving, setDiarySaving] = useState(false)
  const [showAddCrop, setShowAddCrop] = useState(false)
  const [pickerCropId, setPickerCropId] = useState<string | null>(null)
  const [activeCat, setActiveCat] = useState(0)
  const weather = useWeather(data.city)
  const [plantsTab, setPlantsTab] = useState<'plants' | 'compat' | 'disease'>('plants')
  const risks = weather.loading || weather.error ? [] : getWeatherRisks(weather.temp, weather.humidity, data.cropEntries)

  const existingIds = data.cropEntries.map(e => e.id)
  const cropLimit = CROP_LIMITS[plan]
  const cropLimitReached = data.cropEntries.length >= cropLimit

  async function handleDiarySave() {
    if (!diaryText.trim()) return
    setDiarySaving(true)
    await addDiaryEntry(vkUserId, diaryCropId || null, diaryOp || null, diaryText)
    setDiaryText(''); setDiaryOp(''); setDiaryCropId(''); setShowDiaryAdd(false); setDiarySaving(false)
  }

  return (
    <div className="tab-content">
      {showDiaryAdd && (
        <div className="modal-overlay" onClick={() => setShowDiaryAdd(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">📝 Запись в дневник</span>
              <button className="modal-close" onClick={() => setShowDiaryAdd(false)}>✕</button>
            </div>
            {diaryCropId && (
              <>
                <div className="modal-section-label">Операция</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {getOps(diaryCropId).map(op => (
                    <button key={op.id} className={`ob-chip ${diaryOp === op.id ? 'selected' : ''}`}
                      onClick={() => setDiaryOp(diaryOp === op.id ? '' : op.id)}>{op.label}</button>
                  ))}
                </div>
              </>
            )}
            <div className="modal-section-label">Заметка</div>
            <textarea
              style={{ width: '100%', minHeight: 80, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 10, color: '#fff', fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
              placeholder="Что сделали, что заметили..."
              value={diaryText}
              onChange={e => setDiaryText(e.target.value)}
            />
            <button className="btn-primary btn-full" style={{ marginTop: 12 }} onClick={handleDiarySave} disabled={diarySaving || !diaryText.trim()}>
              {diarySaving ? 'Сохраняю...' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}
      {editEntry && (
        <CropEditModal
          entry={editEntry}
          gardenObjects={data.gardenObjects}
          plan={plan}
          onSave={e => { onUpdateEntry(e.id, e); setEditEntry(null) }}
          onDelete={() => { onDeleteEntry(editEntry.id); setEditEntry(null) }}
          onClose={() => setEditEntry(null)}
          onAddDiary={(cropId) => { setDiaryCropId(cropId); setEditEntry(null); setShowDiaryAdd(true) }}
        />
      )}

      {/* Модалка добавления культуры */}
      {showAddCrop && !pickerCropId && (
        <div className="modal-overlay" onClick={() => setShowAddCrop(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">Добавить культуру</span>
              <button className="modal-close" onClick={() => setShowAddCrop(false)}>✕</button>
            </div>
            {cropLimitReached ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                  Лимит культур достигнут
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 16 }}>
                  {plan === 'free'
                    ? `Бесплатно — ${cropLimit} культур. Перейдите на Базовую (15 культур)`
                    : `Базовая — ${cropLimit} культур. Перейдите на Про для неограниченного количества`}
                </div>
                <button className="btn-upgrade" onClick={() => setShowAddCrop(false)}>Посмотреть тарифы</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', textAlign: 'center', marginBottom: 10 }}>
                  {data.cropEntries.length} из {cropLimit === 999 ? '∞' : cropLimit} культур
                </div>
                <div className="cat-tabs">
                  {CROP_CATEGORIES.map((cat, i) => (
                    <button key={cat.id} className={`cat-tab ${activeCat === i ? 'active' : ''}`}
                      onClick={() => setActiveCat(i)}>{cat.label}</button>
                  ))}
                </div>
                <div className="add-crop-grid">
                  {CROP_CATEGORIES[activeCat].crops.filter(c => !existingIds.includes(c.id)).map(c => (
                    <button key={c.id} className="ob-crop-card" onClick={() => setPickerCropId(c.id)}>
                      <div className="ob-crop-icon">{c.icon}</div>
                      <div className="ob-crop-name">{c.name}</div>
                    </button>
                  ))}
                  {CROP_CATEGORIES[activeCat].crops.filter(c => !existingIds.includes(c.id)).length === 0 && (
                    <div className="empty-hint" style={{ gridColumn: '1/-1' }}>Все культуры этой категории добавлены</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {pickerCropId && !cropLimitReached && (
        <CropVarietyPickerModal
          cropId={pickerCropId}
          plan={plan}
          onConfirm={varieties => {
            const loc = data.gardenObjects[0]?.uid ?? 'open'
            const newEntry: CropEntry = { id: pickerCropId, location: loc, sowDate: '', sowMethod: '', status: 'planned', priority: 'extra', notifs: getOps(pickerCropId).map(o => o.id), varieties }
            onAddEntry(newEntry)
            setPickerCropId(null)
            setShowAddCrop(false)
            setTimeout(() => setEditEntry(newEntry), 50)
          }}
          onClose={() => { setPickerCropId(null) }}
        />
      )}

      {/* Погода */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px 4px', overflowX: 'auto' }}>
        <button className={`ob-chip ${plantsTab === 'plants' ? 'selected' : ''}`} onClick={() => setPlantsTab('plants')}>🌱 Огород</button>
        <button className={`ob-chip ${plantsTab === 'compat' ? 'selected' : ''}`} onClick={() => setPlantsTab('compat')}>🤝 Совместимость</button>
        <button className={`ob-chip ${plantsTab === 'disease' ? 'selected' : ''}`} onClick={() => setPlantsTab('disease')}>⚠️ Болезни</button>
      </div>

      {plantsTab === 'compat' && <CompatScreen cropEntries={data.cropEntries} />}
      {plantsTab === 'disease' && <DiseaseScreen cropEntries={data.cropEntries} city={data.city} />}
      {plantsTab === 'plants' && <div>
      <div className="weather-card">
        {weather.loading ? (
          <div className="weather-loading">Загружаем погоду...</div>
        ) : weather.error ? (
          <div className="weather-loading">Погода недоступна</div>
        ) : (
          <div className="weather-row">
            <div className="weather-main">
              <span className="weather-icon">{weather.icon}</span>
              <div>
                <div className="weather-temp">{weather.temp > 0 ? '+' : ''}{weather.temp}°C</div>
                <div className="weather-desc">{weather.desc}</div>
                <div className="weather-loc">{data.city}</div>
              </div>
            </div>
            <div className="weather-extra">
              <div className="weather-detail">💧 {weather.humidity}%</div>
              <div className="weather-detail">💨 {weather.wind} м/с</div>
            </div>
          </div>
        )}
        {!weather.loading && !weather.error && risks.length > 0 && (
          <div className="weather-risks" style={{ marginTop: 10 }}>
            {risks.map((r, i) => <div key={i} className={`risk-badge risk-${r.type}`}>{r.text}</div>)}
          </div>
        )}
      </div>

      {/* Сегодня сделать */}
      {data.cropEntries.filter(e => e.status === 'planted').length > 0 && (
        <>
          <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>📅 Сегодня сделать</div>
          <div className="ops-list">
            {data.cropEntries.filter(e => e.status === 'planted').slice(0, 5).map(entry => {
              const crop = CROPS.find(c => c.id === entry.id)
              if (!crop) return null
              return (
                <div key={entry.id} className="op-row" onClick={() => setEditEntry(entry)}>
                  <span className="op-icon">{crop.icon}</span>
                  <div className="op-info">
                    <div className="op-name">{crop.name}{entry.varieties.length > 0 ? ` · ${entry.varieties[0].name}` : ''}</div>
                    <div className="op-action">{getFirstOp(entry.id)}</div>
                  </div>
                  <button className="btn-done-sm">✓</button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Секции по объектам */}
      {data.gardenObjects.map(obj => {
        const opt = GROW_OPTIONS.find(o => o.id === obj.type)!
        const objCrops = data.cropEntries.filter(e => e.location === obj.uid)
        const soilLabel = SOIL_LABELS[obj.soilType] || SOIL_LABELS[obj.substrate] || ''
        return (
          <div key={obj.uid} className="garden-section">
            <div className="garden-section-header">
              <span className="garden-section-icon">{opt.icon}</span>
              <div>
                <div className="garden-section-title">{opt.title}</div>
                {soilLabel && <div className="garden-section-sub">{soilLabel}</div>}
              </div>
              <span className="garden-section-count">{objCrops.length} культур</span>
            </div>
            <div className="crops-dashboard">
              {objCrops.map(entry => {
                const crop = CROPS.find(c => c.id === entry.id)
                if (!crop) return null
                const days = daysSince(entry.sowDate)
                const totalDays = (entry.varieties[0]?.days) ?? CROP_DAYS[entry.id] ?? 90
                const perennial = isPerennial(entry.id)
                const stage = perennial ? '🌿 Многолетник' : entry.status === 'planted' ? getCropStage(days, totalDays) : '📋 Планируется'
                const pct = !perennial && days >= 0 && entry.status === 'planted' ? Math.min(100, (days / totalDays) * 100) : 0
                const daysLeft = !perennial && entry.status === 'planted' && days >= 0 ? Math.max(0, totalDays - days) : null
                return (
                  <button key={entry.id} className="crop-dash-card" onClick={() => { setShowAddCrop(false); setPickerCropId(null); setEditEntry(entry) }}>
                    <div className="crop-dash-top">
                      <span className="crop-dash-icon">{crop.icon}</span>
                    </div>
                    <div className="crop-dash-name">{crop.name}</div>
                    {entry.varieties.length > 0 && <div className="crop-dash-variety">{entry.varieties[0].name}</div>}
                    <div className={`crop-dash-stage ${entry.status === 'planned' ? 'planned' : ''}`}>{stage}</div>
                    {daysLeft !== null && <div className="crop-dash-days">{daysLeft === 0 ? '🎉 Готов!' : `${daysLeft}д`}</div>}
                    {!perennial && <div className="crop-dash-bar"><div className="crop-dash-fill" style={{ width: `${pct}%` }} /></div>}
                    {entry.varieties.length > 1 && entry.status === 'planted' && entry.sowDate && !perennial && (
                      <div className="crop-variety-bars">
                        {entry.varieties.map((v, vi) => {
                          const vDays = v.days ?? totalDays
                          const vPct = Math.min(100, (days / vDays) * 100)
                          const vLeft = Math.max(0, vDays - days)
                          return (
                            <div key={vi} className="crop-variety-bar-row">
                              <span className="crop-variety-bar-name">{v.name}</span>
                              <div className="crop-variety-bar-track"><div className="crop-variety-bar-fill" style={{ width: `${vPct}%` }} /></div>
                              <span className="crop-variety-bar-days">{vLeft === 0 ? '✓' : `${vLeft}д`}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </button>
                )
              })}
              <button className="crop-dash-add" onClick={() => {
                if (cropLimitReached) { setShowAddCrop(true) } else { setShowAddCrop(true) }
              }}>
                <div style={{ fontSize: cropLimitReached ? 16 : 24 }}>{cropLimitReached ? '🔒' : '＋'}</div>
                <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{cropLimitReached ? `${cropLimit} макс` : 'Добавить'}</div>
              </button>
            </div>
          </div>
        )
      })}

      {data.gardenObjects.length === 0 && data.cropEntries.length === 0 && (
        <div className="empty-hint">Пройдите настройку огорода чтобы добавить культуры</div>
      )}
      </div>}
    </div>
  )
}

// ─── Экран: Луна ───────────────────────────────────────────────────
// ─── Недельный план (AI) ───────────────────────────────────────────
interface WeekTask { crop: string; action: string; reason: string }
interface WeekDay { date: string; tasks: WeekTask[] }

function useWeeklyPlan(vkUserId: number, enabled: boolean): { days: WeekDay[]; loading: boolean; error: boolean } {
  const [state, setState] = useState<{ days: WeekDay[]; loading: boolean; error: boolean }>({ days: [], loading: false, error: false })

  useEffect(() => {
    if (!enabled || !vkUserId) return
    setState(p => ({ ...p, loading: true }))
    fetch('https://garden-agent.gorant1991.workers.dev/weekly-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vk_user_id: vkUserId }),
    })
      .then(r => r.json())
      .then((d: any) => setState({ days: d.plan || [], loading: false, error: false }))
      .catch(() => setState(p => ({ ...p, loading: false, error: true })))
  }, [vkUserId, enabled])

  return state
}

function MoonScreen({ plan, city, vkUserId }: { plan: Plan; city: string; vkUserId: number }) {
  const moon = useMoon()
  const forecast = useForecast(city)
  const weekPlan = useWeeklyPlan(vkUserId, true)
  const phaseName = MOON_PHASE_NAMES[moon.phase] ?? moon.phase
  const good = MOON_GOOD[moon.phase] ?? 'Полив, уход за растениями'
  const bad = MOON_BAD[moon.phase] ?? 'Обрезка'

  return (
    <div className="tab-content">
      <div className="moon-header">
        <div className="moon-big">{moon.loading ? '🌙' : phaseName.split(' ')[0]}</div>
        <div className="moon-sign">{moon.loading ? 'Загрузка...' : phaseName}</div>
        <div className="moon-day">{moon.loading ? '' : `${moon.age}-й лунный день · ${moon.illumination}%`}</div>
        {moon.dayStart && moon.dayEnd && (
          <div className="moon-day-time">
            {moon.dayStart.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} — {moon.dayEnd.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
      <div className="moon-card">
        <div className="moon-card-title">✅ Благоприятно сегодня</div>
        <div className="moon-card-body">{moon.loading ? '...' : good}</div>
      </div>
      <div className="moon-card moon-card-warn">
        <div className="moon-card-title">❌ Не рекомендуется</div>
        <div className="moon-card-body">{moon.loading ? '...' : bad}</div>
      </div>

      {/* Недельный план */}
      {(plan === 'base' || plan === 'pro') ? (
      <div className="moon-card" style={{ marginTop: 10 }}>
        <div className="moon-card-title">📅 План на неделю</div>
        {weekPlan.loading && <div className="moon-card-body">Составляю план...</div>}
        {weekPlan.error && <div className="moon-card-body" style={{ color: '#f87171' }}>Не удалось загрузить план</div>}
        {!weekPlan.loading && !weekPlan.error && weekPlan.days.length === 0 && (
          <div className="moon-card-body" style={{ color: '#64748b' }}>Добавьте посаженные культуры чтобы получить план</div>
        )}
        {weekPlan.days.map(day => {
          const d = new Date(day.date)
          const label = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
          const cropName = (id: string) => {
            const names: Record<string,string> = {
              tomato:'Томат', cucumber:'Огурец', pepper:'Перец', eggplant:'Баклажан',
              zucchini:'Кабачок', pumpkin:'Тыква', cabbage:'Капуста', onion:'Лук',
              garlic:'Чеснок', corn:'Кукуруза', pea:'Горох', carrot:'Морковь',
              potato:'Картофель', beet:'Свёкла', radish:'Редис', turnip:'Репа',
              daikon:'Дайкон', parsnip:'Пастернак', celery_root:'Сельдерей',
              dill:'Укроп', parsley:'Петрушка', lettuce:'Салат', spinach:'Шпинат',
              arugula:'Руккола', basil:'Базилик', strawberry:'Клубника',
              raspberry:'Малина', currant:'Смородина', gooseberry:'Крыжовник',
              blackberry:'Ежевика', blueberry:'Голубика', honeysuckle:'Жимолость',
              seabuckthorn:'Облепиха', mint:'Мята', melissa:'Мелисса',
              tarragon:'Эстрагон', sorrel:'Щавель',
            }
            return names[id] ?? id
          }
          return (
            <div key={day.date} className="week-day-row">
              <div className="week-day-label">{label}</div>
              {day.tasks.length === 0
                ? <div className="week-day-rest">Отдых 🌿</div>
                : day.tasks.map((t, i) => (
                  <div key={i} className="week-task">
                    <span className="week-task-action">{t.action}</span>
                    <span className="week-task-crop">{cropName(t.crop)}</span>
                    {t.reason && <span className="week-task-reason">{t.reason}</span>}
                  </div>
                ))
              }
            </div>
          )
        })}
      </div>
      ) : (
        <div className="plan-promo">
          <div className="plan-promo-icon">📅</div>
          <div><div className="plan-promo-title">План на неделю</div><div className="plan-promo-sub">Доступно в тарифе Базовая — 150 ₽/мес</div></div>
          <button className="btn-upgrade">Подключить</button>
        </div>
      )}

      {(plan === 'base' || plan === 'pro') ? (
        forecast.loading ? (
          <div className="moon-card"><div className="moon-card-body">Загрузка прогноза...</div></div>
        ) : forecast.error ? (
          <div className="moon-card moon-card-warn"><div className="moon-card-body">Прогноз недоступен — проверьте город в профиле</div></div>
        ) : (
          <div className="moon-card">
            <div className="moon-card-title">🌤️ Прогноз на 7 дней</div>
            <div className="forecast-grid">
              {forecast.days.map(day => (
                <div key={day.date} className="forecast-day">
                  <div className="forecast-date">{new Date(day.date).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}</div>
                  <div className="forecast-icon">{day.icon}</div>
                  <div className="forecast-temp">{day.tempMax}° / {day.tempMin}°</div>
                  <div className="forecast-desc">{day.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="plan-promo">
          <div className="plan-promo-icon">🌿</div>
          <div><div className="plan-promo-title">Прогноз на 7 дней</div><div className="plan-promo-sub">Доступно в тарифе Базовая — 150 ₽/мес</div></div>
          <button className="btn-upgrade">Подключить</button>
        </div>
      )}
    </div>
  )
}

// ─── FAQ ───────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  { q: 'Как добавить культуру?', a: 'Перейдите на вкладку "Растения" → нажмите "+" в нужном разделе → выберите культуру → выберите сорта или пропустите.' },
  { q: 'Почему погода недоступна?', a: 'Проверьте название города в профиле — оно должно быть написано правильно, на русском или английском. Например: "Коряжма" или "Arkhangelsk".' },
  { q: 'Как работает прогресс созревания?', a: 'Прогресс считается от даты посева до ожидаемого срока сбора. Для каждого сорта свой срок — он указан рядом с названием в днях.' },
  { q: 'Как изменить город или опыт?', a: 'Перейдите в "Профиль" → нажмите на строку города или опыта — они редактируемые.' },
  { q: 'Чем отличаются тарифы?', a: 'Бесплатно: до 10 культур, 1 объект, критичные уведомления. Базовая (150₽): до 15 культур, прогноз 7 дней, лунный календарь. Про (300₽): без ограничений, свои растения, рекомендации совместимости.' },
  { q: 'Как удалить растение?', a: 'Нажмите на карточку культуры в огороде → прокрутите вниз → "Удалить из огорода".' },
  { q: 'Как отключить уведомления по конкретной культуре?', a: 'Нажмите на карточку культуры → раздел "Уведомления" → отключите нужные тоглы. Болезни отключить нельзя.' },
  { q: 'Что такое многолетние культуры?', a: 'Малина, смородина, клубника и другие кустарники и травы — они растут несколько лет. Для них не считаются дни роста, только сезонные операции.' },
  { q: 'Можно ли добавить свой сорт?', a: 'Да — при редактировании культуры нажмите "+ Свой сорт" и введите название вручную.' },
  { q: 'Агроном не отвечает, что делать?', a: 'Проверьте интернет-соединение. Если проблема сохраняется — напишите нам в группу ВКонтакте.' },
  { q: 'Как сохранить сезон?', a: 'Перейдите в Профиль → раздел "История сезонов" → нажмите "Сохранить сезон". Снимок вашего огорода сохранится в облаке. В конце сезона нажмите "Обновить сезон" чтобы зафиксировать итог.' },
  { q: 'Куда сохраняется дневник?', a: 'Все записи дневника хранятся в облаке — они доступны с любого устройства и не пропадут при переустановке. Посмотреть записи можно в Профиль → Дневник.' },
  { q: 'Как добавить запись в дневник?', a: 'Два способа: 1) Профиль → Дневник → "Новая запись". 2) Растения → нажмите на культуру → "📝 Добавить в дневник". Второй способ удобнее — операция подставится автоматически.' },
  { q: 'Как скачать отчёт об огороде?', a: 'Профиль → "📤 Экспорт данных" → выберите формат. CSV открывается в Excel для анализа. HTML-отчёт открывается в браузере — красивые таблицы на русском. Для PDF нажмите Ctrl+P в браузере → "Сохранить как PDF".' },
  { q: 'Что происходит с данными при смене тарифа?', a: 'Данные не удаляются никогда. Если культур или объектов больше лимита нового тарифа — они остаются, но добавить новые будет нельзя пока не удалите лишние.' },
  { q: 'Как работает лунный календарь?', a: 'Приложение рассчитывает фазу луны автоматически по астрономической формуле — без интернета, точность ±1 день. Показывает номер лунного дня, освещённость и время начала/конца текущего дня.' },
  { q: 'Что означает прогноз на 7 дней?', a: 'Доступно на тарифах Базовая и Про. Показывает температуру и погоду на неделю вперёд на вкладке Луна. Данные берутся из OpenWeatherMap по вашему городу.' },
]

// ─── Экран: Профиль ────────────────────────────────────────────────
// ─── ЭКРАН СОВМЕСТИМОСТИ ──────────────────────────────────────────
function CompatScreen({ cropEntries }: { cropEntries: CropEntry[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const planted = cropEntries.filter(e => e.status === 'planted')
  const myIds = planted.map(e => e.id)

  const compat = selected ? CROP_COMPAT[selected] : null
  const goodInGarden = compat ? myIds.filter(id => id !== selected && compat.good.includes(id)) : []
  const badInGarden = compat ? myIds.filter(id => id !== selected && compat.bad.includes(id)) : []
  const goodOther = compat ? compat.good.filter(id => !myIds.includes(id)) : []

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        Выберите культуру чтобы увидеть с чем она дружит
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {planted.map(e => {
          const crop = CROPS.find(c => c.id === e.id)
          return (
            <button key={e.id} className={`ob-chip ${selected === e.id ? 'selected' : ''}`}
              onClick={() => setSelected(selected === e.id ? null : e.id)}>
              {crop?.icon} {crop?.name}
            </button>
          )
        })}
      </div>

      {selected && compat && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {goodInGarden.length > 0 && (
            <div className="compat-card compat-good">
              <div className="compat-title">✅ Хорошие соседи (уже в огороде)</div>
              <div className="compat-crops">
                {goodInGarden.map(id => {
                  const c = CROPS.find(x => x.id === id)
                  return <span key={id} className="compat-tag good">{c?.icon} {c?.name}</span>
                })}
              </div>
            </div>
          )}
          {badInGarden.length > 0 && (
            <div className="compat-card compat-bad">
              <div className="compat-title">⚠️ Плохие соседи (уже в огороде)</div>
              <div className="compat-crops">
                {badInGarden.map(id => {
                  const c = CROPS.find(x => x.id === id)
                  return <span key={id} className="compat-tag bad">{c?.icon} {c?.name}</span>
                })}
              </div>
              <div style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>Попробуйте разместить их подальше друг от друга</div>
            </div>
          )}
          {goodOther.length > 0 && (
            <div className="compat-card" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="compat-title" style={{ color: '#94a3b8' }}>💡 Хорошие соседи (можно добавить)</div>
              <div className="compat-crops">
                {goodOther.map(id => {
                  const c = CROPS.find(x => x.id === id)
                  return <span key={id} className="compat-tag neutral">{c?.icon} {c?.name}</span>
                })}
              </div>
            </div>
          )}
          {goodInGarden.length === 0 && badInGarden.length === 0 && (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 16, fontSize: 13 }}>
              Среди ваших культур нет явных друзей или врагов для этой культуры
            </div>
          )}
        </div>
      )}
      {planted.length === 0 && (
        <div style={{ textAlign: 'center', color: '#555', padding: 24, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🌱</div>
          Сначала посадите культуры — тогда увидите совместимость
        </div>
      )}
    </div>
  )
}

// ─── МАТРИЦА БОЛЕЗНЕЙ ──────────────────────────────────────────────
function DiseaseScreen({ cropEntries, city }: { cropEntries: CropEntry[]; city: string }) {
  const weather = useWeather(city)
  const myIds = cropEntries.filter(e => e.status === 'planted').map(e => e.id)

  const risks = DISEASE_MATRIX.filter(d =>
    !weather.loading && !weather.error &&
    d.condition(weather.temp, weather.humidity) &&
    d.crops.some(id => myIds.includes(id))
  )

  const noRisks = !weather.loading && !weather.error && risks.length === 0

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {weather.loading && <div style={{ color: '#64748b', fontSize: 13 }}>Загрузка погоды...</div>}
      {weather.error && <div style={{ color: '#f87171', fontSize: 13 }}>Погода недоступна — проверьте город в профиле</div>}
      {noRisks && (
        <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: 14, fontSize: 13, color: '#4ade80' }}>
          ✅ По текущей погоде ({weather.temp}°C, влажность {weather.humidity}%) рисков болезней не выявлено
        </div>
      )}
      {risks.map((r, i) => {
        const affectedCrops = r.crops.filter(id => myIds.includes(id))
        return (
          <div key={i} className={`disease-card ${r.severity}`} style={{ marginBottom: 10 }}>
            <div className="disease-name">{r.name}</div>
            <div className="disease-crops">
              {affectedCrops.map(id => {
                const c = CROPS.find(x => x.id === id)
                return <span key={id} className="compat-tag bad">{c?.icon} {c?.name}</span>
              })}
            </div>
            <div className="disease-advice">{r.advice}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── ИСТОРИЯ СЕЗОНОВ ───────────────────────────────────────────────
function SeasonsScreen({ vkUserId, currentData, currentYear }: {
  vkUserId: number
  currentData: OnboardingData
  currentYear: number
}) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedYear, setExpandedYear] = useState<number | null>(null)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)

  useEffect(() => {
    loadSeasons(vkUserId).then(d => { setSeasons(d as Season[]); setLoading(false) })
  }, [vkUserId])

  async function handleSaveSeason() {
    setSaving(true)
    const planted = currentData.cropEntries.filter(e => e.status === 'planted')
    const cropNames = planted.map(e => CROPS.find(c => c.id === e.id)?.name).filter(Boolean).join(', ')
    const summary = `Сезон ${currentYear}: посажено ${planted.length} культур (${cropNames || 'нет'}). Объектов: ${currentData.gardenObjects.length}.`
    await saveSeasonSnapshot(vkUserId, currentYear, currentData, summary)
    const updated = await loadSeasons(vkUserId)
    setSeasons(updated as Season[])
    setSaving(false)
    setShowSaveConfirm(false)
  }

  const currentSeason = seasons.find(s => s.year === currentYear)

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {/* Сохранить текущий сезон */}
      <div className="season-save-card">
        <div className="season-save-title">🌱 Сезон {currentYear}</div>
        <div className="season-save-sub">
          {currentSeason
            ? `Сохранён ${new Date(currentSeason.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
            : 'Сохраните огород этого сезона — весной удобно сравнивать'}
        </div>
        {!showSaveConfirm ? (
          <button className="btn-primary" style={{ marginTop: 10, width: '100%' }}
            onClick={() => setShowSaveConfirm(true)}>
            {currentSeason ? '🔄 Обновить сезон' : '💾 Сохранить сезон'}
          </button>
        ) : (
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={handleSaveSeason} disabled={saving}>
              {saving ? 'Сохраняю...' : 'Да, сохранить'}
            </button>
            <button className="btn-back" onClick={() => setShowSaveConfirm(false)}>Отмена</button>
          </div>
        )}
      </div>

      {/* Прошлые сезоны */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>Загрузка...</div>
      ) : seasons.filter(s => s.year !== currentYear).length === 0 ? (
        <div style={{ textAlign: 'center', color: '#555', padding: 24, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
          Прошлые сезоны появятся здесь.<br/>Приложение будет с вами каждый год 🌱
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {seasons.filter(s => s.year !== currentYear).map(season => {
            const planted = (season.snapshot?.cropEntries || []).filter((e: any) => e.status === 'planted')
            const isOpen = expandedYear === season.year
            return (
              <div key={season.id} className="season-card">
                <button className="season-card-header" onClick={() => setExpandedYear(isOpen ? null : season.year)}>
                  <span className="season-year">🗓️ {season.year}</span>
                  <span className="season-crop-count">{planted.length} культур</span>
                  <span className="season-arrow">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="season-card-body">
                    {season.summary && <div className="season-summary">{season.summary}</div>}
                    <div className="season-crops-grid">
                      {planted.map((e: any, i: number) => {
                        const crop = CROPS.find(c => c.id === e.id)
                        const variety = e.varieties?.[0]?.name
                        return (
                          <div key={i} className="season-crop-item">
                            <span>{crop?.icon ?? '🌱'}</span>
                            <span>{crop?.name ?? e.id}{variety ? ` · ${variety}` : ''}</span>
                          </div>
                        )
                      })}
                    </div>
                    {season.snapshot?.gardenObjects?.length > 0 && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                        Объекты: {season.snapshot.gardenObjects.map((o: any) => o.name).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── ДНЕВНИК ───────────────────────────────────────────────────────
function DiaryScreen({ vkUserId, cropEntries }: { vkUserId: number; cropEntries: CropEntry[] }) {
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [filterCrop, setFilterCrop] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addCropId, setAddCropId] = useState<string>('')
  const [addOp, setAddOp] = useState<string>('')
  const [addText, setAddText] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const reload = () => {
    setLoading(true)
    loadDiary(vkUserId, filterCrop ?? undefined).then(d => { setEntries(d as DiaryEntry[]); setLoading(false) })
  }

  useEffect(() => { reload() }, [filterCrop, vkUserId])

  async function handleAdd() {
    if (!addText.trim()) return
    setSaving(true)
    await addDiaryEntry(vkUserId, addCropId || null, addOp || null, addText)
    setAddText(''); setAddOp(''); setAddCropId(''); setShowAdd(false); setSaving(false)
    reload()
  }

  const plantedCrops = cropEntries.filter(e => e.status === 'planted')

  return (
    <div style={{ padding: '0 0 80px' }}>
      {/* Фильтр по культуре */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto' }}>
        <button className={`ob-chip ${!filterCrop ? 'selected' : ''}`} onClick={() => setFilterCrop(null)}>Все</button>
        {plantedCrops.map(e => {
          const crop = CROPS.find(c => c.id === e.id)
          return (
            <button key={e.id} className={`ob-chip ${filterCrop === e.id ? 'selected' : ''}`}
              onClick={() => setFilterCrop(filterCrop === e.id ? null : e.id)}>
              {crop?.icon} {crop?.name}
            </button>
          )
        })}
      </div>

      {/* Кнопка добавить */}
      <div style={{ padding: '0 16px 12px' }}>
        <button className="btn-chat" onClick={() => setShowAdd(true)}>📝 Новая запись</button>
      </div>

      {/* Модалка добавления */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">📝 Запись в дневник</span>
              <button className="modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="modal-section-label">Культура</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              <button className={`ob-chip ${!addCropId ? 'selected' : ''}`} onClick={() => setAddCropId('')}>Общее</button>
              {plantedCrops.map(e => {
                const crop = CROPS.find(c => c.id === e.id)
                return (
                  <button key={e.id} className={`ob-chip ${addCropId === e.id ? 'selected' : ''}`}
                    onClick={() => setAddCropId(e.id)}>
                    {crop?.icon} {crop?.name}
                  </button>
                )
              })}
            </div>
            {addCropId && (
              <>
                <div className="modal-section-label">Операция</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {getOps(addCropId).map(op => (
                    <button key={op.id} className={`ob-chip ${addOp === op.id ? 'selected' : ''}`}
                      onClick={() => setAddOp(addOp === op.id ? '' : op.id)}>{op.label}</button>
                  ))}
                </div>
              </>
            )}
            <div className="modal-section-label">Заметка</div>
            <textarea
              style={{ width: '100%', minHeight: 80, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 10, color: '#fff', fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
              placeholder="Что сделали, что заметили..."
              value={addText}
              onChange={e => setAddText(e.target.value)}
            />
            <button className="btn-primary btn-full" style={{ marginTop: 12 }} onClick={handleAdd} disabled={saving || !addText.trim()}>
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {/* Лента записей */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>Загрузка...</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#666', padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📖</div>
          <div>Записей пока нет</div>
        </div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(entry => {
            const crop = entry.crop_id ? CROPS.find(c => c.id === entry.crop_id) : null
            const op = entry.operation && entry.crop_id ? getOps(entry.crop_id).find(o => o.id === entry.operation) : null
            const date = new Date(entry.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            return (
              <div key={entry.id} className="diary-entry">
                <div className="diary-entry-header">
                  <span className="diary-crop">{crop ? `${crop.icon} ${crop.name}` : '🌱 Огород'}</span>
                  {op && <span className="diary-op">{op.label}</span>}
                  <span className="diary-date">{date}</span>
                </div>
                <div className="diary-text">{entry.text}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProfileScreen({ data, plan, onChangePlan, onUpdateData, vkUserId }: {
  data: OnboardingData; plan: Plan; onChangePlan: (p: Plan) => void; onUpdateData: (patch: Partial<OnboardingData>) => void; vkUserId: number
}) {
  const [editCity, setEditCity] = useState(false)
  const [cityVal, setCityVal] = useState(data.city)
  const [editExp, setEditExp] = useState(false)
  const [showAddObject, setShowAddObject] = useState(false)
  const [showFaq, setShowFaq] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null)
  const expLabel = { beginner: '🌱 Новичок', amateur: '🌿 Любитель', experienced: '🧑‍🌾 Опытный', expert: '🏆 Эксперт' }[data.experience] ?? '—'

  return (
    <div className="tab-content">
      {/* FAQ модалка */}
      {showFaq && (
        <div className="modal-overlay" onClick={() => setShowFaq(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">❓ Помощь</span>
              <button className="modal-close" onClick={() => setShowFaq(false)}>✕</button>
            </div>
            <div className="faq-list">
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className="faq-item">
                  <button className="faq-question" onClick={() => setOpenFaqIdx(openFaqIdx === i ? null : i)}>
                    <span>{item.q}</span>
                    <span className="faq-arrow">{openFaqIdx === i ? '▲' : '▼'}</span>
                  </button>
                  {openFaqIdx === i && <div className="faq-answer">{item.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showAddObject && (
        <div className="modal-overlay" onClick={() => setShowAddObject(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">Добавить объект</span>
              <button className="modal-close" onClick={() => setShowAddObject(false)}>✕</button>
            </div>
            {data.gardenObjects.length >= OBJECT_LIMITS[plan] ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                  Лимит объектов достигнут
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                  {plan === 'free' ? 'Бесплатно — 1 объект. Перейдите на Базовую (3 объекта)' : 'Базовая — 3 объекта. Перейдите на Про для неограниченного количества'}
                </div>
              </div>
            ) : (
              <>
                <div className="ob-cards" style={{ maxHeight: 200 }}>
                  {GROW_OPTIONS.map(o => (
                    <button key={o.id} className="ob-card" onClick={() => {
                      const count = data.gardenObjects.filter(x => x.type === o.id).length
                      const name = count === 0 ? o.title : `${o.title} ${count + 1}`
                      onUpdateData({ gardenObjects: [...data.gardenObjects, makeObject(o.id, name)] })
                      setShowAddObject(false)
                    }}>
                      <span className="ob-card-icon">{o.icon}</span>
                      <div><div className="ob-card-title">{o.title}</div><div className="ob-card-sub">{o.sub}</div></div>
                      <span className="ob-card-add">+</span>
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', textAlign: 'center', marginTop: 10 }}>
                  {data.gardenObjects.length} из {OBJECT_LIMITS[plan] === 999 ? '∞' : OBJECT_LIMITS[plan]} объектов
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {editExp && (
        <div className="modal-overlay" onClick={() => setEditExp(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">Уровень опыта</span>
              <button className="modal-close" onClick={() => setEditExp(false)}>✕</button>
            </div>
            <div className="ob-cards" style={{ maxHeight: 350 }}>
              {[
                { id: 'beginner', icon: '🌱', title: 'Новичок', sub: 'Полные советы с объяснениями' },
                { id: 'amateur', icon: '🌿', title: 'Любитель', sub: 'Советы без лишних объяснений' },
                { id: 'experienced', icon: '🧑‍🌾', title: 'Опытный', sub: 'Только напоминания и аномалии' },
                { id: 'expert', icon: '🏆', title: 'Эксперт', sub: 'Только критичные алерты' },
              ].map(o => (
                <button key={o.id} className={`ob-card ${data.experience === o.id ? 'selected' : ''}`}
                  onClick={() => { onUpdateData({ experience: o.id }); setEditExp(false) }}>
                  <span className="ob-card-icon">{o.icon}</span>
                  <div><div className="ob-card-title">{o.title}</div><div className="ob-card-sub">{o.sub}</div></div>
                  {data.experience === o.id && <span className="ob-check">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="profile-card">
        {editCity ? (
          <div className="profile-edit-row">
            <input className="profile-edit-input" value={cityVal} onChange={e => setCityVal(e.target.value)} placeholder="Введите город" autoFocus />
            <button className="profile-edit-save" onClick={() => { onUpdateData({ city: cityVal }); setEditCity(false) }}>✓</button>
            <button className="profile-edit-cancel" onClick={() => { setCityVal(data.city); setEditCity(false) }}>✕</button>
          </div>
        ) : (
          <div className="profile-row profile-row-tap" onClick={() => { setCityVal(data.city); setEditCity(true) }}>
            <span className="profile-label">🗺️ Город</span>
            <span className="profile-val">{data.city || '—'} <span className="profile-edit-icon">✏️</span></span>
          </div>
        )}
        <div className="profile-row profile-row-tap" onClick={() => setEditExp(true)}>
          <span className="profile-label">👤 Опыт</span>
          <span className="profile-val">{expLabel} <span className="profile-edit-icon">✏️</span></span>
        </div>
        <div className="profile-row"><span className="profile-label">🌿 Культур</span><span className="profile-val">{data.cropEntries.length}</span></div>
        <div className="profile-row">
          <span className="profile-label">🏡 Объекты</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="profile-val">{data.gardenObjects.map(o => GROW_OPTIONS.find(g => g.id === o.type)?.icon).join(' ') || '—'}</span>
            <button className="profile-add-btn" onClick={() => setShowAddObject(true)}>+</button>
          </div>
        </div>
        <div className="profile-row"><span className="profile-label">🔔 Советы</span><span className="profile-val">{data.notifMorning} / {data.notifEvening}</span></div>
      </div>

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Получать уведомления в</div>
      <div className="notif-channels-grid">
        {NOTIF_CHANNELS.map(ch => {
          const active = data.notifChannels.includes(ch.id)
          return (
            <button key={ch.id} className={`notif-channel-btn ${active ? 'active' : ''}`}
              onClick={() => onUpdateData({ notifChannels: active ? data.notifChannels.filter(x => x !== ch.id) : [...data.notifChannels, ch.id] })}>
              <span className="notif-ch-icon">{ch.icon}</span>
              <span className="notif-ch-label">{ch.label}</span>
              {active && <span className="notif-ch-check">✓</span>}
            </button>
          )
        })}
      </div>

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>📅 История сезонов</div>
      <SeasonsScreen vkUserId={vkUserId} currentData={data} currentYear={new Date().getFullYear()} />

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>📖 Дневник</div>
      <div style={{ padding: '0 16px 8px' }}>
        <DiaryScreen vkUserId={vkUserId} cropEntries={data.cropEntries} />
      </div>

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Ваш тариф</div>
      <div className="sub-cards">
        {PLANS.map(p => (
          <div key={p.id} className={`sub-card ${plan === p.id ? 'active' : ''}`}>
            {p.id === 'pro' && <div className="plan-badge">ХИТ</div>}
            <div className="sub-card-header">
              <span style={{ fontSize: 22 }}>{p.icon}</span>
              <div><div className="sub-card-name">{p.name}</div><div className="sub-card-price">{p.price}</div></div>
              {plan === p.id && <span className="sub-active-badge">Текущий</span>}
            </div>
            <ul className="plan-features">{p.features.map(f => <li key={f}>{f}</li>)}</ul>
            {plan !== p.id && p.id !== 'free' && (
              <button className="btn-upgrade-full" onClick={() => onChangePlan(p.id)}>Подключить {p.price}</button>
            )}
            {plan !== p.id && p.id === 'free' && plan !== 'free' && (
              <button className="btn-downgrade" onClick={() => {
                const cropLimit = 10
                const objLimit = 1
                const overCrops = data.cropEntries.length > cropLimit
                const overObjs = data.gardenObjects.length > objLimit
                const msg = overCrops || overObjs
                  ? `Внимание: у вас ${data.cropEntries.length} культур и ${data.gardenObjects.length} объектов. На бесплатном тарифе лимит ${cropLimit} культур и ${objLimit} объект. Данные сохранятся, но добавление новых будет заблокировано.`
                  : 'Перейти на бесплатный тариф?'
                if (window.confirm(msg)) onChangePlan(p.id)
              }}>Перейти на бесплатный</button>
            )}
            {plan === 'pro' && p.id === 'base' && (
              <button className="btn-downgrade" onClick={() => {
                const overCrops = data.cropEntries.length > 15
                const overObjs = data.gardenObjects.length > 3
                const msg = overCrops || overObjs
                  ? `Внимание: у вас ${data.cropEntries.length} культур и ${data.gardenObjects.length} объектов. На Базовом тарифе лимит 15 культур и 3 объекта. Данные сохранятся.`
                  : 'Перейти на тариф Базовая?'
                if (window.confirm(msg)) onChangePlan(p.id)
              }}>Перейти на Базовую</button>
            )}
          </div>
        ))}
      </div>

      {/* Экспорт */}
      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>📤 Экспорт данных</div>
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8 }}>
        <button className="btn-export" disabled={exporting} onClick={async () => {
          setExporting(true)
          const [diary, seasons, notifs] = await Promise.all([
            import('./supabase').then(m => m.loadDiary(vkUserId)),
            import('./supabase').then(m => m.loadSeasons(vkUserId)),
            import('@supabase/supabase-js').then(() => import('./supabase').then(m => m.supabase.from('notifications').select('*').eq('vk_user_id', vkUserId).order('created_at', { ascending: false }).limit(100).then(r => r.data || []))),
          ])
          await exportCSV(data, diary, seasons as any[], notifs as any[])
          setExporting(false)
        }}>📊 CSV</button>
        <button className="btn-export" disabled={exporting} onClick={async () => {
          setExporting(true)
          const [diary, seasons, notifs] = await Promise.all([
            import('./supabase').then(m => m.loadDiary(vkUserId)),
            import('./supabase').then(m => m.loadSeasons(vkUserId)),
            import('./supabase').then(m => m.supabase.from('notifications').select('*').eq('vk_user_id', vkUserId).order('created_at', { ascending: false }).limit(100).then(r => r.data || [])),
          ])
          exportHTML(data, diary, seasons as any[], notifs as any[])
          setExporting(false)
        }}>📄 HTML-отчёт</button>
      </div>

      {/* Кнопка помощи */}
      <button className="btn-help" onClick={() => setShowFaq(true)}>❓ Помощь и FAQ</button>

      {/* Документы */}
      <div style={{ padding: '8px 16px', textAlign: 'center' }}>
        <a href="https://ogorod-ai.ru/terms-privacy.html" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'underline' }}>
          Пользовательское соглашение и политика конфиденциальности
        </a>
      </div>

      {/* Удаление аккаунта */}
      <DeleteAccountButton vkUserId={vkUserId} />
    </div>
  )
}

function DeleteAccountButton({ vkUserId }: { vkUserId: number }) {
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (deleting) return (
    <div style={{ textAlign: 'center', padding: '16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
      Удаление данных...
    </div>
  )

  if (confirm) return (
    <div style={{ margin: '8px 16px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#fca5a5', marginBottom: 6 }}>Удалить аккаунт?</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
        Все ваши данные (огород, дневник, история сезонов) будут удалены безвозвратно.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={async () => {
          setDeleting(true)
          try {
            await fetch('https://garden-agent.gorant1991.workers.dev/delete-account', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vk_user_id: vkUserId }),
            })
          } catch (_) {}
          window.location.reload()
        }} style={{ flex: 1, background: 'rgba(239,68,68,0.7)', border: 'none', borderRadius: 10, padding: '10px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
          Да, удалить всё
        </button>
        <button onClick={() => setConfirm(false)}
          style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}>
          Отмена
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '0 16px 24px', textAlign: 'center' }}>
      <button onClick={() => setConfirm(true)}
        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Nunito, sans-serif' }}>
        Удалить аккаунт
      </button>
    </div>
  )
}

// ─── ЭКСПОРТ ───────────────────────────────────────────────────────
async function exportCSV(data: OnboardingData, diary: any[], seasons: any[], notifications: any[]) {
  const rows: string[][] = []
  const sep = ','

  // Секция: огород
  rows.push(['=== ОГОРОД ==='])
  rows.push(['Город', data.city])
  rows.push(['Опыт', data.experience])
  rows.push([])
  rows.push(['Культура', 'Сорт', 'Статус', 'Дата посева', 'Место', 'Метод'])
  data.cropEntries.forEach(e => {
    const crop = CROPS.find(c => c.id === e.id)
    const obj = data.gardenObjects.find(o => o.uid === e.location)
    const variety = e.varieties.map(v => v.name).join('; ')
    rows.push([
      crop?.name ?? e.id,
      variety,
      e.status === 'planted' ? 'Посажено' : 'Планируется',
      e.sowDate,
      obj?.name ?? '',
      e.sowMethod === 'seeds' ? 'Семена' : e.sowMethod === 'seedling' ? 'Рассада' : '',
    ])
  })

  rows.push([])
  rows.push(['=== ДНЕВНИК ==='])
  rows.push(['Дата', 'Культура', 'Операция', 'Запись'])
  diary.forEach(d => {
    const crop = d.crop_id ? CROPS.find(c => c.id === d.crop_id) : null
    const op = d.operation && d.crop_id ? getOps(d.crop_id).find((o: any) => o.id === d.operation) : null
    rows.push([
      new Date(d.created_at).toLocaleDateString('ru-RU'),
      crop?.name ?? 'Общее',
      op?.label ?? '',
      d.text,
    ])
  })

  rows.push([])
  rows.push(['=== СОВЕТЫ АГРОНОМА ==='])
  rows.push(['Дата', 'Заголовок', 'Текст'])
  notifications.forEach(n => {
    rows.push([
      new Date(n.created_at).toLocaleDateString('ru-RU'),
      n.title,
      n.body,
    ])
  })

  rows.push([])
  rows.push(['=== ИСТОРИЯ СЕЗОНОВ ==='])
  rows.push(['Год', 'Итог', 'Культур'])
  seasons.forEach(s => {
    const planted = (s.snapshot?.cropEntries || []).filter((e: any) => e.status === 'planted')
    rows.push([String(s.year), s.summary ?? '', String(planted.length)])
  })

  const csv = rows.map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(sep)).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ogorod_${new Date().getFullYear()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportHTML(data: OnboardingData, diary: any[], seasons: any[], notifications: any[]) {
  const date = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  const year = new Date().getFullYear()

  const cropRows = data.cropEntries.map(e => {
    const crop = CROPS.find(c => c.id === e.id)
    const obj = data.gardenObjects.find(o => o.uid === e.location)
    const variety = e.varieties.map(v => v.name).filter(Boolean).join(', ')
    const status = e.status === 'planted' ? '✅ Посажено' : '📋 Планируется'
    const sowDate = e.sowDate ? new Date(e.sowDate).toLocaleDateString('ru-RU') : '—'
    return `<tr>
      <td>${crop?.icon ?? ''} ${crop?.name ?? e.id}</td>
      <td>${variety || '—'}</td>
      <td>${status}</td>
      <td>${sowDate}</td>
      <td>${obj?.name ?? '—'}</td>
    </tr>`
  }).join('')

  const diaryRows = diary.map(d => {
    const crop = d.crop_id ? CROPS.find(c => c.id === d.crop_id) : null
    const op = d.operation && d.crop_id ? getOps(d.crop_id).find((o: any) => o.id === d.operation) : null
    const dt = new Date(d.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    return `<tr>
      <td>${dt}</td>
      <td>${crop ? crop.icon + ' ' + crop.name : '🌱 Общее'}</td>
      <td>${op?.label ?? '—'}</td>
      <td>${d.text}</td>
    </tr>`
  }).join('')

  const notifRows = notifications.map(n => {
    const dt = new Date(n.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    return `<tr>
      <td>${dt}</td>
      <td><strong>${n.title}</strong></td>
      <td>${n.body}</td>
    </tr>`
  }).join('')

  const seasonBlocks = seasons.map(s => {
    const planted = (s.snapshot?.cropEntries || []).filter((e: any) => e.status === 'planted')
    const cropList = planted.map((e: any) => {
      const crop = CROPS.find(c => c.id === e.id)
      const v = e.varieties?.[0]?.name
      return `<span class="tag">${crop?.icon ?? '🌱'} ${crop?.name ?? e.id}${v ? ' · ' + v : ''}</span>`
    }).join('')
    return `<div class="season-block">
      <div class="season-year">🗓️ Сезон ${s.year} — ${planted.length} культур</div>
      ${s.summary ? `<div class="season-sum">${s.summary}</div>` : ''}
      <div class="tags">${cropList}</div>
    </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Мой огород ${year}</title>
<style>
  body { font-family: Georgia, serif; max-width: 900px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #fafaf8; }
  h1 { color: #166534; font-size: 28px; margin-bottom: 4px; }
  .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
  h2 { color: #15803d; font-size: 18px; border-bottom: 2px solid #bbf7d0; padding-bottom: 6px; margin-top: 32px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
  th { background: #dcfce7; color: #166534; padding: 8px 10px; text-align: left; font-weight: 600; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0fdf4; vertical-align: top; }
  tr:hover td { background: #f0fdf4; }
  .season-block { background: #f0fdf4; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
  .season-year { font-weight: 700; color: #166534; font-size: 15px; margin-bottom: 6px; }
  .season-sum { color: #4b5563; font-size: 13px; margin-bottom: 8px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { background: #dcfce7; color: #166534; border-radius: 6px; padding: 3px 9px; font-size: 12px; }
  .footer { margin-top: 40px; color: #9ca3af; font-size: 12px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 16px; }
  @media print { body { padding: 10px; } h2 { page-break-before: auto; } }
</style>
</head>
<body>
<h1>🌱 Мой огород</h1>
<div class="subtitle">${data.city} · Экспорт от ${date} · Опыт: ${{ beginner: 'Новичок', amateur: 'Любитель', experienced: 'Опытный', expert: 'Эксперт' }[data.experience] ?? data.experience}</div>

<h2>🥦 Культуры</h2>
<table>
  <thead><tr><th>Культура</th><th>Сорт</th><th>Статус</th><th>Дата посева</th><th>Место</th></tr></thead>
  <tbody>${cropRows}</tbody>
</table>

${diary.length > 0 ? `<h2>📖 Дневник</h2>
<table>
  <thead><tr><th>Дата</th><th>Культура</th><th>Операция</th><th>Запись</th></tr></thead>
  <tbody>${diaryRows}</tbody>
</table>` : ''}

${notifications.length > 0 ? `<h2>🤖 Советы агронома</h2>
<table>
  <thead><tr><th>Дата</th><th>Заголовок</th><th>Совет</th></tr></thead>
  <tbody>${notifRows}</tbody>
</table>` : ''}

${seasons.length > 0 ? `<h2>📅 История сезонов</h2>${seasonBlocks}` : ''}

<div class="footer">Создано в приложении Огород AI · ogorod-ai.ru</div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ogorod_${year}.html`
  a.click()
  URL.revokeObjectURL(url)
}

function LunarBadge() {
  const moon = useMoon()
  const icon = moon.loading ? '🌙' : (MOON_PHASE_NAMES[moon.phase] ?? '🌙').split(' ')[0]
  const short = moon.loading ? '...' : (moon.phase === 'Full Moon' ? 'Полнолуние' : moon.phase === 'New Moon' ? 'Новолуние' : `${moon.age}-й день`)
  return <div className="lunar-badge">{icon} {short}</div>
}

// ─── ГЛАВНОЕ ПРИЛОЖЕНИЕ ────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [tab, setTab] = useState<Tab>('main')
  const [plan, setPlan] = useState<Plan>('free')
  const [gardenData, setGardenData] = useState<OnboardingData>(empty)
  const [vkUserId, setVkUserId] = useState<number>(1)
  useEffect(() => {
    // Пробуем получить реальный vk_user_id из VK Bridge
    try {
      const vkBridge = (window as any)?.vkBridge ?? (window as any)?.VKBridge
      if (vkBridge) {
        vkBridge.send('VKWebAppGetUserInfo').then((u: any) => {
          if (u?.id) setVkUserId(u.id)
        }).catch(() => {})
      }
    } catch (_) {}
  }, [])
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [dbLoading, setDbLoading] = useState(true)
  const [lastNotif, setLastNotif] = useState<{ title: string; body: string } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Загрузка данных при старте
  useEffect(() => {
    loadUserData(vkUserId).then(row => {
      if (row) {
        setGardenData(row.onboarding as OnboardingData)
        setPlan(row.plan as Plan)
        setScreen('main')
      }
      setDbLoading(false)
    })
  }, [vkUserId])

  // Загрузка последнего уведомления
  useEffect(() => {
    if (screen === 'main') {
      // Грузим последнее уведомление (совет или подписка)
    Promise.all([
      loadLastNotification(vkUserId),
      loadSubscriptionNotif(vkUserId),
    ]).then(([daily, sub]) => {
      if (sub) setLastNotif(sub as any)
      else if (daily) setLastNotif(daily)
    })
    }
  }, [screen, vkUserId])

  // Автосохранение с debounce 1 сек
  useEffect(() => {
    if (screen !== 'main') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveUserData(vkUserId, gardenData, plan)
    }, 1000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [gardenData, plan])

  if (dbLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 40 }}>🌱</div>
      <div style={{ color: '#666', fontSize: 14 }}>Загрузка огорода...</div>
    </div>
  )

  const updateEntry = (id: string, patch: Partial<CropEntry>) =>
    setGardenData(prev => ({ ...prev, cropEntries: prev.cropEntries.map(e => e.id === id ? { ...e, ...patch } : e) }))
  const addEntry = (entry: CropEntry) =>
    setGardenData(prev => ({ ...prev, cropEntries: [...prev.cropEntries, entry] }))
  const deleteEntry = (id: string) =>
    setGardenData(prev => ({ ...prev, cropEntries: prev.cropEntries.filter(e => e.id !== id) }))
  const updateData = (patch: Partial<OnboardingData>) =>
    setGardenData(prev => ({ ...prev, ...patch }))

  // Первое сообщение агронома после онбординга
  function handleOnboardingDone(d: OnboardingData) {
    setGardenData(d)
    saveUserData(vkUserId, d, plan)
    const cropNames = d.cropEntries.slice(0, 3).map(e => CROPS.find(c => c.id === e.id)?.name).filter(Boolean).join(', ')
    const greeting = `Привет! 🌱 Я знаю ваш огород в ${d.city}.

Вот что я умею:
• 🌤️ Каждое утро в ${d.notifMorning} — совет с учётом погоды
• 🌿 Слежу за ростом ваших культур${cropNames ? ` (${cropNames}${d.cropEntries.length > 3 ? ' и др.' : ''})` : ''}
• ⚠️ Предупреждаю о заморозках, болезнях и вредителях
• 💧 Напоминаю о поливе, подкормке и других операциях

Просто спрашивайте — отвечу с учётом вашей почвы, климата и сортов. Удачного сезона! 🥕`
    setMessages([{ role: 'bot', text: greeting }])
    setScreen('main')
  }

  async function sendMessage() {
    if (!input.trim()) return
    const question = input; setInput('')
    setMessages(m => [...m, { role: 'user', text: question }])
    setLoading(true)
    try {
      const res = await fetch('https://garden-agent.gorant1991.workers.dev/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vk_user_id: vkUserId, question })
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'bot', text: data.answer }])
    } catch {
      setMessages(m => [...m, { role: 'bot', text: 'Ошибка соединения. Попробуйте ещё раз.' }])
    }
    setLoading(false)
  }

  if (screen === 'onboarding') return <Onboarding onDone={handleOnboardingDone} />

  if (screen === 'chat') return (
    <div className="screen chat">
      <div className="chat-header">
        <button className="back-btn" onClick={() => setScreen('main')}>←</button>
        <div><div className="chat-title">🤖 AI Агроном</div><div className="chat-sub">Знает ваш огород</div></div>
      </div>
      <div className="chat-messages">
        {messages.map((m, i) => <div key={i} className={`msg msg-${m.role}`}>{m.text}</div>)}
        {loading && <div className="msg msg-bot loading">Думаю...</div>}
      </div>
      <div className="chat-input">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Задать вопрос..." />
        <button onClick={sendMessage}>➤</button>
      </div>
    </div>
  )

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'main',    icon: '🏠', label: 'Главная'  },
    { id: 'plants',  icon: '🌱', label: 'Растения' },
    { id: 'moon',    icon: '🌙', label: 'Луна'     },
    { id: 'profile', icon: '👤', label: 'Профиль'  },
  ]

  return (
    <div className="screen main">
      <div className="main-header">
        <div>
          <div className="greeting">{(() => { const h = new Date().getHours(); return h >= 5 && h < 12 ? 'Доброе утро' : h >= 12 && h < 17 ? 'Добрый день' : h >= 17 && h < 22 ? 'Добрый вечер' : 'Доброй ночи' })()}</div>
          <div className="date">{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <LunarBadge />
      </div>
      <div className="tab-scroll">
        {tab === 'main' && (
          <div className="tab-content">
            {lastNotif ? (
              <div className="advice-card advice-greeting" onClick={() => setScreen('chat')}>
                <div className="card-label">🤖 Агроном · Совет дня</div>
                <div className="card-title">{lastNotif.title}</div>
                <div className="card-body">{lastNotif.body}</div>
              </div>
            ) : messages.length > 0 ? (
              <div className="advice-card advice-greeting" onClick={() => setScreen('chat')}>
                <div className="card-label">🤖 Агроном</div>
                <div className="card-body" style={{ whiteSpace: 'pre-line' }}>{messages[0].text}</div>
              </div>
            ) : (
              <div className="advice-card advice-placeholder">
                <div className="card-label">🌅 Первый совет</div>
                <div className="card-title">Агроном готовится...</div>
                <div className="card-body">
                  Первый персональный совет придёт в {gardenData.notifMorning || '06:00'} 🌅<br />
                  Агроном изучает ваш огород и погоду в регионе.
                </div>
              </div>
            )}
            {lastNotif && (lastNotif as any).type === 'subscription' && (
              <div className="sub-alert-card">
                <div className="sub-alert-title">{lastNotif.title}</div>
                <div className="sub-alert-body">{lastNotif.body}</div>
              </div>
            )}
            <button className="btn-chat" onClick={() => setScreen('chat')}>🤖 Спросить агронома</button>
          </div>
        )}
        {tab === 'plants'  && <PlantsScreen data={gardenData} plan={plan} onUpdateEntry={updateEntry} onAddEntry={addEntry} onDeleteEntry={deleteEntry} vkUserId={vkUserId} />}
        {tab === 'moon'    && <MoonScreen plan={plan} city={gardenData.city} vkUserId={vkUserId} />}
        {tab === 'profile' && <ProfileScreen data={gardenData} plan={plan} onChangePlan={setPlan} onUpdateData={updateData} vkUserId={vkUserId} />}
      </div>
      <div className="navbar">
        {TABS.map(n => (
          <button key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
            <span className="nav-icon">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
