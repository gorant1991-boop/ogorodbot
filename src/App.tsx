import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { addDiaryEntry, applyReferral, getEmailAuthState, loadDiary, loadLastNotification, loadSubscriptionNotif, loadUserData, requestAgronomistAnswer, saveUserData, sendEmailMagicLink, signOutEmailAuth, trackAnalyticsEvent, verifyReviewLogin, type EmailAuthState } from './supabase'
import { detectEmbeddedBrowser, type EmbeddedBrowserInfo } from './utils/browser'
import { CROPS, applyDiaryEntryToOnboardingData, buildSubscriptionOffers, empty, formatOperationMemorySummary, formatDateLabel, formatRainObservationSummary, getCropName, getDiaryEntryKindLabel, getEffectivePlan, getOperationLabel, getPrimaryOp, getSubscriptionNotice, getWeatherRisks, hasWeeklyPlannerAccess, isDiaryEntryCompletedOperation, parseDiaryText, rebuildOperationMemoryFromDiary, upsertRainObservation } from './utils/constants'
import { loadOfflineBundle, saveOfflineBundle, type OfflineBundle } from './utils/offline'
import { trackMainView, trackVirtualPageView } from './utils/webAnalytics'
import { clearReviewAuth, loadReviewAuth, REVIEW_USER_ID, saveReviewAuth, type ReviewAuthState } from './utils/reviewAuth'
import { clearTelegramAuth, consumeTelegramAuthResult, hasTelegramBotUsername, loadTelegramAuth, saveTelegramAuth, type TelegramAuthState } from './utils/telegram'
import { consumeVkAuthCallback, hasVkAppId, loadVkAuth, logoutVk, openVkLogin, saveVkAuth, type VkAuthState } from './utils/vk'
import { fetchWeatherSnapshot, fetchWeeklyPlanSnapshot, useWeather, useWeeklyPlan } from './hooks'
import {
  DiaryScreen as AppDiaryScreen,
  MoonScreen as AppMoonScreen,
  Onboarding as AppOnboarding,
  OwnerAnalyticsScreen as AppOwnerAnalyticsScreen,
  PlantsScreen as AppPlantsScreen,
  ProfileScreen as AppProfileScreen,
} from './components/screens'
import { LunarBadge as AppLunarBadge } from './components/ui'
import type { CropEntry, DiaryEntry, OnboardingData, Plan, Screen, Tab } from './utils/types'
import { hashIdentityToUserId } from '../shared/identity.ts'

interface NotificationPreview {
  title: string
  body: string
  type?: string | null
  created_at?: string
}

interface BridgeUserInfo {
  id?: number
}

interface VkBridgeLike {
  send(method: 'VKWebAppGetUserInfo'): Promise<BridgeUserInfo>
}

const PENDING_REFERRAL_STORAGE_KEY = 'ogorodbot_pending_referral'
const INSTALL_PROMPT_DISMISSED_KEY = 'ogorodbot_install_prompt_dismissed'
const EMBEDDED_BROWSER_BANNER_DISMISSED_KEY = 'ogorodbot_embedded_browser_banner_dismissed'
const OWNER_VK_ID = 16761047
const OWNER_EMAILS = ['gorant1991@gmail.com']
const GENERIC_TOOL_NAMES = new Set(['🪣 Лейка', '🧯 Шланг', 'Лейка', 'Шланг'])
type HelpHintId = 'main-overview' | 'plants-overview' | 'moon-overview' | 'diary-overview' | 'profile-overview'

interface HelpHintDefinition {
  id: HelpHintId
  title: string
  text: string
}

const HELP_HINTS: Record<HelpHintId, HelpHintDefinition> = {
  'main-overview': {
    id: 'main-overview',
    title: 'Здесь собран день по огороду',
    text: 'На главной живут совет дня, быстрые дела, риски по погоде и вход в чат с агрономом. Если экран кажется перегруженным, часть объяснений можно отключить в профиле.',
  },
  'plants-overview': {
    id: 'plants-overview',
    title: 'Карточки культур здесь главные',
    text: 'Нажмите на культуру, чтобы открыть её детали, дневник и вопрос к AI. В этой же вкладке удобно держать список удобрений, чтобы советы были привязаны к реальному запасу.',
  },
  'moon-overview': {
    id: 'moon-overview',
    title: 'План недели это ориентир, а не приказ',
    text: 'Сначала смотрите на состояние растений и погоду, а уже потом на лунный ритм. Если задача не подходит по факту, лучше зафиксировать наблюдение в дневнике и скорректировать уход.',
  },
  'diary-overview': {
    id: 'diary-overview',
    title: 'Дневник делает советы умнее',
    text: 'Лучше короткая запись по делу, чем длинный отчёт раз в неделю. Что сделали, что заметили и как отреагировало растение обычно уже хватает для персональных советов.',
  },
  'profile-overview': {
    id: 'profile-overview',
    title: 'Тонкие настройки живут в профиле',
    text: 'Здесь можно поправить объекты, инструменты, уведомления и режим подсказок. Если помощь уже не нужна, её можно выключить совсем или позже снова включить.',
  },
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function buildAgronomistContext(data: OnboardingData, plan: Plan) {
  const displayName = normalizeDisplayName(data.displayName)
  const terrainLabel = formatTerrainLabel(data.terrain)
  const crops = data.cropEntries.map(entry => {
    const varieties = entry.varieties
      .filter(variety => variety.name.trim())
      .map(variety => {
        const parts = [variety.name.trim()]
        if (variety.days) parts.push(`${variety.days} дн.`)
        if (variety.note?.trim()) parts.push(`пометка: ${variety.note.trim()}`)
        return parts.join(', ')
      })
      .join(', ')
    const status = entry.status === 'planted' ? 'посажена' : 'в планах'
    const location = data.gardenObjects.find(object => object.uid === entry.location)
    const locationLabel = location?.name ? `; место ${location.name}` : ''
    const sowDateLabel = entry.sowDate ? `; дата ${entry.sowDate}` : ''
    const operationSummary = formatOperationMemorySummary(entry)
    return `${getCropName(entry.id)}: ${status}${locationLabel}${sowDateLabel}${varieties ? `; сорта ${varieties}` : ''}${operationSummary ? `; последние операции ${operationSummary}` : ''}`
  })

  const objects = data.gardenObjects.map(obj => obj.name).filter(Boolean)
  const fertilizers = data.fertilizers
    .map(item => [item.name, item.brand, item.composition, item.note].filter(Boolean).join(' · '))
    .filter(Boolean)
  const tools = data.tools
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => !GENERIC_TOOL_NAMES.has(item))
  const siteNotes = data.siteNotes?.trim() ?? ''
  const rainSummary = formatRainObservationSummary(data.rainObservations)

  return [
    `Контекст огорода пользователя.`,
    `Тариф: ${plan}.`,
    displayName ? `Пользователь называет себя: ${displayName}.` : '',
    data.addressStyle === 'formal'
      ? 'Обращайся к пользователю на "вы".'
      : 'Обращайся к пользователю на "ты".',
    data.city ? `Город: ${data.city}.` : '',
    terrainLabel ? `Климат/местность: ${terrainLabel}.` : '',
    objects.length ? `Объекты: ${objects.join(', ')}.` : '',
    crops.length ? `Культуры: ${crops.join('; ')}.` : '',
    fertilizers.length ? `Удобрения в наличии: ${fertilizers.join('; ')}.` : '',
    tools.length
      ? `У пользователя уже есть под рукой: ${tools.join(', ')}.`
      : 'Инструменты и материалы не указаны. Не предполагай, что у пользователя уже есть pH-метр, влагомер, термометр почвы, капельный полив или готовая мульча. Их можно предлагать как варианты, но не как уже имеющиеся вещи.',
    siteNotes ? `Заметки пользователя об участке: ${siteNotes}. Это наблюдения пользователя, а не проверенные факты.` : '',
    fertilizers.length
      ? 'Если советуешь подкормку, сначала посмотри на список удобрений пользователя и по возможности опирайся именно на них по названию.'
      : 'Если советуешь подкормку, не делай вид, что у пользователя уже есть конкретное удобрение. Предлагай варианты, а не выдумывай наличие.',
    tools.length
      ? 'Если совет зависит от инструмента или материала, сначала проверь список пользователя и по возможности опирайся именно на доступные вещи.'
      : 'Если совет зависит от инструмента, сначала скажи, что это вариант, а не уже имеющаяся вещь.',
    rainSummary ? `Последние уточнения пользователя по дождю: ${rainSummary}. Это наблюдение на месте важнее общего прогноза по городу.` : '',
    'Если из дневника или вопроса видно повторяющуюся проблему, предлагай не только действие на сегодня, но и 1-2 меры по снижению причины. Например: если почва быстро пересыхает, кроме полива можно предложить мульчу, капельный полив, изменение режима полива, притенение, проверку структуры почвы и удержания влаги.',
    'Не пересказывай заметки пользователя дословно без пользы. Если опираешься на них, формулируй осторожно: "по вашей заметке", "если это у вас по-прежнему так", "похоже, что..."',
    'Не выдавай предположения за установленный факт. Не утверждай уверенно про состав почвы, уровень грунтовых вод, болезни, нехватки питания или микроклимат, если это не следует прямо из данных.',
    'Пиши только по-русски. Не используй английские слова и технические id вроде culture, crop, tomato, watering, seedling, planned, planted.',
    'Отвечай коротко и понятно. Лучше всего в формате: "Сейчас", "Дальше", "Следить". Если какой-то блок не нужен, не добавляй его ради формы.',
    `Отвечай с опорой на этот огород, а не общими советами.`,
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

function normalizeDisplayName(value: string | undefined) {
  return value?.replace(/\s+/g, ' ').trim().slice(0, 30) ?? ''
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'.,!?():;[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesNormalized(haystack: string, needle: string) {
  const normalizedHaystack = normalizeForMatch(haystack)
  const normalizedNeedle = normalizeForMatch(needle)
  if (!normalizedHaystack || !normalizedNeedle) return false
  return normalizedHaystack.includes(normalizedNeedle)
}

function getRelevantVarietyMatches(question: string, data: OnboardingData) {
  const matches = new Map<string, Set<string>>()

  for (const entry of data.cropEntries) {
    for (const variety of entry.varieties) {
      const varietyName = variety.name.trim()
      if (!varietyName || !includesNormalized(question, varietyName)) continue
      const current = matches.get(entry.id) ?? new Set<string>()
      current.add(varietyName)
      matches.set(entry.id, current)
    }
  }

  return matches
}

function sanitizeAiText(text: string) {
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

function detectRelevantCropIds(question: string, data: OnboardingData) {
  const normalized = normalizeForMatch(question)
  const activeCropIds = new Set(data.cropEntries.map(entry => entry.id))
  const varietyMatches = getRelevantVarietyMatches(question, data)
  const cropMatches = CROPS
    .filter(crop => activeCropIds.has(crop.id))
    .filter(crop => normalized.includes(normalizeForMatch(crop.name)) || normalized.includes(normalizeForMatch(crop.id)))
    .map(crop => crop.id)

  return Array.from(new Set([...cropMatches, ...Array.from(varietyMatches.keys())]))
}

async function buildDiaryContext(vkUserId: number, question: string, data: OnboardingData) {
  const relevantCropIds = detectRelevantCropIds(question, data)
  const relevantVarieties = getRelevantVarietyMatches(question, data)
  const relatedEntries = relevantCropIds.length > 0
    ? (await Promise.all(relevantCropIds.map(cropId => loadDiary(vkUserId, cropId)))).flat()
    : await loadDiary(vkUserId)

  const uniqueEntries = Array.from(new Map(relatedEntries.map(entry => [entry.id, entry])).values())
  const scoredEntries = uniqueEntries.map(entry => {
    const parsed = parseDiaryText(entry.text)
    const parsedVariety = parsed.varietyName?.trim() ?? ''
    const matchedVarieties = entry.crop_id ? relevantVarieties.get(entry.crop_id) : undefined
    const hasVarietyMatch = Boolean(parsedVariety && matchedVarieties?.has(parsedVariety))
    const hasCropMatch = Boolean(entry.crop_id && relevantCropIds.includes(entry.crop_id))
    return {
      entry,
      parsed,
      score: hasVarietyMatch ? 3 : hasCropMatch ? 2 : 1,
    }
  })

  scoredEntries.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    return new Date(right.entry.created_at).getTime() - new Date(left.entry.created_at).getTime()
  })

  const selectedEntries = scoredEntries.slice(0, relevantCropIds.length > 0 ? 10 : 6)
  const relevantCropDetails = data.cropEntries
    .filter(entry => relevantCropIds.includes(entry.id))
    .map(entry => {
      const varietySummary = entry.varieties
        .filter(variety => variety.name.trim())
        .map(variety => {
          const parts = [variety.name.trim()]
          if (variety.note?.trim()) parts.push(`пометка: ${variety.note.trim()}`)
          return parts.join(', ')
        })
        .join('; ')
      const operationSummary = formatOperationMemorySummary(entry, 2)
      return `${getCropName(entry.id)}${varietySummary ? ` — ${varietySummary}` : ''}${operationSummary ? ` — недавние операции: ${operationSummary}` : ''}`
    })

  if (selectedEntries.length === 0 && relevantCropDetails.length === 0) return ''

  const diaryLines = selectedEntries.map(({ entry, parsed }) => {
    const operation = entry.crop_id ? getOperationLabel(entry.crop_id, entry.operation) : ''
    const date = new Date(entry.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    const cropLabel = entry.crop_id ? getCropName(entry.crop_id) : 'Огород'
    const varietyLabel = parsed.varietyName ? `, сорт ${parsed.varietyName}` : ''
    const operationLabel = operation ? `, операция ${operation}` : ''
    const kindLabel = `, ${getDiaryEntryKindLabel(parsed.entryKind ?? (entry.operation ? 'done' : 'observation')).toLowerCase()}`
    const detailLabel = parsed.operationDetail ? `, детали ${parsed.operationDetail}` : ''
    return `${date}: ${cropLabel}${varietyLabel}${operationLabel}${kindLabel}${detailLabel} — ${parsed.text}`
  })

  const cropContext = relevantCropDetails.length > 0
    ? `Релевантные сорта и пометки по вопросу: ${relevantCropDetails.join(' | ')}.`
    : ''
  const diaryContext = diaryLines.length > 0
    ? `Недавние записи из дневника пользователя: ${diaryLines.join('; ')}.`
    : ''

  return [
    cropContext,
    diaryContext,
    'Если пользователь спрашивает про конкретный сорт, опирайся в первую очередь на записи и пометки именно по этому сорту, а затем на общую историю культуры.',
  ]
    .filter(Boolean)
    .join(' ')
}

function buildReferralCode(vkUserId: number) {
  return `OG-${vkUserId}`
}

function getNotificationKey(notification: NotificationPreview | null) {
  if (!notification) return ''
  return [notification.type ?? '', notification.created_at ?? '', notification.title, notification.body].join('::')
}

function getDateKeyInTimeZone(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function getHourInTimeZone(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value)
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(date))
}

function formatLongDateInTimeZone(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

function formatActionText(label: string) {
  const parts = label.trim().split(' ')
  return parts.length > 1 ? parts.slice(1).join(' ') : label.trim()
}

function isWithinLastDays(value: string | Date, days: number, base = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  const diff = base.getTime() - date.getTime()
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000
}

function isSameDayInTimeZone(value: string | Date, base: string | Date, timeZone: string) {
  return getDateKeyInTimeZone(value, timeZone) === getDateKeyInTimeZone(base, timeZone)
}

function pickLatestNotification(
  primary: NotificationPreview | null,
  secondary: NotificationPreview | null,
) {
  if (!primary) return secondary
  if (!secondary) return primary

  const primaryTime = new Date(primary.created_at ?? 0).getTime()
  const secondaryTime = new Date(secondary.created_at ?? 0).getTime()
  return primaryTime >= secondaryTime ? primary : secondary
}

function savePendingReferral(code: string) {
  localStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, code)
}

function loadPendingReferral() {
  return localStorage.getItem(PENDING_REFERRAL_STORAGE_KEY) ?? ''
}

function clearPendingReferral() {
  localStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY)
}

function isStandaloneDisplayMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

function detectInstallHintPlatform() {
  const ua = window.navigator.userAgent
  const isIos = /iPhone|iPad|iPod/i.test(ua)
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|YaBrowser/i.test(ua)
  const isAndroid = /Android/i.test(ua)
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua)

  if (isIos && isSafari) return 'ios'
  if (isAndroid) return 'android'
  if (isMobile) return 'mobile'
  return null
}

function isBlankOnboarding(data: OnboardingData) {
  return !data.city.trim()
    && !data.terrain.trim()
    && !data.experience.trim()
    && data.gardenObjects.length === 0
    && data.cropEntries.length === 0
    && data.fertilizers.length === 0
}

export default function App() {
  const requestedView = (() => {
    try {
      return new URL(window.location.href).searchParams.get('view') ?? ''
    } catch {
      return ''
    }
  })()
  const reviewMode = (() => {
    try {
      return new URL(window.location.href).searchParams.get('review') === '1'
    } catch {
      return false
    }
  })()

  useEffect(() => {
    window.__ogorodbotMounted?.()

    const url = new URL(window.location.href)
    const referral = url.searchParams.get('ref')
    if (referral) {
      savePendingReferral(referral)
      url.searchParams.delete('ref')
      window.history.replaceState({}, document.title, `${url.origin}${url.pathname}${url.search}${url.hash}`)
    }
  }, [])

  const [vkAuth, setVkAuth] = useState<VkAuthState | null>(() => reviewMode ? null : loadVkAuth())
  const [telegramAuth, setTelegramAuth] = useState<TelegramAuthState | null>(() => reviewMode ? null : loadTelegramAuth())
  const [reviewAuth, setReviewAuth] = useState<ReviewAuthState | null>(() => loadReviewAuth())
  const [emailAuth, setEmailAuth] = useState<EmailAuthState | null>(null)
  const [guestMode, setGuestMode] = useState(() => localStorage.getItem('ogorod_guest') === '1')
  const [vkInitReady, setVkInitReady] = useState(false)
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [tab, setTab] = useState<Tab>('main')
  const [chatReturnTab, setChatReturnTab] = useState<Tab>('main')
  const [plan, setPlan] = useState<Plan>('free')
  const [gardenData, setGardenData] = useState<OnboardingData>(empty)
  const [vkUserId, setVkUserId] = useState<number>(() => reviewMode
    ? (loadReviewAuth()?.userId ?? 1)
    : (loadVkAuth()?.userId ?? loadTelegramAuth()?.userId ?? loadReviewAuth()?.userId ?? 1))
  const [vkAuthError, setVkAuthError] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [emailAuthLoading, setEmailAuthLoading] = useState(false)
  const [emailAuthMessage, setEmailAuthMessage] = useState('')
  const [reviewLogin, setReviewLogin] = useState('')
  const [reviewPassword, setReviewPassword] = useState('')
  const [reviewAuthLoading, setReviewAuthLoading] = useState(false)
  const [reviewAuthMessage, setReviewAuthMessage] = useState('')
  const [showReviewLogin] = useState(reviewMode)

  useEffect(() => {
    let cancelled = false

    async function initVkIdentity() {
      if (showReviewLogin && !reviewAuth) {
        if (!cancelled) {
          setEmailAuth(null)
          setVkUserId(1)
          setVkInitReady(true)
        }
        return
      }

      const sessionAuth = await getEmailAuthState().catch(() => null)
      if (sessionAuth && !cancelled) {
        setEmailAuth(sessionAuth)
      }

      const hashTelegramAuth = consumeTelegramAuthResult()
      if (hashTelegramAuth && !cancelled) {
        saveTelegramAuth(hashTelegramAuth)
        setTelegramAuth(hashTelegramAuth)
        setVkUserId(hashTelegramAuth.userId)
        void trackAnalyticsEvent({
          vkUserId: hashTelegramAuth.userId,
          eventType: 'auth_success',
          source: 'telegram',
        })
        setVkInitReady(true)
        return
      }

      try {
        const callbackAuth = await consumeVkAuthCallback()
        if (callbackAuth && !cancelled) {
          setVkAuthError('')
          saveVkAuth(callbackAuth)
          setVkAuth(callbackAuth)
          setVkUserId(callbackAuth.userId)
          void trackAnalyticsEvent({
            vkUserId: callbackAuth.userId,
            eventType: 'auth_success',
            source: 'vk',
          })
          setVkInitReady(true)
          return
        }
      } catch (error) {
        if (!cancelled) {
          console.error('VK ID callback error:', error)
          setVkAuthError(error instanceof Error ? error.message : 'Не удалось завершить вход через ВКонтакте')
        }
      }

      if (vkAuth && !showReviewLogin) {
        if (!cancelled) setVkInitReady(true)
        return
      }

      if (telegramAuth && !showReviewLogin) {
        if (!cancelled) {
          setVkUserId(telegramAuth.userId)
          setVkInitReady(true)
        }
        return
      }

      if (reviewAuth && !cancelled) {
        setVkUserId(reviewAuth.userId)
        setVkInitReady(true)
        return
      }

      if (sessionAuth && !cancelled && !showReviewLogin) {
        const nextUserId = hashIdentityToUserId(`email:${sessionAuth.userId}`)
        setVkUserId(nextUserId)
        void trackAnalyticsEvent({
          vkUserId: nextUserId,
          eventType: 'auth_success',
          source: 'email',
        })
        setVkInitReady(true)
        return
      }

      try {
        const bridgeWindow = window as Window & { vkBridge?: VkBridgeLike; VKBridge?: VkBridgeLike }
        const vkBridge = bridgeWindow.vkBridge ?? bridgeWindow.VKBridge
        if (vkBridge && !showReviewLogin) {
          vkBridge.send('VKWebAppGetUserInfo').then(u => {
            if (!cancelled && u?.id) {
              setVkAuthError('Для синхронизации огорода войдите через Telegram, VK ID или email magic link.')
            }
          }).catch(() => {
            // ignore bridge errors
          }).finally(() => {
            if (!cancelled) setVkInitReady(true)
          })
          return
        }
      } catch {
        // ignore bridge errors
      }

      if (!cancelled) setVkInitReady(true)
    }

    void initVkIdentity()

    return () => {
      cancelled = true
    }
  }, [reviewAuth, showReviewLogin, telegramAuth, vkAuth])

  const [messages, setMessages] = useState<Array<{ role: string; text: string; displayText?: string }>>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [dbLoading, setDbLoading] = useState(true)
  const [lastNotif, setLastNotif] = useState<NotificationPreview | null>(null)
  const [recentDiaryEntries, setRecentDiaryEntries] = useState<DiaryEntry[]>([])
  const [optimisticCompletedTaskKeys, setOptimisticCompletedTaskKeys] = useState<string[]>([])
  const [completingTaskKey, setCompletingTaskKey] = useState('')
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installHintPlatform, setInstallHintPlatform] = useState<string | null>(null)
  const [installPromptDismissed, setInstallPromptDismissed] = useState(() => localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === '1')
  const [embeddedBrowserBannerDismissed, setEmbeddedBrowserBannerDismissed] = useState(() => localStorage.getItem(EMBEDDED_BROWSER_BANNER_DISMISSED_KEY) === '1')
  const [chatScrolled, setChatScrolled] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [offlineBundle, setOfflineBundle] = useState<OfflineBundle | null>(null)
  const [offlinePreparing, setOfflinePreparing] = useState(false)
  const [usingOfflineBundle, setUsingOfflineBundle] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatMessagesRef = useRef<HTMLDivElement | null>(null)
  const notificationInitRef = useRef(false)
  const lastNotificationKeyRef = useRef('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const weeklyPlannerAccess = hasWeeklyPlannerAccess(gardenData, plan)
  const shouldLoadWeather = screen === 'main' && tab === 'main' && online
  const liveWeather = useWeather(shouldLoadWeather ? gardenData.city : '')
  const shouldLoadWeeklyPlan = screen === 'main' && (tab === 'main' || tab === 'moon') && weeklyPlannerAccess && online
  const liveWeeklyPlan = useWeeklyPlan(vkUserId, shouldLoadWeeklyPlan, gardenData)
  const weather = shouldLoadWeather
    ? liveWeather
    : (offlineBundle?.weather ?? {
        temp: 0,
        feels: 0,
        desc: '',
        icon: '⛅',
        humidity: 0,
        wind: 0,
        loading: false,
        error: online ? '' : 'Офлайн-копия',
      })
  const weeklyPlan = shouldLoadWeeklyPlan
    ? liveWeeklyPlan
    : {
        days: offlineBundle?.weeklyPlanDays ?? [],
        loading: false,
        error: false,
      }
  const weatherRisks = weather.loading || weather.error
    ? []
    : getWeatherRisks(weather.temp, weather.humidity, gardenData.cropEntries, gardenData.gardenObjects)
  const embeddedBrowser = detectEmbeddedBrowser()
  const showEmbeddedBrowserBanner = Boolean(embeddedBrowser && !embeddedBrowserBannerDismissed)
  const showInstallBanner = !installPromptDismissed
    && !embeddedBrowser
    && !isStandaloneDisplayMode()
    && Boolean(installHintPlatform)
  const effectiveTimeZone = gardenData.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const now = new Date(nowMs)
  const currentHour = getHourInTimeZone(now, effectiveTimeZone)
  const currentDateLabel = formatLongDateInTimeZone(now, effectiveTimeZone)
  const displayName = normalizeDisplayName(gardenData.displayName)
  const uiScaleClass = gardenData.uiTextScale === 'large' ? 'ui-scale-large' : ''
  const helpHintsEnabled = gardenData.helpHintsEnabled !== false
  const seenHints = Array.isArray(gardenData.seenHints) ? gardenData.seenHints : []
  const isOwner = vkUserId === OWNER_VK_ID
    || vkAuth?.userId === OWNER_VK_ID
    || Boolean(emailAuth?.email && OWNER_EMAILS.includes(emailAuth.email.toLowerCase()))
  const ownerAnalyticsUrl = `${window.location.origin}/?view=owner-analytics`
  const shouldShowIntro = screen === 'main' && helpHintsEnabled && gardenData.introSeen === false
  const analyticsViewKeyRef = useRef('')
  const analyticsInitialViewTrackedRef = useRef(false)

  useEffect(() => {
    if (!vkInitReady) return
    if (screen === 'main' && tab === 'main') {
      trackMainView()
    }
  }, [screen, tab, vkInitReady])

  useEffect(() => {
    if (!vkInitReady) return

    const nextPath = screen === 'main'
      ? `/app/${tab}`
      : screen === 'owner-analytics'
        ? '/owner-analytics'
        : `/${screen}`
    const nextTitle = screen === 'main'
      ? `МойАгроном — ${tab}`
      : screen === 'chat'
        ? 'МойАгроном — AI Агроном'
        : screen === 'owner-analytics'
          ? 'МойАгроном — Owner Analytics'
          : 'МойАгроном'

    if (!analyticsInitialViewTrackedRef.current) {
      analyticsInitialViewTrackedRef.current = true
      analyticsViewKeyRef.current = nextPath
      return
    }

    if (analyticsViewKeyRef.current === nextPath) return
    analyticsViewKeyRef.current = nextPath
    trackVirtualPageView(nextPath, nextTitle)
  }, [screen, tab, vkInitReady])

  useEffect(() => {
    const syncClock = () => setNowMs(Date.now())
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncClock()
      }
    }

    const intervalId = window.setInterval(syncClock, 60000)
    window.addEventListener('focus', syncClock)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', syncClock)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    setOfflineBundle(loadOfflineBundle(vkUserId))
  }, [vkUserId])

  function upsertRecentDiaryEntry(entry: DiaryEntry) {
    setRecentDiaryEntries(prev => {
      const next = [entry, ...prev.filter(item => item.id !== entry.id)]
        .filter(item => isWithinLastDays(item.created_at, 7))
      next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      return next
    })
    setGardenData(prev => applyDiaryEntryToOnboardingData(prev, entry))
  }

  function removeRecentDiaryEntry(entryId: number) {
    setRecentDiaryEntries(prev => prev.filter(entry => entry.id !== entryId))
    if (vkUserId > 1 && online) {
      void loadDiary(vkUserId)
        .then(entries => {
          setGardenData(prev => rebuildOperationMemoryFromDiary(prev, entries as DiaryEntry[]))
        })
        .catch(() => {
          // best effort sync after delete
        })
    }
  }

  const buildOfflineSnapshot = useCallback((overrides: Partial<OfflineBundle> = {}): OfflineBundle => {
    return {
      version: 1,
      vkUserId,
      savedAt: new Date().toISOString(),
      onboarding: gardenData,
      plan,
      lastNotif,
      diaryEntries: recentDiaryEntries,
      weeklyPlanDays: weeklyPlan.days,
      weather: weather.error || weather.loading ? null : {
        temp: weather.temp,
        feels: weather.feels,
        desc: weather.desc,
        icon: weather.icon,
        humidity: weather.humidity,
        wind: weather.wind,
        loading: false,
        error: '',
      },
      ...overrides,
    }
  }, [gardenData, lastNotif, plan, recentDiaryEntries, vkUserId, weather.desc, weather.error, weather.feels, weather.humidity, weather.icon, weather.loading, weather.temp, weather.wind, weeklyPlan.days])

  async function prepareOfflineBundle() {
    if (vkUserId <= 1) {
      window.alert('Сначала войдите, чтобы сохранить офлайн-копию.')
      return
    }

    setOfflinePreparing(true)
    try {
      let nextBundle = buildOfflineSnapshot()

      if (online) {
        const [dailyNotif, subscriptionNotif, diary, nextWeather, nextWeeklyPlan] = await Promise.all([
          loadLastNotification(vkUserId),
          loadSubscriptionNotif(vkUserId),
          loadDiary(vkUserId),
          gardenData.city.trim() ? fetchWeatherSnapshot(gardenData.city) : Promise.resolve(null),
          weeklyPlannerAccess ? fetchWeeklyPlanSnapshot(vkUserId, gardenData) : Promise.resolve([]),
        ])

        nextBundle = buildOfflineSnapshot({
          lastNotif: pickLatestNotification(dailyNotif, subscriptionNotif),
          diaryEntries: diary as DiaryEntry[],
          weather: nextWeather && !nextWeather.error ? nextWeather : null,
          weeklyPlanDays: nextWeeklyPlan,
        })
      }

      if (!saveOfflineBundle(nextBundle)) {
        throw new Error('Не удалось сохранить офлайн-копию на устройстве')
      }

      setOfflineBundle(nextBundle)
      if (!online) {
        setUsingOfflineBundle(true)
      }
      window.alert('Офлайн-копия обновлена. Приложение сможет открыть сохранённые данные даже без сети.')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось подготовить офлайн-копию.')
    } finally {
      setOfflinePreparing(false)
    }
  }

  function enterGuestMode() {
    localStorage.setItem('ogorod_guest', '1')
    setGuestMode(true)
  }

  function exitGuestMode() {
    localStorage.removeItem('ogorod_guest')
    localStorage.removeItem('ogorodbot_guest_bundle')
    setGuestMode(false)
  }

  function dismissInstallBanner() {
    localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, '1')
    setInstallPromptDismissed(true)
  }

  function dismissEmbeddedBrowserBanner() {
    localStorage.setItem(EMBEDDED_BROWSER_BANNER_DISMISSED_KEY, '1')
    setEmbeddedBrowserBannerDismissed(true)
  }

  async function copyCurrentUrl() {
    const href = window.location.href
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href)
        window.alert('Ссылка скопирована. Откройте её в обычном браузере.')
        return
      }
    } catch {
      // Fallback below.
    }

    window.prompt('Скопируйте ссылку и откройте её в обычном браузере:', href)
  }

  async function handleInstallApp() {
    if (!installPromptEvent) return
    await installPromptEvent.prompt()
    const choice = await installPromptEvent.userChoice.catch(() => null)
    setInstallPromptEvent(null)
    if (choice?.outcome === 'accepted') {
      dismissInstallBanner()
    }
  }

  function renderInstallBanner(theme: 'auth' | 'main') {
    if (!showInstallBanner) return null

    const isIosHint = installHintPlatform === 'ios' && !installPromptEvent
    const isAndroidHint = installHintPlatform === 'android' && !installPromptEvent

    return (
      <div className={`install-banner install-banner-${theme}`}>
        <div className="install-banner-copy">
          <div className="install-banner-title">Удобнее заходить с иконки</div>
          <div className="install-banner-text">
            {isIosHint
              ? 'Откройте меню Поделиться в Safari и выберите «На экран Домой», чтобы МойАгроном запускался как приложение.'
              : isAndroidHint
                ? 'Откройте меню браузера и выберите «Добавить на главный экран» или «Установить приложение», чтобы входить в один тап.'
                : 'Добавьте МойАгроном на главный экран, и вход будет в один тап, почти как в обычное приложение.'}
          </div>
        </div>
        <div className="install-banner-actions">
          {installPromptEvent ? (
            <button className="install-banner-btn" onClick={() => void handleInstallApp()}>
              Установить
            </button>
          ) : (
            <span className="install-banner-hint">
              {installHintPlatform === 'ios'
                ? 'Safari → Поделиться'
                : installHintPlatform === 'android'
                  ? 'Меню браузера ⋮'
                  : 'Добавить на экран'}
            </span>
          )}
          <button className="install-banner-close" onClick={dismissInstallBanner} aria-label="Скрыть подсказку">
            ✕
          </button>
        </div>
      </div>
    )
  }

  function renderEmbeddedBrowserBanner(theme: 'auth' | 'main', info: EmbeddedBrowserInfo | null) {
    if (!info || !showEmbeddedBrowserBanner) return null

    return (
      <div className={`embedded-browser-banner embedded-browser-banner-${theme}`}>
        <div className="embedded-browser-banner-copy">
          <div className="embedded-browser-banner-title">Лучше открыть в обычном браузере</div>
          <div className="embedded-browser-banner-text">
            Сейчас сайт открыт во {info.label}. В таких окнах часто ломаются вход, возврат после письма, платежи, Telegram-авторизация и часть системных функций.
          </div>
          <div className="embedded-browser-banner-hint">{info.hint}</div>
        </div>
        <div className="embedded-browser-banner-actions">
          <button className="embedded-browser-banner-btn" onClick={() => void copyCurrentUrl()}>
            Скопировать ссылку
          </button>
          <button className="embedded-browser-banner-close" onClick={dismissEmbeddedBrowserBanner} aria-label="Скрыть предупреждение">
            ✕
          </button>
        </div>
      </div>
    )
  }

  function renderVpnHint(theme: 'auth' | 'main') {
    return (
      <div className={`vpn-hint vpn-hint-${theme}`}>
        <div className="vpn-hint-title">Если включён VPN, возможны сбои</div>
        <div className="vpn-hint-text">
          AI-помощник, вход по ссылке из письма и некоторые внешние сервисы могут тормозить или не открываться. Если что-то зависло, сначала попробуйте отключить VPN.
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (!vkInitReady) return
    const savedOfflineBundle = loadOfflineBundle(vkUserId)

    if (!online && savedOfflineBundle) {
      const offlineOnboarding = rebuildOperationMemoryFromDiary(
        { ...empty, ...(savedOfflineBundle.onboarding as Partial<OnboardingData>) },
        savedOfflineBundle.diaryEntries as DiaryEntry[]
      )
      setGardenData(offlineOnboarding)
      setPlan(savedOfflineBundle.plan)
      setLastNotif(savedOfflineBundle.lastNotif)
      setRecentDiaryEntries(savedOfflineBundle.diaryEntries.filter(entry => isWithinLastDays(entry.created_at, 7)))
      setOfflineBundle(savedOfflineBundle)
      setUsingOfflineBundle(true)
      setScreen(isBlankOnboarding(offlineOnboarding) ? 'onboarding' : 'main')
      setDbLoading(false)
      return
    }

    // Guest mode: skip server entirely, restore from local bundle or show onboarding
    if (vkUserId === 1) {
      if (savedOfflineBundle) {
        const offlineOnboarding = rebuildOperationMemoryFromDiary(
          { ...empty, ...(savedOfflineBundle.onboarding as Partial<OnboardingData>) },
          savedOfflineBundle.diaryEntries as DiaryEntry[]
        )
        setGardenData(offlineOnboarding)
        setRecentDiaryEntries(savedOfflineBundle.diaryEntries.filter(entry => isWithinLastDays(entry.created_at, 7)))
        setPlan(savedOfflineBundle.plan)
        setScreen(isBlankOnboarding(offlineOnboarding) ? 'onboarding' : 'main')
      } else {
        setScreen('onboarding')
      }
      setDbLoading(false)
      return
    }

    loadUserData(vkUserId).then(async row => {
      async function finalizeReferral(onboardingInput: OnboardingData, storedPlan: Plan) {
        const onboarding = {
          ...onboardingInput,
          referralCode: onboardingInput.referralCode || buildReferralCode(vkUserId),
        }
        const pendingReferral = loadPendingReferral()

        if (!pendingReferral || vkUserId === 1 || onboarding.referralAppliedCode) {
          if (onboarding.referralCode !== onboardingInput.referralCode) {
            await saveUserData(vkUserId, onboarding, storedPlan)
          }
          return { onboarding, plan: getEffectivePlan(storedPlan, onboarding.subscription) }
        }

        try {
          const applied = await applyReferral(vkUserId, pendingReferral, onboarding, storedPlan)
          clearPendingReferral()
          if (applied.referralApplied) {
            const appliedSubscription = applied.onboarding?.subscription ?? onboarding.subscription
            const appliedBonusLabel = appliedSubscription?.level === 'pro' ? 'текущего тарифа' : 'Базовой подписки'
            void trackAnalyticsEvent({
              vkUserId,
              eventType: 'referral_applied',
              source: 'referral',
              metadata: { code: pendingReferral },
            })
            window.alert(`🎁 Реферальный код применён! Вам начислено 2 дня ${appliedBonusLabel}.`)
          }

          return {
            onboarding: {
              ...onboarding,
              ...(applied.onboarding ?? {}),
            },
            plan: getEffectivePlan((applied.plan as Plan) ?? storedPlan, applied.onboarding?.subscription ?? onboarding.subscription),
          }
        } catch (error) {
          console.error('Referral apply error:', error)
          clearPendingReferral()
          if (onboarding.referralCode !== onboardingInput.referralCode) {
            await saveUserData(vkUserId, onboarding, storedPlan)
          }
          return { onboarding, plan: getEffectivePlan(storedPlan, onboarding.subscription) }
        }
      }

      if (row) {
        const onboarding = { ...empty, ...(row.onboarding as Partial<OnboardingData>) }
        if (!onboarding.notificationEmail && emailAuth?.email) {
          onboarding.notificationEmail = emailAuth.email
        }
        const finalized = await finalizeReferral(onboarding, row.plan as Plan)
        const diaryEntries = await loadDiary(vkUserId).catch(() => [] as DiaryEntry[])
        const hydratedOnboarding = rebuildOperationMemoryFromDiary(finalized.onboarding, diaryEntries)
        setGardenData(hydratedOnboarding)
        setRecentDiaryEntries(diaryEntries.filter(entry => isWithinLastDays(entry.created_at, 7)))
        setPlan(finalized.plan)
        setUsingOfflineBundle(false)
        setScreen(isBlankOnboarding(hydratedOnboarding) ? 'onboarding' : 'main')
        setDbLoading(false)
        return
      }

      if (!online && savedOfflineBundle) {
        const offlineOnboarding = rebuildOperationMemoryFromDiary(
          { ...empty, ...(savedOfflineBundle.onboarding as Partial<OnboardingData>) },
          savedOfflineBundle.diaryEntries as DiaryEntry[]
        )
        setGardenData(offlineOnboarding)
        setPlan(savedOfflineBundle.plan)
        setLastNotif(savedOfflineBundle.lastNotif)
        setRecentDiaryEntries(savedOfflineBundle.diaryEntries.filter(entry => isWithinLastDays(entry.created_at, 7)))
        setOfflineBundle(savedOfflineBundle)
        setUsingOfflineBundle(true)
        setScreen(isBlankOnboarding(offlineOnboarding) ? 'onboarding' : 'main')
        setDbLoading(false)
        return
      }

      // New authenticated user: try migrating guest draft first
      const guestBundle = loadOfflineBundle(1)
      if (guestBundle && !isBlankOnboarding({ ...empty, ...(guestBundle.onboarding as Partial<OnboardingData>) })) {
        const migratedOnboarding: OnboardingData = {
          ...empty,
          ...(guestBundle.onboarding as Partial<OnboardingData>),
          referralCode: buildReferralCode(vkUserId),
          notificationEmail: emailAuth?.email ?? (guestBundle.onboarding as OnboardingData).notificationEmail ?? '',
          vkContactUserId: vkAuth?.userId ?? 0,
          telegramChatId: telegramAuth?.id ?? 0,
          telegramUsername: telegramAuth?.username ?? '',
          notifChannels: telegramAuth?.id
            ? [...new Set(['tg', ...((guestBundle.onboarding as OnboardingData).notifChannels ?? [])])]
            : (guestBundle.onboarding as OnboardingData).notifChannels ?? empty.notifChannels,
        }
        await saveUserData(vkUserId, migratedOnboarding, 'free')
        for (const entry of guestBundle.diaryEntries) {
          await addDiaryEntry(vkUserId, entry.crop_id, entry.operation, entry.text).catch(() => {})
        }
        localStorage.removeItem('ogorodbot_guest_bundle')
        localStorage.removeItem('ogorod_guest')
        setGuestMode(false)
        const diaryEntries = await loadDiary(vkUserId).catch(() => [] as DiaryEntry[])
        const hydratedOnboarding = rebuildOperationMemoryFromDiary(migratedOnboarding, diaryEntries)
        setGardenData(hydratedOnboarding)
        setRecentDiaryEntries(diaryEntries.filter(entry => isWithinLastDays(entry.created_at, 7)))
        setPlan('free')
        setUsingOfflineBundle(false)
        setScreen(isBlankOnboarding(hydratedOnboarding) ? 'onboarding' : 'main')
        setDbLoading(false)
        return
      }

      const cleanOnboarding = {
        ...empty,
        referralCode: buildReferralCode(vkUserId),
        notificationEmail: emailAuth?.email ?? '',
        vkContactUserId: vkAuth?.userId ?? 0,
        telegramChatId: telegramAuth?.id ?? 0,
        telegramUsername: telegramAuth?.username ?? '',
        notifChannels: telegramAuth?.id
          ? [...new Set(['tg', ...empty.notifChannels])]
          : empty.notifChannels,
      }
      const finalized = await finalizeReferral(cleanOnboarding, 'free')
      setGardenData(finalized.onboarding)
      setPlan(finalized.plan)
      setUsingOfflineBundle(false)
      if (finalized.onboarding.referralAppliedCode) {
        await saveUserData(vkUserId, finalized.onboarding, 'free')
      }
      setScreen('onboarding')
      setDbLoading(false)
    })
  }, [vkInitReady, vkUserId, emailAuth, online, telegramAuth?.id, telegramAuth?.username, vkAuth?.userId])

  useEffect(() => {
    if (requestedView !== 'owner-analytics') return
    if (dbLoading) return
    setScreen('owner-analytics')
  }, [dbLoading, requestedView])

  useEffect(() => {
    if (screen !== 'main' || vkUserId === 1 || !online) return

    let cancelled = false

    const syncNotifications = async (isInitial: boolean) => {
      const [daily, sub] = await Promise.all([
        loadLastNotification(vkUserId),
        loadSubscriptionNotif(vkUserId),
      ])

      if (cancelled) return

      const nextNotif = pickLatestNotification(daily, sub)
      setLastNotif(nextNotif)

      const nextKey = getNotificationKey(nextNotif)
      if (!nextKey) return

      if (isInitial || !notificationInitRef.current) {
        notificationInitRef.current = true
        lastNotificationKeyRef.current = nextKey
        return
      }

      if (lastNotificationKeyRef.current === nextKey) return
      lastNotificationKeyRef.current = nextKey

      if (!nextNotif) return
    }

    void syncNotifications(true)
    const handleFocus = () => {
      void syncNotifications(false)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncNotifications(false)
      }
    }
    const intervalId = window.setInterval(() => {
      void syncNotifications(false)
    }, 60000)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [online, screen, vkUserId])

  useEffect(() => {
    if (screen !== 'main') return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveUserData(vkUserId, gardenData, plan)
    }, 1000)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [gardenData, plan, screen, vkUserId])

  useEffect(() => {
    if (dbLoading) return

    const nextBundle = buildOfflineSnapshot()
    if (!saveOfflineBundle(nextBundle)) return
    setOfflineBundle(nextBundle)
  }, [buildOfflineSnapshot, dbLoading])

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!browserTimeZone) return
    if (gardenData.timeZone === browserTimeZone) return
    setGardenData(prev => ({ ...prev, timeZone: prev.timeZone || browserTimeZone }))
  }, [gardenData.timeZone])

  useEffect(() => {
    if (isStandaloneDisplayMode()) {
      setInstallHintPlatform(null)
      setInstallPromptEvent(null)
      return
    }

    setInstallHintPlatform(detectInstallHintPlatform())

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPromptEvent(event as BeforeInstallPromptEvent)
    }

    const handleInstalled = () => {
      setInstallPromptEvent(null)
      dismissInstallBanner()
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    const contactVkUserId = vkAuth?.userId ?? 0
    if (!contactVkUserId) return
    if (gardenData.vkContactUserId === contactVkUserId) return
    setGardenData(prev => ({ ...prev, vkContactUserId: contactVkUserId }))
  }, [gardenData.vkContactUserId, vkAuth?.userId])

  useEffect(() => {
    const telegramChatId = telegramAuth?.id ?? 0
    if (!telegramChatId) return

    const nextTelegramUsername = telegramAuth?.username ?? ''
    const shouldEnableTg = !gardenData.notifChannels.includes('tg')
    const shouldPatchIdentity = gardenData.telegramChatId !== telegramChatId
      || (nextTelegramUsername && gardenData.telegramUsername !== nextTelegramUsername)

    if (!shouldEnableTg && !shouldPatchIdentity) return

    setGardenData(prev => ({
      ...prev,
      telegramChatId,
      telegramUsername: nextTelegramUsername || prev.telegramUsername || '',
      notifChannels: shouldEnableTg ? [...new Set([...prev.notifChannels, 'tg'])] : prev.notifChannels,
    }))
  }, [gardenData.notifChannels, gardenData.telegramChatId, gardenData.telegramUsername, telegramAuth?.id, telegramAuth?.username])

  useEffect(() => {
    let cancelled = false
    const shouldSyncRecentDiary = screen === 'main' && (tab === 'main' || tab === 'plants')

    async function syncTodayDiary() {
      if (!shouldSyncRecentDiary || !vkInitReady || vkUserId === 1 || !online) {
        return
      }

      const diary = await loadDiary(vkUserId)
      if (cancelled) return
      setGardenData(prev => rebuildOperationMemoryFromDiary(prev, diary as DiaryEntry[]))
      const recentEntries = (diary as DiaryEntry[]).filter(entry => isWithinLastDays(entry.created_at, 7))
      setRecentDiaryEntries(recentEntries)
      setOptimisticCompletedTaskKeys(prev => {
          const persistedKeys = new Set(
            recentEntries
            .filter(entry => entry.crop_id && entry.operation && isDiaryEntryCompletedOperation(entry) && isSameDayInTimeZone(entry.created_at, new Date(), effectiveTimeZone))
            .map(entry => `${entry.crop_id}:${entry.operation}`)
        )
        return prev.filter(key => !persistedKeys.has(key))
      })
    }

    void syncTodayDiary()
    const handleFocus = () => {
      void syncTodayDiary()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncTodayDiary()
      }
    }
    const intervalId = window.setInterval(() => {
      void syncTodayDiary()
    }, 5 * 60 * 1000)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [effectiveTimeZone, online, screen, tab, vkInitReady, vkUserId])

  useEffect(() => {
    if (screen !== 'chat') return
    const container = chatMessagesRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, screen])

  const requiresAuthScreen = showReviewLogin
    ? !reviewAuth
    : !vkAuth && !telegramAuth && !emailAuth && vkUserId === 1 && !guestMode

  if (dbLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🌱</div>
        <div style={{ color: '#666', fontSize: 14 }}>Загрузка огорода...</div>
      </div>
    )
  }

  if (requiresAuthScreen) {
    return (
      <div className="site-auth-screen">
        <div className="site-auth-header">
          <div className="site-auth-brand">🌱 МойАгроном</div>
        </div>

        <div className="site-auth-content">
          <div className="site-auth-hero">
            <div className="site-auth-hero-glow" />
            <div className="site-auth-hero-veg veg-tomato">🍅</div>
            <div className="site-auth-hero-veg veg-carrot">🥕</div>
            <div className="site-auth-hero-veg veg-cucumber">🥒</div>
            <div className="site-auth-hero-veg veg-eggplant">🍆</div>
            <div className="site-auth-logo">🌿</div>
          </div>
          <h1 className="site-auth-title">МойАгроном</h1>
          <p className="site-auth-subtitle">План, дневник и советы по вашему огороду</p>

          <div className="site-auth-choice">
            Самые надёжные входы для новых устройств сейчас: email, Telegram и VK. Email подойдёт всем, Telegram удобен тем, кто и так живёт в мессенджере, а VK оставлен как быстрый вариант для тех, у кого VK ID уже настроен.
          </div>
          {renderEmbeddedBrowserBanner('auth', embeddedBrowser)}
          {renderVpnHint('auth')}
          {renderInstallBanner('auth')}

          <div className="site-auth-email-box">
            <div className="site-auth-method-label">1. Вход по email</div>
            <input
              className="site-auth-email-input"
              type="email"
              placeholder="name@example.com"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <button className="site-auth-email-btn" disabled={emailAuthLoading || !emailInput.trim()} onClick={handleEmailLogin}>
              {emailAuthLoading ? 'Отправляю...' : 'Войти по email'}
            </button>
          </div>

          <div className="site-auth-divider"><span>или</span></div>

          <div className="site-auth-email-box">
            <div className="site-auth-method-label">2. Вход через Telegram</div>
            {hasTelegramBotUsername() ? (
              <>
                <a className="site-auth-telegram-btn" href="/telegram-login.html">
                  Перейти ко входу через Telegram
                </a>
                <div className="site-auth-telegram-note">
                  Откроется отдельная страница с официальной кнопкой Telegram. После подтверждения сервис вернёт вас обратно на сайт.
                </div>
              </>
            ) : (
              <div className="site-auth-telegram-note">
                Telegram-вход появится сразу после настройки бота и привязки домена в @BotFather.
              </div>
            )}
          </div>

          <div className="site-auth-divider"><span>или</span></div>

          <div className="site-auth-email-box">
            <div className="site-auth-method-label">3. Вход через ВКонтакте</div>
            <button className="site-auth-vk-btn" disabled={!hasVkAppId()} onClick={handleVkLogin}>
              <span className="site-auth-vk-icon">VK</span>
              Войти через ВКонтакте
            </button>
          </div>

          <div className="site-auth-divider"><span>или</span></div>

          <div className="site-auth-guest-box">
            <button className="site-auth-guest-btn" onClick={enterGuestMode}>
              Попробовать без входа
            </button>
            <div className="site-auth-guest-note">
              Данные сохранятся только на этом устройстве. При входе в аккаунт всё перенесётся автоматически.
            </div>
          </div>

          <p className="site-auth-note">
            Мы используем выбранный способ входа, чтобы сохранять огород, дневник и подписку на любом устройстве.
          </p>
          <div className="site-auth-account-warning">
            <div className="site-auth-account-warning-title">Аккаунт создастся при первом входе</div>
            <div className="site-auth-account-warning-text">
              Огород и подписка будут привязаны к этому способу входа. Если потом войти через другой способ, данные не перенесутся автоматически.
            </div>
          </div>

          {showReviewLogin && (
            <div className="site-auth-email-box" style={{ marginTop: 10 }}>
              <div className="site-auth-method-label">Тестовый вход для проверки</div>
              <input
                className="site-auth-email-input"
                type="text"
                placeholder="Логин"
                value={reviewLogin}
                onChange={e => setReviewLogin(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <input
                className="site-auth-email-input"
                type="password"
                placeholder="Пароль"
                value={reviewPassword}
                onChange={e => setReviewPassword(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                style={{ marginTop: 8 }}
              />
              <button
                className="site-auth-email-btn"
                disabled={reviewAuthLoading || !reviewLogin.trim() || !reviewPassword}
                onClick={handleReviewLogin}
              >
                {reviewAuthLoading ? 'Проверяю...' : 'Войти в тестовый кабинет'}
              </button>
            </div>
          )}

          {!hasVkAppId() && (
            <div className="site-auth-warning">
              VK-вход ещё не настроен для этого окружения.
            </div>
          )}

          {vkAuthError && (
            <div className="site-auth-warning">
              {vkAuthError}
            </div>
          )}

          {emailAuthMessage && (
            <div className={emailAuthMessage.startsWith('Письмо отправлено') ? 'site-auth-success' : 'site-auth-warning'}>
              {emailAuthMessage}
            </div>
          )}

          {reviewAuthMessage && (
            <div className={reviewAuthMessage.startsWith('Тестовый кабинет открыт') ? 'site-auth-success' : 'site-auth-warning'}>
              {reviewAuthMessage}
            </div>
          )}
        </div>
      </div>
    )
  }

  const updateEntry = (id: string, patch: Partial<CropEntry>) =>
    setGardenData(prev => ({ ...prev, cropEntries: prev.cropEntries.map(e => e.id === id ? { ...e, ...patch } : e) }))
  const addEntry = (entry: CropEntry) =>
    setGardenData(prev => ({ ...prev, cropEntries: [...prev.cropEntries, entry] }))
  const deleteEntry = (id: string) =>
    setGardenData(prev => ({ ...prev, cropEntries: prev.cropEntries.filter(e => e.id !== id) }))
  const updateData = (patch: Partial<OnboardingData>) =>
    setGardenData(prev => ({ ...prev, ...patch }))

  function updateRainObservation(date: string, status: 'soaked' | 'light' | 'missed') {
    setGardenData(prev => ({
      ...prev,
      rainObservations: upsertRainObservation(prev.rainObservations, date, status),
    }))
  }

  function markHintSeen(hintId: HelpHintId) {
    setGardenData(prev => {
      const currentSeenHints = Array.isArray(prev.seenHints) ? prev.seenHints : []
      if (currentSeenHints.includes(hintId)) return prev
      return { ...prev, seenHints: [...currentSeenHints, hintId] }
    })
  }

  function disableHelpHints() {
    updateData({ helpHintsEnabled: false, introSeen: true })
  }

  function finishIntro() {
    updateData({ introSeen: true })
  }

  function replayIntro() {
    setScreen('main')
    setTab('main')
    updateData({ helpHintsEnabled: true, introSeen: false })
  }

  function renderHelpHint(hintId: HelpHintId) {
    if (!helpHintsEnabled || seenHints.includes(hintId)) return null
    const hint = HELP_HINTS[hintId]

    return (
      <div className="help-banner" key={hint.id}>
        <div className="help-banner-top">
          <div>
            <div className="help-banner-title">{hint.title}</div>
            <div className="help-banner-text">{hint.text}</div>
          </div>
          <button className="help-banner-close" onClick={() => markHintSeen(hintId)} aria-label="Скрыть подсказку">
            ✕
          </button>
        </div>
        <div className="help-banner-actions">
          <button className="help-banner-action primary" onClick={() => markHintSeen(hintId)}>Понятно</button>
          <button className="help-banner-action" onClick={disableHelpHints}>Выключить подсказки</button>
        </div>
      </div>
    )
  }

  function renderIntroOverlay() {
    if (!shouldShowIntro) return null

    return (
      <div className="modal-overlay help-intro-overlay" onClick={finishIntro}>
        <div className="modal-sheet help-intro-sheet" onClick={event => event.stopPropagation()}>
          <div className="modal-handle" />
          <div className="help-intro-badge">Быстрое знакомство</div>
          <div className="help-intro-title">Как здесь не потеряться</div>
          <div className="help-intro-sub">
            Ничего длинного: вот где что находится и куда идти в первую очередь.
          </div>
          <div className="help-intro-list">
            <div className="help-intro-item">
              <div className="help-intro-item-title">Главная</div>
              <div className="help-intro-item-text">Совет дня, быстрые дела, факты и вход к агроному.</div>
            </div>
            <div className="help-intro-item">
              <div className="help-intro-item-title">Растения</div>
              <div className="help-intro-item-text">Карточки культур, удобрения и быстрый вопрос по конкретной культуре.</div>
            </div>
            <div className="help-intro-item">
              <div className="help-intro-item-title">Луна и Дневник</div>
              <div className="help-intro-item-text">План недели даёт ориентир, а дневник помогает делать советы точнее.</div>
            </div>
            <div className="help-intro-item">
              <div className="help-intro-item-title">Профиль</div>
              <div className="help-intro-item-text">Там объекты, инструменты, уведомления и переключатель подсказок.</div>
            </div>
          </div>
          <div className="help-intro-actions">
            <button className="btn-primary btn-full" onClick={finishIntro}>Понятно, показать по делу</button>
            <button className="help-intro-secondary" onClick={disableHelpHints}>Сразу без подсказок</button>
          </div>
        </div>
      </div>
    )
  }

  function handleVkLogin() {
    setVkAuthError('')
    void openVkLogin().catch(error => {
      setVkAuthError(error instanceof Error ? error.message : 'Не удалось открыть VK ID')
    })
  }

  function handleEmailLogin() {
    const email = emailInput.trim()
    if (!email) return
    setEmailAuthLoading(true)
    setEmailAuthMessage('')
    void sendEmailMagicLink(email)
      .then(() => {
        setEmailAuthMessage(`Письмо отправлено на ${email}. Открой ссылку из письма, чтобы войти.`)
      })
      .catch(error => {
        setEmailAuthMessage(error instanceof Error ? error.message : 'Не удалось отправить ссылку для входа')
      })
      .finally(() => {
        setEmailAuthLoading(false)
      })
  }

  function handleReviewLogin() {
    const login = reviewLogin.trim()
    if (!login || !reviewPassword) return
    setReviewAuthLoading(true)
    setReviewAuthMessage('')
    void verifyReviewLogin(login, reviewPassword)
      .then(() => {
        const nextReviewAuth: ReviewAuthState = {
          login,
          password: reviewPassword,
          userId: REVIEW_USER_ID,
        }
        saveReviewAuth(nextReviewAuth)
        setReviewAuth(nextReviewAuth)
        setVkUserId(REVIEW_USER_ID)
        setReviewAuthMessage('Тестовый кабинет открыт.')
      })
      .catch(error => {
        setReviewAuthMessage(error instanceof Error ? error.message : 'Не удалось войти в тестовый кабинет')
      })
      .finally(() => {
        setReviewAuthLoading(false)
      })
  }

  function handleVkLogout() {
    logoutVk()
    clearTelegramAuth()
    clearReviewAuth()
    setReviewAuth(null)
    if (emailAuth) {
      void signOutEmailAuth()
    }
    setEmailAuth(null)
    setVkAuth(null)
    setTelegramAuth(null)
    setVkUserId(1)
    setVkInitReady(true)
  }

  function handleOnboardingDone(d: OnboardingData) {
    const nextOnboarding: OnboardingData = {
      ...d,
      vkContactUserId: vkAuth?.userId ?? d.vkContactUserId ?? 0,
      telegramChatId: telegramAuth?.id ?? d.telegramChatId ?? 0,
      telegramUsername: telegramAuth?.username ?? d.telegramUsername ?? '',
      notifChannels: telegramAuth?.id
        ? [...new Set([...(d.notifChannels ?? []), 'tg'])]
        : d.notifChannels,
    }

    setGardenData(nextOnboarding)
    saveUserData(vkUserId, nextOnboarding, plan)
    void trackAnalyticsEvent({
      vkUserId,
      eventType: 'onboarding_complete',
      source: 'onboarding',
      metadata: {
        city: nextOnboarding.city,
        crops: nextOnboarding.cropEntries.length,
        objects: nextOnboarding.gardenObjects.length,
      },
    })
    const cropNames = nextOnboarding.cropEntries.slice(0, 3).map(e => CROPS.find(c => c.id === e.id)?.name).filter(Boolean).join(', ')
    const nextDisplayName = normalizeDisplayName(nextOnboarding.displayName)
    const greeting = `Привет${nextDisplayName ? `, ${nextDisplayName}` : ''}! 🌱 Я знаю ваш огород в ${nextOnboarding.city}.

Вот что я умею:
• 🌤️ Каждое утро в ${nextOnboarding.notifMorning} — совет с учётом погоды
• 🌿 Помогаю вести культуры и план работ${cropNames ? ` (${cropNames}${nextOnboarding.cropEntries.length > 3 ? ' и др.' : ''})` : ''}
• ⚠️ Предупреждаю о заморозках, болезнях и вредителях
• 💧 Напоминаю о поливе, подкормке и других операциях

Сразу после входа можно добавить культуры и места выращивания во вкладке "Растения".

Просто спрашивайте — отвечу с учётом вашего климата и того, что вы заполните в приложении. Удачного сезона! 🥕`
    setMessages([{ role: 'bot', text: greeting }])
    setScreen('main')
  }

  function openOwnerAnalytics() {
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'owner-analytics')
    window.history.replaceState({}, '', url.toString())
    setScreen('owner-analytics')
  }

  function closeOwnerAnalytics() {
    const url = new URL(window.location.href)
    url.searchParams.delete('view')
    window.history.replaceState({}, '', url.toString())
    setScreen('main')
    setTab('profile')
  }

  async function askAgronomist(question: string, displayQuestion = question) {
    if (loading) return
    setMessages(m => [...m, { role: 'user', text: question, displayText: displayQuestion }])
    setLoading(true)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 25000)
    try {
      const diaryContext = await buildDiaryContext(vkUserId, question, gardenData).catch(() => '')
      const contextualQuestion = `${buildAgronomistContext(gardenData, plan)}${diaryContext ? ` ${diaryContext}` : ''}\n\nВопрос пользователя: ${question}`
      const data = await requestAgronomistAnswer({
        vkUserId,
        question: contextualQuestion,
        gardenContext: gardenData,
        plan,
      })
      const answer = typeof data?.answer === 'string' ? sanitizeAiText(data.answer) : ''
      if (!answer) {
        throw new Error('Сервис агронома вернул пустой ответ. Попробуйте ещё раз.')
      }
      setMessages(m => [...m, { role: 'bot', text: answer }])
    } catch (error) {
      const message = error instanceof Error
        ? error.name === 'AbortError'
          ? 'Агроном отвечает слишком долго. Попробуйте ещё раз через минуту.'
          : error.message
        : 'Ошибка соединения. Попробуйте ещё раз.'
      setMessages(m => [...m, { role: 'bot', text: message }])
    } finally {
      window.clearTimeout(timeout)
      setLoading(false)
    }
  }

  async function sendMessage() {
    if (!input.trim()) return
    const question = input
    setInput('')
    await askAgronomist(question)
  }

  const todayTasks = gardenData.cropEntries
    .filter(entry => entry.status === 'planted')
    .slice(0, 4)
    .map(entry => {
      const crop = CROPS.find(item => item.id === entry.id)
      const location = gardenData.gardenObjects.find(object => object.uid === entry.location)
      const op = getPrimaryOp(entry.id)
      return {
        key: `${entry.id}:${op.id}`,
        entry,
        crop,
        op,
        locationName: location?.name ?? '',
      }
    })
    .filter(task => Boolean(task.crop))

  const hasPlantedCrops = gardenData.cropEntries.some(entry => entry.status === 'planted')
  const todayDiaryEntries = recentDiaryEntries.filter(entry => isSameDayInTimeZone(entry.created_at, now, effectiveTimeZone))
  const persistedCompletedTodayTaskKeys = new Set(
    todayDiaryEntries
      .filter(entry => entry.crop_id && entry.operation && isDiaryEntryCompletedOperation(entry))
      .map(entry => `${entry.crop_id}:${entry.operation}`)
  )
  const completedTodayTaskKeys = new Set([
    ...persistedCompletedTodayTaskKeys,
    ...optimisticCompletedTaskKeys,
  ])
  const completedTodayTaskCount = todayTasks.filter(task => completedTodayTaskKeys.has(task.key)).length
  const weeklyPlanOffer = buildSubscriptionOffers().find(offer => offer.kind === 'weekly_plan') ?? null
  const weeklyPlanPreviewDay = weeklyPlan.days.find(day => day.tasks.length > 0) ?? weeklyPlan.days[0] ?? null
  const weeklyPlanTaskCount = weeklyPlan.days.reduce((sum, day) => sum + day.tasks.length, 0)

  async function handleCompleteTodayTask(entry: CropEntry) {
    const op = getPrimaryOp(entry.id)
    const taskKey = `${entry.id}:${op.id}`
    if (completedTodayTaskKeys.has(taskKey) || completingTaskKey) return

    setOptimisticCompletedTaskKeys(prev => prev.includes(taskKey) ? prev : [...prev, taskKey])
    setCompletingTaskKey(taskKey)
    const diaryText = `Сделано по плану дня: ${formatActionText(op.label)}`
    try {
      const savedEntry = await addDiaryEntry(vkUserId, entry.id, op.id, diaryText, { dedupeScope: 'daily_task' })
      upsertRecentDiaryEntry(savedEntry)
      void trackAnalyticsEvent({
        vkUserId,
        eventType: 'daily_task_done',
        source: tab,
        metadata: { cropId: entry.id, operationId: op.id },
      })
    } catch (error) {
      setOptimisticCompletedTaskKeys(prev => prev.filter(key => key !== taskKey))
      window.alert(error instanceof Error ? error.message : 'Не удалось отметить задачу в дневнике. Попробуйте ещё раз.')
    }

    setCompletingTaskKey('')
  }

  function openChat(targetTab: Tab = tab) {
    setChatReturnTab(targetTab)
    setScreen('chat')
  }

  function requestPreparedCropAdvice(question: string, displayQuestion: string, sourceTab: Tab = 'plants') {
    setChatReturnTab(sourceTab)
    setScreen('chat')
    void askAgronomist(question, displayQuestion)
  }

  if (screen === 'onboarding') return <AppOnboarding onDone={handleOnboardingDone} />

  if (screen === 'chat') {
    return (
      <div className={`screen chat ${uiScaleClass}`.trim()}>
        <div className="chat-header">
          <button className="back-btn" onClick={() => { setTab(chatReturnTab); setScreen('main') }}>←</button>
          <div><div className="chat-title">🤖 AI Агроном</div><div className="chat-sub">Знает ваш огород</div></div>
        </div>
        <div
          ref={chatMessagesRef}
          className="chat-messages"
          onScroll={e => {
            const element = e.currentTarget
            setChatScrolled(element.scrollTop > 120)
          }}
        >
          {messages.map((m, i) => <div key={i} className={`msg msg-${m.role}`}>{m.displayText ?? m.text}</div>)}
          {loading && <div className="msg msg-bot loading">Думаю...</div>}
        </div>
        {chatScrolled && (
          <button
            className="chat-scroll-top"
            onClick={() => chatMessagesRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            ↑ Вверх
          </button>
        )}
        <div className="chat-input">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && void sendMessage()}
            placeholder="Задать вопрос..."
          />
          <button disabled={loading} onClick={() => void sendMessage()}>{loading ? '…' : '➤'}</button>
        </div>
      </div>
    )
  }

  if (screen === 'owner-analytics') {
    return (
      <div className={`screen main ${uiScaleClass}`.trim()}>
        <AppOwnerAnalyticsScreen
          isOwner={isOwner}
          onBack={closeOwnerAnalytics}
        />
      </div>
    )
  }

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'main', icon: '🏠', label: 'Главная' },
    { id: 'plants', icon: '🌱', label: 'Растения' },
    { id: 'diary', icon: '📖', label: 'Дневник' },
    { id: 'moon', icon: '🌙', label: 'Луна' },
    { id: 'profile', icon: '👤', label: 'Профиль' },
  ]
  const subscriptionNotice = getSubscriptionNotice(gardenData.subscription)

  return (
    <div className={`screen main ${uiScaleClass}`.trim()}>
      <div className="main-header">
        <div>
          <div className="greeting">{(() => {
            const h = currentHour
            const baseGreeting = h >= 5 && h < 12 ? 'Доброе утро' : h >= 12 && h < 17 ? 'Добрый день' : h >= 17 && h < 22 ? 'Добрый вечер' : 'Доброй ночи'
            return displayName ? `${baseGreeting}, ${displayName}` : baseGreeting
          })()}</div>
          <div className="date">{currentDateLabel}</div>
        </div>
        <AppLunarBadge />
      </div>
      <div className="tab-scroll">
        {tab === 'main' && (
          <div className="tab-content">
            {guestMode && (gardenData.cropEntries.length > 0 || recentDiaryEntries.length > 0) && (
              <div className="guest-upgrade-banner">
                <div className="guest-upgrade-text">
                  <span className="guest-upgrade-icon">☁️</span>
                  Данные хранятся только на этом устройстве. Войдите, чтобы не потерять огород.
                </div>
                <div className="guest-upgrade-actions">
                  <button className="guest-upgrade-btn" onClick={exitGuestMode}>Сохранить в аккаунт</button>
                </div>
              </div>
            )}
            {renderEmbeddedBrowserBanner('main', embeddedBrowser)}
            {renderVpnHint('main')}
            {renderInstallBanner('main')}
            {renderHelpHint('main-overview')}
            {!online && offlineBundle && (
              <div className="sub-alert-card">
                <div className="sub-alert-title">Офлайн-режим</div>
                <div className="sub-alert-body">
                  Показываю сохранённую копию данных от {new Date(offlineBundle.savedAt).toLocaleString('ru-RU')}. Чат, оплата и свежая погода без сети не обновляются.
                </div>
              </div>
            )}
            <div className="section-title" style={{ padding: '0 16px', marginTop: 4 }}>Сегодня в огороде</div>
            {todayTasks.length > 0 ? (
              <>
                <div className="today-focus-card">
                  <div className="today-focus-top">
                    <div>
                      <div className="today-focus-title">План на день</div>
                      <div className="today-focus-sub">
                        Отмечайте выполненное, чтобы копилась история ухода и было проще держать ритм каждый день.
                      </div>
                    </div>
                    <div className="today-focus-progress">
                      <span className="today-focus-progress-value">{completedTodayTaskCount}/{todayTasks.length}</span>
                      <span className="today-focus-progress-label">выполнено</span>
                    </div>
                  </div>
                  {weatherRisks.length > 0 && (
                    <div className="today-risk-row">
                      {weatherRisks.slice(0, 2).map((risk, index) => (
                        <div key={`${risk.text}-${index}`} className={`risk-badge risk-${risk.type}`}>{risk.text}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ops-list">
                  {todayTasks.map(task => {
                    const taskDone = completedTodayTaskKeys.has(task.key)
                    return (
                      <div key={task.key} className={`op-row ${taskDone ? 'is-complete' : ''}`} onClick={() => setTab('plants')}>
                        <span className="op-icon">{task.crop?.icon}</span>
                        <div className="op-info">
                          <div className="op-name">{task.crop?.name}</div>
                          <div className="op-action">
                            {taskDone
                              ? 'Отмечено в дневнике сегодня'
                              : `${task.op.label}${task.locationName ? ` · ${task.locationName}` : ''}`}
                          </div>
                        </div>
                        <button
                          className={`btn-done-sm ${taskDone ? 'done' : ''}`}
                          disabled={taskDone || completingTaskKey === task.key}
                          aria-label={taskDone ? `Задача для ${task.crop?.name} уже отмечена` : `Отметить задачу для ${task.crop?.name}`}
                          onClick={e => {
                            e.stopPropagation()
                            void handleCompleteTodayTask(task.entry)
                          }}
                        >
                          {taskDone ? 'Готово' : completingTaskKey === task.key ? '...' : 'Отметить'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="focus-card main-empty-card">
                <div className="main-empty-icon">🌱</div>
                <div className="focus-card-label">Старт за минуту</div>
                <div className="focus-card-title">Добавьте 1-2 культуры, и здесь появится ваш план на сегодня</div>
                <div className="focus-card-body">
                  После этого главная начнёт собирать понятные действия по растениям, погодные риски и недельный план без лишней суеты.
                </div>
                <div className="focus-card-actions">
                  <button className="focus-card-action" onClick={() => setTab('plants')}>
                    Добавить культуры
                  </button>
                </div>
              </div>
            )}
            {hasPlantedCrops && (weeklyPlannerAccess ? (
              <div className="focus-card planner-focus-card">
                <div className="focus-card-label">План на 7 дней</div>
                <div className="focus-card-top">
                  <div>
                    <div className="focus-card-title">Неделя уже собрана под ваш огород</div>
                    <div className="focus-card-body">
                      {plan === 'pro'
                        ? 'Функция входит в Про. План пересчитывается под текущий состав огорода.'
                        : gardenData.weeklyPlanAccessUntil
                          ? `Отдельный доступ активен до ${formatDateLabel(gardenData.weeklyPlanAccessUntil)}.`
                          : 'Доступ активен.'}
                    </div>
                  </div>
                  <div className="focus-badge">{weeklyPlanTaskCount}</div>
                </div>
                {weeklyPlan.loading && (
                  <div className="focus-card-body">Собираю задачи на ближайшие дни...</div>
                )}
                {weeklyPlan.error && (
                  <div className="focus-card-body" style={{ color: '#fca5a5' }}>
                    План временно не загрузился. Можно открыть вкладку Луны и попробовать ещё раз.
                  </div>
                )}
                {!weeklyPlan.loading && !weeklyPlan.error && weeklyPlanPreviewDay && (
                  <div className="planner-preview-list">
                    {weeklyPlanPreviewDay.tasks.slice(0, 3).map((task, index) => {
                      return (
                        <div key={`${weeklyPlanPreviewDay.date}-${task.crop}-${task.action}-${index}`} className="planner-preview-item">
                          <div className="planner-preview-main">
                            <span className="planner-preview-action">{task.action}</span>
                            <span className="planner-preview-crop">{task.crop}</span>
                          </div>
                          {task.reason && <span className="planner-preview-reason">{task.reason}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
                {!weeklyPlan.loading && !weeklyPlan.error && weeklyPlan.days.length === 0 && (
                  <div className="focus-card-body">
                    Добавьте посаженные культуры, и план начнёт собираться автоматически.
                  </div>
                )}
                <button
                  className="focus-card-action"
                  onClick={() => {
                    void trackAnalyticsEvent({ vkUserId, eventType: 'weekly_plan_opened', source: 'main' })
                    setTab('moon')
                  }}
                >
                  Открыть план недели
                </button>
              </div>
            ) : (
              <div className="focus-card planner-focus-card locked">
                <div className="focus-card-label">Разовая функция</div>
                <div className="focus-card-title">План на 7 дней под ваш огород</div>
                <div className="focus-card-body">
                  С учётом ваших культур, дневника и текущих условий. Его можно купить отдельно, без Базовой или Про подписки.
                </div>
                {weeklyPlanOffer && (
                  <div className="planner-upsell-row">
                    <span className="planner-upsell-badge">разово</span>
                    <span className="planner-upsell-price">{weeklyPlanOffer.priceLabel}</span>
                  </div>
                )}
                <button
                  className="focus-card-action"
                  onClick={() => {
                    void trackAnalyticsEvent({ vkUserId, eventType: 'weekly_plan_paywall_opened', source: 'main' })
                    setTab('profile')
                  }}
                >
                  Купить доступ
                </button>
              </div>
            ))}
            {lastNotif ? (
              <div className="advice-card advice-greeting" onClick={() => openChat('main')}>
                <div className="card-label">🤖 Агроном · Совет дня</div>
                <div className="card-title">{lastNotif.title}</div>
                <div className="card-body">{lastNotif.body}</div>
              </div>
            ) : messages.length > 0 ? (
              <div className="advice-card advice-greeting" onClick={() => openChat('main')}>
                <div className="card-label">🤖 Агроном</div>
                <div className="card-body" style={{ whiteSpace: 'pre-line' }}>{messages[0].text}</div>
              </div>
            ) : (
              <div className="advice-card advice-placeholder">
                <div className="card-label">{hasPlantedCrops ? '🌅 Первый совет' : '🤖 Агроном'}</div>
                <div className="card-title">{hasPlantedCrops ? 'Агроном готовится...' : 'Сначала добавьте культуры'}</div>
                <div className="card-body">
                  {hasPlantedCrops ? (
                    <>
                      Первый персональный совет придёт в {gardenData.notifMorning || '06:00'} 🌅<br />
                      Агроном изучает ваш огород и погоду в регионе.
                    </>
                  ) : (
                    <>
                      Как только в `Растениях` появятся ваши первые культуры, приложение начнёт собирать план на день и подсказывать уход уже по делу.
                    </>
                  )}
                </div>
              </div>
            )}
            {lastNotif?.type === 'subscription' && (
              <div className="sub-alert-card">
                <div className="sub-alert-title">{lastNotif.title}</div>
                <div className="sub-alert-body">{lastNotif.body}</div>
              </div>
            )}
            {!lastNotif?.type && subscriptionNotice && (
              <div className={`sub-alert-card ${subscriptionNotice.tone === 'expired' ? 'expired' : ''}`}>
                <div className="sub-alert-title">{subscriptionNotice.title}</div>
                <div className="sub-alert-body">{subscriptionNotice.body}</div>
                <button className="sub-alert-action" onClick={() => setTab('profile')}>
                  Продлить сейчас
                </button>
              </div>
            )}
            <button className="btn-chat" onClick={() => openChat('main')}>🤖 Спросить агронома</button>
          </div>
        )}
        {tab === 'plants' && (
          <>
            {renderHelpHint('plants-overview')}
            <AppPlantsScreen
              data={gardenData}
              plan={plan}
              onUpdateEntry={updateEntry}
              onAddEntry={addEntry}
              onDeleteEntry={deleteEntry}
              vkUserId={vkUserId}
              onAskAi={requestPreparedCropAdvice}
              onUpdateData={updateData}
              completedTodayTaskKeys={Array.from(completedTodayTaskKeys)}
              completingTodayTaskKey={completingTaskKey}
              onCompleteTodayTask={entry => void handleCompleteTodayTask(entry)}
              onDiaryEntryAdded={upsertRecentDiaryEntry}
            />
          </>
        )}
        {tab === 'diary' && (
          <>
            {renderHelpHint('diary-overview')}
            <AppDiaryScreen
              vkUserId={vkUserId}
              cropEntries={gardenData.cropEntries}
              onEntryAdded={upsertRecentDiaryEntry}
              onEntryDeleted={removeRecentDiaryEntry}
              offlineEntries={offlineBundle?.diaryEntries ?? []}
              offlineMode={!online && Boolean(offlineBundle)}
            />
          </>
        )}
        {tab === 'moon' && (
          <>
            {renderHelpHint('moon-overview')}
            <AppMoonScreen
              plan={plan}
              city={gardenData.city}
              rainObservations={gardenData.rainObservations ?? []}
              weeklyPlannerAccess={weeklyPlannerAccess}
              weeklyPlanAccessUntil={gardenData.weeklyPlanAccessUntil ?? null}
              weeklyPlanDays={weeklyPlan.days}
              weeklyPlanLoading={weeklyPlan.loading}
              weeklyPlanError={weeklyPlan.error}
              onUpdateRainObservation={updateRainObservation}
              onOpenUpgrade={() => setTab('profile')}
            />
          </>
        )}
        {tab === 'profile' && (
          <>
            {renderHelpHint('profile-overview')}
            <AppProfileScreen
              data={gardenData}
              plan={plan}
              onChangePlan={setPlan}
              onUpdateData={updateData}
              vkUserId={vkUserId}
              vkAuth={vkAuth}
              telegramAuth={telegramAuth}
              emailAuth={emailAuth}
              vkLoginAvailable={hasVkAppId()}
              onVkLogin={handleVkLogin}
              onVkLogout={handleVkLogout}
              offlineBundleSavedAt={offlineBundle?.savedAt ?? null}
              offlinePreparing={offlinePreparing}
              offlineMode={!online && (usingOfflineBundle || Boolean(offlineBundle))}
              onPrepareOffline={() => void prepareOfflineBundle()}
              ownerAnalyticsUrl={ownerAnalyticsUrl}
              onOpenOwnerAnalytics={openOwnerAnalytics}
              helpHintsEnabled={helpHintsEnabled}
              onToggleHelpHints={() => updateData({ helpHintsEnabled: !helpHintsEnabled })}
              onReplayIntro={replayIntro}
            />
          </>
        )}
      </div>
      <div className="navbar">
        {TABS.map(n => (
          <button key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
            <span className="nav-icon">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
          </button>
        ))}
      </div>
      {renderIntroOverlay()}
    </div>
  )
}
