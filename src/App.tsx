import { useEffect, useRef, useState } from 'react'
import './App.css'
import { getEmailAuthState, loadDiary, loadLastNotification, loadSubscriptionNotif, loadUserData, saveUserData, sendEmailMagicLink, signOutEmailAuth, trackAnalyticsEvent, type EmailAuthState } from './supabase'
import { CROPS, empty, getEffectivePlan, getSubscriptionNotice, parseDiaryText } from './utils/constants'
import { consumeVkAuthCallback, hasVkAppId, loadVkAuth, logoutVk, openVkLogin, saveVkAuth, type VkAuthState } from './utils/vk'
import {
  DiaryScreen as AppDiaryScreen,
  MoonScreen as AppMoonScreen,
  Onboarding as AppOnboarding,
  PlantsScreen as AppPlantsScreen,
  ProfileScreen as AppProfileScreen,
} from './components/screens'
import { LunarBadge as AppLunarBadge } from './components/ui'
import type { CropEntry, OnboardingData, Plan, Screen, Tab } from './utils/types'

interface NotificationPreview {
  title: string
  body: string
  type?: string
  created_at?: string
}

interface BridgeUserInfo {
  id?: number
}

interface VkBridgeLike {
  send(method: 'VKWebAppGetUserInfo'): Promise<BridgeUserInfo>
}

const PENDING_REFERRAL_STORAGE_KEY = 'ogorodbot_pending_referral'

function buildAgronomistContext(data: OnboardingData, plan: Plan) {
  const crops = data.cropEntries.map(entry => {
    const crop = CROPS.find(item => item.id === entry.id)
    const varieties = entry.varieties
      .filter(variety => variety.name.trim())
      .map(variety => {
        const note = variety.note?.trim() ? ` (${variety.note?.trim()})` : ''
        return `${variety.name.trim()}${note}`
      })
      .join(', ')
    const status = entry.status === 'planted' ? 'посажена' : 'в планах'
    return `${crop?.name ?? entry.id}: ${status}${varieties ? `; сорта ${varieties}` : ''}`
  })

  const objects = data.gardenObjects.map(obj => obj.name).filter(Boolean)
  const fertilizers = data.fertilizers
    .map(item => [item.name, item.brand, item.composition, item.note].filter(Boolean).join(' · '))
    .filter(Boolean)

  return [
    `Контекст огорода пользователя.`,
    `Тариф: ${plan}.`,
    data.city ? `Город: ${data.city}.` : '',
    data.terrain ? `Климат/местность: ${data.terrain}.` : '',
    objects.length ? `Объекты: ${objects.join(', ')}.` : '',
    crops.length ? `Культуры: ${crops.join('; ')}.` : '',
    fertilizers.length ? `Удобрения в наличии: ${fertilizers.join('; ')}.` : '',
    `Отвечай с опорой на этот огород, а не общими советами.`,
  ].filter(Boolean).join(' ')
}

function detectRelevantCropIds(question: string, data: OnboardingData) {
  const normalized = question.toLowerCase()
  const activeCropIds = new Set(data.cropEntries.map(entry => entry.id))

  return CROPS
    .filter(crop => activeCropIds.has(crop.id))
    .filter(crop => normalized.includes(crop.name.toLowerCase()) || normalized.includes(crop.id.toLowerCase()))
    .map(crop => crop.id)
}

async function buildDiaryContext(vkUserId: number, question: string, data: OnboardingData) {
  const relevantCropIds = detectRelevantCropIds(question, data)
  const relatedEntries = relevantCropIds.length > 0
    ? (await Promise.all(relevantCropIds.map(cropId => loadDiary(vkUserId, cropId)))).flat()
    : await loadDiary(vkUserId)

  const uniqueEntries = Array.from(
    new Map(relatedEntries.map(entry => [entry.id, entry])).values()
  )
    .slice(0, 6)

  if (uniqueEntries.length === 0) return ''

  const diaryLines = uniqueEntries.map(entry => {
    const crop = entry.crop_id ? CROPS.find(item => item.id === entry.crop_id) : null
    const parsed = parseDiaryText(entry.text)
    const date = new Date(entry.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    const cropLabel = crop ? crop.name : 'Огород'
    const varietyLabel = parsed.varietyName ? `, сорт ${parsed.varietyName}` : ''
    return `${date}: ${cropLabel}${varietyLabel} — ${parsed.text}`
  })

  return `Недавние записи из дневника пользователя: ${diaryLines.join('; ')}. Учитывай эти наблюдения как факты по огороду.`
}

function buildReferralCode(vkUserId: number) {
  return `OG-${vkUserId}`
}

function parseReferralOwnerId(code: string) {
  const match = code.trim().match(/^OG-(\d+)$/i)
  return match ? Number(match[1]) : null
}

function getNotificationKey(notification: NotificationPreview | null) {
  if (!notification) return ''
  return [notification.type ?? '', notification.created_at ?? '', notification.title, notification.body].join('::')
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

function grantBaseBonusDays(subscription: OnboardingData['subscription'], days: number) {
  const now = new Date()
  const start = subscription && new Date(subscription.endsAt).getTime() > now.getTime()
    ? new Date(subscription.endsAt)
    : now
  const nextEnd = new Date(start)
  nextEnd.setDate(nextEnd.getDate() + days)

  return {
    level: 'base' as const,
    period: 'monthly' as const,
    status: 'active' as const,
    startsAt: now.toISOString(),
    endsAt: nextEnd.toISOString(),
    monthlyPrice: 150,
    amount: subscription?.amount ?? 0,
    baseAmount: subscription?.baseAmount ?? 0,
    discountPercent: subscription?.discountPercent ?? 0,
    source: 'manual' as const,
  }
}

function hashIdentityToUserId(identity: string) {
  let hash = 0
  for (let i = 0; i < identity.length; i += 1) {
    hash = (hash * 31 + identity.charCodeAt(i)) | 0
  }
  const normalized = Math.abs(hash) % 2147483000
  return Math.max(1000, normalized)
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

  const [vkAuth, setVkAuth] = useState<VkAuthState | null>(() => loadVkAuth())
  const [emailAuth, setEmailAuth] = useState<EmailAuthState | null>(null)
  const [vkInitReady, setVkInitReady] = useState(false)
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [tab, setTab] = useState<Tab>('main')
  const [chatReturnTab, setChatReturnTab] = useState<Tab>('main')
  const [plan, setPlan] = useState<Plan>('free')
  const [gardenData, setGardenData] = useState<OnboardingData>(empty)
  const [vkUserId, setVkUserId] = useState<number>(() => loadVkAuth()?.userId ?? 1)
  const [vkAuthError, setVkAuthError] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [emailAuthLoading, setEmailAuthLoading] = useState(false)
  const [emailAuthMessage, setEmailAuthMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function initVkIdentity() {
      const sessionAuth = await getEmailAuthState().catch(() => null)
      if (sessionAuth && !cancelled) {
        setEmailAuth(sessionAuth)
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

      if (vkAuth) {
        if (!cancelled) setVkInitReady(true)
        return
      }

      try {
        const bridgeWindow = window as Window & { vkBridge?: VkBridgeLike; VKBridge?: VkBridgeLike }
        const vkBridge = bridgeWindow.vkBridge ?? bridgeWindow.VKBridge
        if (vkBridge) {
          vkBridge.send('VKWebAppGetUserInfo').then(u => {
            if (!cancelled && u?.id) setVkUserId(u.id)
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
  }, [vkAuth])

  const [messages, setMessages] = useState<{ role: string; text: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [dbLoading, setDbLoading] = useState(true)
  const [lastNotif, setLastNotif] = useState<NotificationPreview | null>(null)
  const [chatScrolled, setChatScrolled] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatMessagesRef = useRef<HTMLDivElement | null>(null)
  const notificationInitRef = useRef(false)
  const lastNotificationKeyRef = useRef('')

  useEffect(() => {
    if (!vkInitReady) return
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

        const inviterId = parseReferralOwnerId(pendingReferral)
        if (!inviterId || inviterId === vkUserId) {
          clearPendingReferral()
          if (onboarding.referralCode !== onboardingInput.referralCode) {
            await saveUserData(vkUserId, onboarding, storedPlan)
          }
          return { onboarding, plan: getEffectivePlan(storedPlan, onboarding.subscription) }
        }

        const inviterRow = await loadUserData(inviterId)
        if (!inviterRow) {
          clearPendingReferral()
          if (onboarding.referralCode !== onboardingInput.referralCode) {
            await saveUserData(vkUserId, onboarding, storedPlan)
          }
          return { onboarding, plan: getEffectivePlan(storedPlan, onboarding.subscription) }
        }

        const inviterOnboarding = { ...empty, ...(inviterRow.onboarding as Partial<OnboardingData>) }
        const nextAccepted = (inviterOnboarding.referralInvitesAccepted ?? 0) + 1
        const nextRewardsGranted = Math.floor(nextAccepted / 2)
        const prevRewardsGranted = inviterOnboarding.referralRewardsGranted ?? 0

        const nextInviterOnboarding: OnboardingData = {
          ...inviterOnboarding,
          referralCode: inviterOnboarding.referralCode || buildReferralCode(inviterId),
          referralInvitesAccepted: nextAccepted,
          referralRewardsGranted: nextRewardsGranted,
          subscription: nextRewardsGranted > prevRewardsGranted
            ? grantBaseBonusDays(inviterOnboarding.subscription, 7)
            : inviterOnboarding.subscription ?? null,
        }

        const nextCurrentOnboarding: OnboardingData = {
          ...onboarding,
          referralAppliedCode: pendingReferral,
        }

        await Promise.all([
          saveUserData(inviterId, nextInviterOnboarding, getEffectivePlan(inviterRow.plan as Plan, nextInviterOnboarding.subscription)),
          saveUserData(vkUserId, nextCurrentOnboarding, storedPlan),
        ])
        void trackAnalyticsEvent({
          vkUserId,
          eventType: 'referral_applied',
          source: 'referral',
          metadata: { code: pendingReferral, inviterId },
        })
        clearPendingReferral()

        return { onboarding: nextCurrentOnboarding, plan: getEffectivePlan(storedPlan, nextCurrentOnboarding.subscription) }
      }

      if (row) {
        const onboarding = { ...empty, ...(row.onboarding as Partial<OnboardingData>) }
        if (!onboarding.notificationEmail && emailAuth?.email) {
          onboarding.notificationEmail = emailAuth.email
        }
        const finalized = await finalizeReferral(onboarding, row.plan as Plan)
        setGardenData(finalized.onboarding)
        setPlan(finalized.plan)
        setScreen(isBlankOnboarding(finalized.onboarding) ? 'onboarding' : 'main')
        setDbLoading(false)
        return
      }

      if (vkUserId !== 1) {
        const cleanOnboarding = {
          ...empty,
          referralCode: buildReferralCode(vkUserId),
          notificationEmail: emailAuth?.email ?? '',
        }
        const finalized = await finalizeReferral(cleanOnboarding, 'free')
        setGardenData(finalized.onboarding)
        setPlan(finalized.plan)
        if (finalized.onboarding.referralAppliedCode) {
          await saveUserData(vkUserId, finalized.onboarding, 'free')
        }
        setScreen('onboarding')
      }
      setDbLoading(false)
    })
  }, [vkInitReady, vkUserId, emailAuth])

  useEffect(() => {
    if (screen !== 'main' || vkUserId === 1) return

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
    const intervalId = window.setInterval(() => {
      void syncNotifications(false)
    }, 60000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [screen, vkUserId])

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
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!browserTimeZone) return
    if (gardenData.timeZone === browserTimeZone) return
    setGardenData(prev => ({ ...prev, timeZone: prev.timeZone || browserTimeZone }))
  }, [gardenData.timeZone])

  useEffect(() => {
    const contactVkUserId = vkAuth?.userId ?? 0
    if (!contactVkUserId) return
    if (gardenData.vkContactUserId === contactVkUserId) return
    setGardenData(prev => ({ ...prev, vkContactUserId: contactVkUserId }))
  }, [gardenData.vkContactUserId, vkAuth?.userId])

  useEffect(() => {
    if (screen !== 'chat') return
    const container = chatMessagesRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, screen])

  if (dbLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 40 }}>🌱</div>
        <div style={{ color: '#666', fontSize: 14 }}>Загрузка огорода...</div>
      </div>
    )
  }

  if (!vkAuth && !emailAuth && vkUserId === 1) {
    return (
      <div className="site-auth-screen">
        <div className="site-auth-header">
          <div className="site-auth-brand">🌱 ОгородБот</div>
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
          <h1 className="site-auth-title">ОгородБот</h1>
          <p className="site-auth-subtitle">План, дневник и советы по вашему огороду</p>

          <div className="site-auth-choice">
            Самые надёжные входы для новых устройств сейчас: email и VK. Email подойдёт всем, а VK оставлен как быстрый вариант для тех, у кого VK ID уже настроен.
          </div>

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

          <button className="site-auth-vk-btn" disabled={!hasVkAppId()} onClick={handleVkLogin}>
            <span className="site-auth-vk-icon">VK</span>
            Войти через ВКонтакте
          </button>

          <p className="site-auth-note">
            Мы используем выбранный способ входа, чтобы сохранять огород, дневник и подписку на любом устройстве.
          </p>

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

  function handleVkLogout() {
    logoutVk()
    if (emailAuth) {
      void signOutEmailAuth()
    }
    setEmailAuth(null)
    setVkAuth(null)
    setVkUserId(1)
    setVkInitReady(true)
  }

  function handleOnboardingDone(d: OnboardingData) {
    setGardenData(d)
    saveUserData(vkUserId, d, plan)
    void trackAnalyticsEvent({
      vkUserId,
      eventType: 'onboarding_complete',
      source: 'onboarding',
      metadata: {
        city: d.city,
        crops: d.cropEntries.length,
        objects: d.gardenObjects.length,
      },
    })
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

  async function askAgronomist(question: string) {
    if (loading) return
    setMessages(m => [...m, { role: 'user', text: question }])
    setLoading(true)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 25000)
    try {
      const diaryContext = await buildDiaryContext(vkUserId, question, gardenData).catch(() => '')
      const contextualQuestion = `${buildAgronomistContext(gardenData, plan)}${diaryContext ? ` ${diaryContext}` : ''}\n\nВопрос пользователя: ${question}`
      const res = await fetch('https://garden-agent.gorant1991.workers.dev/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          vk_user_id: vkUserId,
          question: contextualQuestion,
          garden_context: gardenData,
          plan,
        }),
      })
      if (!res.ok) {
        throw new Error(`Сервис агронома временно недоступен (${res.status}).`)
      }
      const data = await res.json().catch(() => null)
      const answer = typeof data?.answer === 'string' ? data.answer.trim() : ''
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

  function openChat(targetTab: Tab = tab) {
    setChatReturnTab(targetTab)
    setScreen('chat')
  }

  function requestCropAdvice(question: string, sourceTab: Tab = 'plants') {
    setChatReturnTab(sourceTab)
    setScreen('chat')
    void askAgronomist(question)
  }

  if (screen === 'onboarding') return <AppOnboarding onDone={handleOnboardingDone} />

  if (screen === 'chat') {
    return (
      <div className="screen chat">
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
          {messages.map((m, i) => <div key={i} className={`msg msg-${m.role}`}>{m.text}</div>)}
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

  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: 'main', icon: '🏠', label: 'Главная' },
    { id: 'plants', icon: '🌱', label: 'Растения' },
    { id: 'diary', icon: '📖', label: 'Дневник' },
    { id: 'moon', icon: '🌙', label: 'Луна' },
    { id: 'profile', icon: '👤', label: 'Профиль' },
  ]
  const subscriptionNotice = getSubscriptionNotice(gardenData.subscription)

  return (
    <div className="screen main">
      <div className="main-header">
        <div>
          <div className="greeting">{(() => {
            const h = new Date().getHours()
            return h >= 5 && h < 12 ? 'Доброе утро' : h >= 12 && h < 17 ? 'Добрый день' : h >= 17 && h < 22 ? 'Добрый вечер' : 'Доброй ночи'
          })()}</div>
          <div className="date">{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <AppLunarBadge />
      </div>
      <div className="tab-scroll">
        {tab === 'main' && (
          <div className="tab-content">
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
                <div className="card-label">🌅 Первый совет</div>
                <div className="card-title">Агроном готовится...</div>
                <div className="card-body">
                  Первый персональный совет придёт в {gardenData.notifMorning || '06:00'} 🌅<br />
                  Агроном изучает ваш огород и погоду в регионе.
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
        {tab === 'plants' && <AppPlantsScreen data={gardenData} plan={plan} onUpdateEntry={updateEntry} onAddEntry={addEntry} onDeleteEntry={deleteEntry} vkUserId={vkUserId} onAskAi={requestCropAdvice} onUpdateData={updateData} />}
        {tab === 'diary' && <AppDiaryScreen vkUserId={vkUserId} cropEntries={gardenData.cropEntries} />}
        {tab === 'moon' && <AppMoonScreen plan={plan} city={gardenData.city} vkUserId={vkUserId} cropEntries={gardenData.cropEntries} />}
        {tab === 'profile' && (
          <AppProfileScreen
            data={gardenData}
            plan={plan}
            onChangePlan={setPlan}
            onUpdateData={updateData}
            vkUserId={vkUserId}
            vkAuth={vkAuth}
            emailAuth={emailAuth}
            vkLoginAvailable={hasVkAppId()}
            onVkLogin={handleVkLogin}
            onVkLogout={handleVkLogout}
          />
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
    </div>
  )
}
