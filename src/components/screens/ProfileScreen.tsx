import { useEffect, useState } from 'react'
import type { DiaryEntry, OnboardingData, Plan, Season, SubscriptionInfo } from '../../utils/types'
import { FAQ_ITEMS, NOTIF_CHANNELS, GROW_OPTIONS, OBJECT_LIMITS, buildObjectName, buildSubscriptionOffers, formatDateLabel, formatPrice, getObjectNamePlaceholder, getSubscriptionNotice, getSubscriptionStatusLabel, hasWeeklyPlannerAccess, makeObject } from '../../utils/constants'
import { shareGardenToVk } from '../../utils/shareCards'
import { getTelegramDisplayName, type TelegramAuthState } from '../../utils/telegram'
import type { VkAuthState } from '../../utils/vk'
import type { AdminStats, EmailAuthState, NotificationPreview } from '../../supabase'
import { SeasonsScreen } from './SeasonsScreen'
import { exportCSV, exportHTML } from '../../utils/export'
import { createYooKassaPayment, getYooKassaPaymentStatus, loadAdminStats, loadDiary, loadNotifications, loadSeasons, sendTestTelegramNotification, trackAnalyticsEvent } from '../../supabase'
import { DeleteAccountButton } from '../modals'

type NotificationRow = NotificationPreview

const OWNER_VK_ID = 16761047
const OWNER_EMAILS = ['gorant1991@gmail.com']
const TELEGRAM_TEST_OK_PREFIX = 'ogorodbot_tg_test_ok:'
const GENERIC_TOOLS = new Set(['🪣 Лейка', '🧯 Шланг', 'Лейка', 'Шланг'])
const TOOL_OPTIONS = [
  '🌡️ Термометр',
  '🌱 Термометр почвы',
  '💧 Влагомер',
  '🧪 pH-метр',
  '🧂 EC/TDS-метр',
  '🚿 Опрыскиватель',
  '💦 Капельный полив',
  '🪵 Мульча',
  '🧵 Агроволокно',
  '🏕️ Дуги и плёнка',
]

function buildBonusSubscription(subscription: SubscriptionInfo | null | undefined, days: number): SubscriptionInfo {
  const now = new Date()
  const activeSubscription = subscription && new Date(subscription.endsAt).getTime() > now.getTime()
    ? subscription
    : null
  const level = activeSubscription?.level === 'pro' ? 'pro' : 'base'
  const monthlyPrice = level === 'pro' ? 300 : 150
  const baseDate = activeSubscription ? new Date(activeSubscription.endsAt) : now
  baseDate.setDate(baseDate.getDate() + days)

  return {
    level,
    period: activeSubscription?.period ?? 'monthly',
    status: 'active',
    startsAt: activeSubscription?.startsAt || now.toISOString(),
    endsAt: baseDate.toISOString(),
    monthlyPrice: activeSubscription?.monthlyPrice || monthlyPrice,
    amount: activeSubscription?.amount ?? 0,
    baseAmount: activeSubscription?.baseAmount ?? 0,
    discountPercent: activeSubscription?.discountPercent ?? 0,
    source: activeSubscription?.source ?? 'manual',
  }
}

export function ProfileScreen({ data, plan, onChangePlan, onUpdateData, vkUserId, vkAuth, telegramAuth, emailAuth, vkLoginAvailable, onVkLogin, onVkLogout, offlineBundleSavedAt, offlinePreparing, offlineMode, onPrepareOffline, ownerAnalyticsUrl, onOpenOwnerAnalytics, helpHintsEnabled, onToggleHelpHints, onReplayIntro }: {
  data: OnboardingData
  plan: Plan
  onChangePlan: (p: Plan) => void
  onUpdateData: (patch: Partial<OnboardingData>) => void
  vkUserId: number
  vkAuth: VkAuthState | null
  telegramAuth: TelegramAuthState | null
  emailAuth: EmailAuthState | null
  vkLoginAvailable: boolean
  onVkLogin: () => void
  onVkLogout: () => void
  offlineBundleSavedAt: string | null
  offlinePreparing: boolean
  offlineMode: boolean
  onPrepareOffline: () => void
  ownerAnalyticsUrl: string
  onOpenOwnerAnalytics: () => void
  helpHintsEnabled: boolean
  onToggleHelpHints: () => void
  onReplayIntro: () => void
}) {
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutOfferId, setCheckoutOfferId] = useState<string | null>(null)
  const [checkoutPaymentId, setCheckoutPaymentId] = useState<string | null>(null)
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutStatus, setCheckoutStatus] = useState<'idle' | 'ready' | 'processing' | 'succeeded' | 'canceled' | 'error'>('idle')
  const [checkoutError, setCheckoutError] = useState('')
  const [editCity, setEditCity] = useState(false)
  const [cityVal, setCityVal] = useState(data.city)
  const [editDisplayName, setEditDisplayName] = useState(false)
  const [displayNameVal, setDisplayNameVal] = useState(data.displayName)
  const [addressStyleDraft, setAddressStyleDraft] = useState(data.addressStyle)
  const [editExp, setEditExp] = useState(false)
  const [showAddObject, setShowAddObject] = useState(false)
  const [editObjectId, setEditObjectId] = useState<string | null>(null)
  const [showFaq, setShowFaq] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [vkSharing, setVkSharing] = useState<'vk_post' | null>(null)
  const [referralInput, setReferralInput] = useState('')
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null)
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [notifMorningDraft, setNotifMorningDraft] = useState(data.notifMorning)
  const [notifEveningDraft, setNotifEveningDraft] = useState(data.notifEvening)
  const [notificationEmailDraft, setNotificationEmailDraft] = useState(data.notificationEmail)
  const [notifChannelsDraft, setNotifChannelsDraft] = useState(data.notifChannels)
  const [tgTestSending, setTgTestSending] = useState(false)
  const [tgTestOk, setTgTestOk] = useState(() => {
    try {
      return localStorage.getItem(`${TELEGRAM_TEST_OK_PREFIX}${vkUserId}`) === '1'
    } catch {
      return false
    }
  })
  const telegramLinked = Boolean(data.telegramChatId || telegramAuth?.id)
  const expLabel = { beginner: '🌱 Новичок', amateur: '🌿 Любитель', experienced: '🧑‍🌾 Опытный', expert: '🏆 Эксперт' }[data.experience] ?? '—'
  const offers = buildSubscriptionOffers()
  const weeklyPlanOffer = offers.find(item => item.kind === 'weekly_plan') ?? null
  const subscriptionOffers = offers.filter(item => item.kind === 'subscription')
  const currentSubscription = data.subscription ?? null
  const legacyPaidAccess = !currentSubscription && plan !== 'free'
  const subscriptionNotice = getSubscriptionNotice(currentSubscription)
  const weeklyPlannerAccess = hasWeeklyPlannerAccess(data, plan)
  const isOwner = vkUserId === OWNER_VK_ID || Boolean(emailAuth?.email && OWNER_EMAILS.includes(emailAuth.email.toLowerCase()))
  const currentTitle = plan === 'free'
    ? 'Бесплатный тариф'
    : currentSubscription
      ? getSubscriptionStatusLabel(currentSubscription)
      : `${plan === 'base' ? 'Базовая' : 'Про'} · доступ активен`
  const currentMeta = currentSubscription
    ? `До ${formatDateLabel(currentSubscription.endsAt)} · оплачено ${formatPrice(currentSubscription.amount)}${currentSubscription.discountPercent > 0 ? ` · скидка ${currentSubscription.discountPercent}%` : ''}`
    : plan === 'free'
      ? '10 культур, 3 объекта, базовые советы агронома'
      : 'Платный доступ уже активен. Если детали оплаты ниже не показаны, это старый или неполный профиль подписки, а не потеря тарифа.'
  const weeklyPlannerMeta = plan === 'pro'
    ? 'План на 7 дней уже входит в Про и открывается без отдельной оплаты.'
    : weeklyPlannerAccess && data.weeklyPlanAccessUntil
      ? `Разовый доступ активен до ${formatDateLabel(data.weeklyPlanAccessUntil)}. Его можно продлить отдельно от подписки.`
      : 'Можно купить отдельно за 99 ₽ и не оформлять Базовую или Про подписку.'
  const checkoutOffer = offers.find(item => item.id === checkoutOfferId) ?? null

  function normalizeNotificationEmail(value: string) {
    return value.trim().toLowerCase()
  }

  function normalizeDisplayName(value: string) {
    return value.replace(/\s+/g, ' ').trim().slice(0, 30)
  }

  function isValidNotificationEmail(value: string) {
    const normalized = normalizeNotificationEmail(value)
    if (!normalized) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  }

  function handleChannelToggle(channelId: string, active: boolean) {
    setNotifChannelsDraft(prev => active ? prev.filter(x => x !== channelId) : [...prev, channelId])
  }

  function handleToolToggle(toolName: string) {
    const nextTools = data.tools.includes(toolName)
      ? data.tools.filter(item => item !== toolName)
      : [...data.tools, toolName]
    onUpdateData({ tools: nextTools })
  }

  useEffect(() => {
    const sanitizedTools = data.tools.filter(tool => !GENERIC_TOOLS.has(tool))
    if (sanitizedTools.length !== data.tools.length) {
      onUpdateData({ tools: sanitizedTools })
    }
  }, [data.tools, onUpdateData])

  function saveNotificationSettings() {
    const normalizedEmail = normalizeNotificationEmail(notificationEmailDraft)
    if (!isValidNotificationEmail(normalizedEmail)) {
      window.alert('Проверьте email для уведомлений.')
      return
    }

    let nextChannels = [...notifChannelsDraft]
    if (normalizedEmail && !nextChannels.includes('email')) {
      nextChannels = [...nextChannels, 'email']
    }
    if (!normalizedEmail) {
      nextChannels = nextChannels.filter(channel => channel !== 'email')
    }
    if (nextChannels.includes('tg') && !telegramLinked) {
      window.alert('Сначала войдите через Telegram, чтобы бот мог присылать вам уведомления.')
      return
    }

    onUpdateData({
      notifMorning: notifMorningDraft,
      notifEvening: notifEveningDraft,
      notificationEmail: normalizedEmail,
      notifChannels: nextChannels,
    })

    setNotifChannelsDraft(nextChannels)
    setNotificationEmailDraft(normalizedEmail)
    window.alert('Настройки уведомлений сохранены.')
  }

  async function openCheckout(offerId: string) {
    const offer = offers.find(item => item.id === offerId)
    if (!offer || checkoutLoading) return
    setCheckoutLoading(true)
    setCheckoutError('')
    setCheckoutOfferId(offerId)
    setCheckoutPaymentId(null)
    setCheckoutToken(null)
    setCheckoutStatus('idle')
    setCheckoutOpen(true)

    try {
      void trackAnalyticsEvent({
        vkUserId,
        eventType: 'checkout_opened',
        source: offer.kind,
        metadata: { offerId, kind: offer.kind },
      })
      const result = await createYooKassaPayment({
        offerId,
        vkUserId,
        returnUrl: window.location.href,
      })
      setCheckoutPaymentId(result.paymentId)
      setCheckoutToken(result.confirmationToken)
      setCheckoutStatus('ready')
    } catch (error) {
      setCheckoutStatus('error')
      setCheckoutError(error instanceof Error ? error.message : 'Не удалось открыть оплату')
    } finally {
      setCheckoutLoading(false)
    }
  }

  function closeCheckout() {
    setCheckoutOpen(false)
    setCheckoutOfferId(null)
    setCheckoutPaymentId(null)
    setCheckoutToken(null)
    setCheckoutStatus('idle')
    setCheckoutError('')
  }

  const editingObject = data.gardenObjects.find(object => object.uid === editObjectId) ?? null

  function updateObject(uid: string, patch: Partial<OnboardingData['gardenObjects'][number]>) {
    onUpdateData({
      gardenObjects: data.gardenObjects.map(object => object.uid === uid ? { ...object, ...patch } : object),
    })
  }

  function removeObject(uid: string) {
    onUpdateData({
      gardenObjects: data.gardenObjects.filter(object => object.uid !== uid),
      cropEntries: data.cropEntries.map(entry => {
        if (entry.location !== uid) return entry
        return { ...entry, location: data.gardenObjects.find(object => object.uid !== uid)?.uid ?? '' }
      }),
    })
    setEditObjectId(null)
  }

  function downgradeToFree() {
    const cropLimit = 10
    const objLimit = 1
    const overCrops = data.cropEntries.length > cropLimit
    const overObjs = data.gardenObjects.length > objLimit
    const msg = overCrops || overObjs
      ? `Внимание: у вас ${data.cropEntries.length} культур и ${data.gardenObjects.length} объектов. На бесплатном тарифе лимит ${cropLimit} культур и ${objLimit} объект. Данные сохранятся, но добавление новых будет заблокировано.`
      : 'Перейти на бесплатный тариф?'

    if (!window.confirm(msg)) return
    onUpdateData({ subscription: null })
    onChangePlan('free')
  }

  async function handleVkShare() {
    setVkSharing('vk_post')
    try {
      await shareGardenToVk(data, plan, 'garden')
      void trackAnalyticsEvent({
        vkUserId,
        eventType: 'vk_share',
        source: 'garden',
        metadata: { theme: 'garden', plan },
      })
      const lastPromoShareAt = data.lastPromoShareAt ? new Date(data.lastPromoShareAt) : null
      const oneDayMs = 24 * 60 * 60 * 1000
      const canGrantShareBonus = !lastPromoShareAt || (Date.now() - lastPromoShareAt.getTime()) >= oneDayMs
      if (canGrantShareBonus) {
        const nextSubscription = buildBonusSubscription(data.subscription, 1)
        const bonusLabel = nextSubscription.level === 'pro' ? 'текущего тарифа' : 'Базовой подписки'
        onUpdateData({
          promoPostShares: (data.promoPostShares ?? 0) + 1,
          lastPromoShareAt: new Date().toISOString(),
          subscription: nextSubscription,
        })
        onChangePlan(nextSubscription.level)
        window.alert(`За пост в VK начислен бонус: +1 день ${bonusLabel}.`)
      } else {
        window.alert('Бонус за VK-пост уже начислялся сегодня. Следующий бонус можно получить завтра.')
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось подготовить карточку для VK')
    } finally {
      setVkSharing(null)
    }
  }

  function applyReferralCode() {
    const code = referralInput.trim().toUpperCase()
    if (!code) return
    if (code === (data.referralCode ?? '')) {
      window.alert('Нельзя применить свой собственный код.')
      return
    }
    if (data.referralAppliedCode) {
      window.alert('Реферальный код уже применён для этого аккаунта.')
      return
    }
    localStorage.setItem('ogorodbot_pending_referral', code)
    setReferralInput('')
    window.location.reload()
  }

  useEffect(() => {
    setNotifMorningDraft(data.notifMorning)
    setNotifEveningDraft(data.notifEvening)
    setNotificationEmailDraft(data.notificationEmail)
    setNotifChannelsDraft(data.notifChannels)
    setDisplayNameVal(data.displayName)
    setAddressStyleDraft(data.addressStyle)
  }, [data.notifMorning, data.notifEvening, data.notificationEmail, data.notifChannels, data.displayName, data.addressStyle])

  useEffect(() => {
    try {
      setTgTestOk(localStorage.getItem(`${TELEGRAM_TEST_OK_PREFIX}${vkUserId}`) === '1')
    } catch {
      setTgTestOk(false)
    }
  }, [vkUserId])

  async function copyReferralLink() {
    const link = `${window.location.origin}?ref=${encodeURIComponent(data.referralCode || `OG-${vkUserId}`)}`
    await navigator.clipboard.writeText(link)
    window.alert('Ссылка приглашения скопирована.')
  }

  useEffect(() => {
    if (!checkoutOpen || !checkoutToken) return

    const confirmationToken = checkoutToken
    const widgetHostId = 'yookassa-payment-widget'
    let widget: YooMoneyCheckoutWidgetInstance | null = null
    let canceled = false

    async function renderWidget() {
      const scriptId = 'yookassa-checkout-widget'
      const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null

      if (!existingScript) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.id = scriptId
          script.src = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js'
          script.async = true
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Не удалось загрузить виджет ЮKassa'))
          document.head.appendChild(script)
        })
      } else if (!window.YooMoneyCheckoutWidget) {
        await new Promise<void>((resolve, reject) => {
          existingScript.addEventListener('load', () => resolve(), { once: true })
          existingScript.addEventListener('error', () => reject(new Error('Не удалось загрузить виджет ЮKassa')), { once: true })
        })
      }

      if (canceled || !window.YooMoneyCheckoutWidget) return

      const container = document.getElementById(widgetHostId)
      if (!container) return
      container.innerHTML = ''
      widget = new window.YooMoneyCheckoutWidget({
        confirmation_token: confirmationToken,
        return_url: window.location.href,
        error_callback: () => {
          setCheckoutStatus('error')
          setCheckoutError('ЮKassa вернула ошибку. Попробуйте ещё раз.')
        },
      })
      widget.render(widgetHostId)
      setTimeout(() => {
        if (!canceled) {
          document.getElementById(widgetHostId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 200)
    }

    void renderWidget().catch((error: unknown) => {
      setCheckoutStatus('error')
      setCheckoutError(error instanceof Error ? error.message : 'Не удалось подготовить окно оплаты')
    })

    return () => {
      canceled = true
      widget?.destroy?.()
      const container = document.getElementById(widgetHostId)
      if (container) container.innerHTML = ''
    }
  }, [checkoutOpen, checkoutToken])

  useEffect(() => {
    if (!checkoutOpen || !checkoutPaymentId) return
    if (checkoutStatus === 'succeeded' || checkoutStatus === 'canceled') return

    let canceled = false

    const poll = async () => {
      try {
        const result = await getYooKassaPaymentStatus(checkoutPaymentId, vkUserId)
        if (canceled) return
        const paidOffer = offers.find(item => item.id === (result.offerId ?? checkoutOfferId ?? '')) ?? checkoutOffer
        if (result.status === 'succeeded') {
          if (result.subscription) {
            onUpdateData({
              ...(result.onboardingPatch ?? {}),
              subscription: result.subscription,
            })
            onChangePlan(result.subscription.level)
          } else if (result.onboardingPatch) {
            onUpdateData(result.onboardingPatch)
          }
          void trackAnalyticsEvent({
            vkUserId,
            eventType: 'payment_succeeded',
            source: paidOffer?.kind ?? 'yookassa',
            metadata: {
              paymentId: checkoutPaymentId,
              offerId: result.offerId ?? checkoutOfferId,
              kind: paidOffer?.kind ?? null,
              level: result.subscription?.level ?? null,
              period: result.subscription?.period ?? null,
              amount: result.subscription?.amount ?? paidOffer?.amount ?? null,
            },
          })
          setCheckoutStatus('succeeded')
          return
        }
        if (result.status === 'canceled') {
          setCheckoutStatus('canceled')
          setCheckoutError('Платёж был отменён.')
          return
        }
        setCheckoutStatus('processing')
      } catch (error) {
        if (canceled) return
        setCheckoutStatus('error')
        setCheckoutError(error instanceof Error ? error.message : 'Не удалось получить статус платежа')
      }
    }

    void poll()
    const timer = window.setInterval(() => {
      void poll()
    }, 3000)

    return () => {
      canceled = true
      window.clearInterval(timer)
    }
  }, [checkoutOffer, checkoutOfferId, checkoutOpen, checkoutPaymentId, checkoutStatus, offers, onChangePlan, onUpdateData, vkUserId])

  useEffect(() => {
    if (!isOwner) return
    let canceled = false
    setAdminLoading(true)
    setAdminError('')

    void loadAdminStats()
      .then(stats => {
        if (!canceled) setAdminStats(stats)
      })
      .catch(error => {
        if (!canceled) setAdminError(error instanceof Error ? error.message : 'Не удалось загрузить статистику')
      })
      .finally(() => {
        if (!canceled) setAdminLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [isOwner])
  return (
    <div className="tab-content">
      {checkoutOpen && (
        <div className="modal-overlay" onClick={checkoutLoading ? undefined : closeCheckout}>
          <div className="modal-sheet payment-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">Оплата через ЮKassa</span>
              <button className="modal-close" onClick={closeCheckout}>✕</button>
            </div>
            {checkoutOffer && (
              <div className="payment-offer-summary">
                <div className="payment-offer-title">{checkoutOffer.title}</div>
                <div className="payment-offer-meta">
                  {formatPrice(checkoutOffer.amount)} · {checkoutOffer.subtitle}
                </div>
              </div>
            )}
            <div className="payment-hint">
              {checkoutOffer?.kind === 'weekly_plan'
                ? 'После оплаты откроется отдельный доступ к Плану на 7 дней, даже если у вас бесплатный тариф.'
                : 'После успешной оплаты тариф включится автоматически и появится в вашем профиле.'}
            </div>
            {checkoutError && <div className="payment-error">{checkoutError}</div>}
            {checkoutStatus === 'succeeded' ? (
              <div className="payment-success">
                <div className="payment-success-title">Оплата прошла</div>
                <div className="payment-success-sub">
                  {checkoutOffer?.kind === 'weekly_plan'
                    ? 'Доступ к Плану на 7 дней уже открыт.'
                    : 'Подписка уже активирована.'}
                </div>
                <button className="btn-upgrade-full" onClick={closeCheckout}>Готово</button>
              </div>
            ) : (
              <>
                {checkoutLoading && <div className="payment-loading">Подготавливаю окно оплаты...</div>}
                <div id="yookassa-payment-widget" className="payment-widget-host" />
                {checkoutStatus === 'processing' && (
                  <div className="payment-processing">Проверяю статус платежа...</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
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
              {FAQ_ITEMS.map((item, i: number) => (
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
                  {plan === 'free' ? 'Бесплатно — до 3 объектов. Перейдите на Базовую (до 8 объектов)' : 'Базовая — до 8 объектов. Перейдите на Про для неограниченного количества'}
                </div>
              </div>
            ) : (
              <>
                <div className="ob-cards" style={{ maxHeight: 200 }}>
                  {GROW_OPTIONS.map(o => (
                    <button key={o.id} className="ob-card" onClick={() => {
                      const count = data.gardenObjects.filter(x => x.type === o.id).length
                      const name = buildObjectName(o.id, count + 1)
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

      {editingObject && (
        <div className="modal-overlay" onClick={() => setEditObjectId(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">Редактировать объект</span>
              <button className="modal-close" onClick={() => setEditObjectId(null)}>✕</button>
            </div>
            <div className="modal-section-label">Название</div>
            <div className="section-helper" style={{ padding: '0 0 8px' }}>
              Пишите по-человечески, чтобы потом было легко ориентироваться: `грядка у теплицы`, `парник за домом`, `левая теплица`.
            </div>
            <input
              className="profile-edit-input"
              value={editingObject.name}
              onChange={e => updateObject(editingObject.uid, { name: e.target.value })}
              placeholder={getObjectNamePlaceholder(editingObject.type)}
            />
            <div className="modal-section-label">Состав / субстрат</div>
            <input
              className="profile-edit-input"
              value={editingObject.substrate}
              onChange={e => updateObject(editingObject.uid, { substrate: e.target.value })}
              placeholder="Например: перегной, торф, компост"
            />
            <div className="modal-section-label">Тип почвы</div>
            <input
              className="profile-edit-input"
              value={editingObject.soilType}
              onChange={e => updateObject(editingObject.uid, { soilType: e.target.value })}
              placeholder="Например: суглинок, супесь"
            />
            <button
              className={`ob-toggle-row ${editingObject.drainageIssue ? 'active' : ''}`}
              onClick={() => updateObject(editingObject.uid, { drainageIssue: !editingObject.drainageIssue })}
              style={{ marginTop: 12 }}
            >
              <span>💧 Проблемы с дренажом</span>
              <div className={`ob-toggle ${editingObject.drainageIssue ? 'on' : ''}`} />
            </button>
            {(editingObject.type === 'greenhouse' || editingObject.type === 'hotbed') && (
              <>
                <button
                  className={`ob-toggle-row ${editingObject.ventilationReminders ? 'active' : ''}`}
                  onClick={() => updateObject(editingObject.uid, { ventilationReminders: !editingObject.ventilationReminders })}
                >
                  <span>🏠 Напоминать про парник / теплицу</span>
                  <div className={`ob-toggle ${editingObject.ventilationReminders ? 'on' : ''}`} />
                </button>
                {editingObject.ventilationReminders && (
                  <div className="ob-time-row" style={{ marginTop: 10 }}>
                    <div className="ob-time-field">
                      <label>☀️ Утром</label>
                      <input
                        type="time"
                        value={editingObject.ventilationMorning}
                        onChange={e => updateObject(editingObject.uid, { ventilationMorning: e.target.value })}
                      />
                    </div>
                    <div className="ob-time-field">
                      <label>🌙 Вечером</label>
                      <input
                        type="time"
                        value={editingObject.ventilationEvening}
                        onChange={e => updateObject(editingObject.uid, { ventilationEvening: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
            <button className="btn-primary btn-full" style={{ marginTop: 14 }} onClick={() => setEditObjectId(null)}>
              Готово
            </button>
            <button className="btn-downgrade" style={{ marginTop: 10 }} onClick={() => removeObject(editingObject.uid)}>
              Удалить объект
            </button>
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
        <div className="vk-connect-card">
          <div>
            <div className="vk-connect-title">Аккаунт</div>
            <div className="vk-connect-sub">
              {vkAuth
                ? `Подключён аккаунт VK · ID ${vkAuth.userId}${vkAuth.email ? ` · ${vkAuth.email}` : ''}`
                : telegramAuth
                  ? `Вы вошли через Telegram · ${getTelegramDisplayName(telegramAuth)}${telegramAuth.username ? ` · @${telegramAuth.username}` : ''}`
                : emailAuth
                  ? `Вы вошли по email · ${emailAuth.email}`
                : vkLoginAvailable
                  ? 'Подключите удобный вход, чтобы огород открывался с вашими данными на любом устройстве.'
                  : 'Сейчас включён только email-вход. VK и Telegram можно добавить через .env и BotFather.'}
            </div>
          </div>
          {vkAuth || telegramAuth || emailAuth ? (
            <button className="vk-connect-btn secondary" onClick={onVkLogout}>Выйти</button>
          ) : (
            <button className="vk-connect-btn" disabled={!vkLoginAvailable} onClick={onVkLogin}>Войти через VK</button>
          )}
        </div>

        {editDisplayName ? (
          <div className="profile-edit-stack">
            <div className="profile-edit-row">
              <input
                className="profile-edit-input"
                value={displayNameVal}
                onChange={e => setDisplayNameVal(e.target.value.slice(0, 30))}
                placeholder="Как к вам обращаться"
                autoFocus
                maxLength={30}
              />
              <button
                className="profile-edit-save"
                onClick={() => {
                  onUpdateData({
                    displayName: normalizeDisplayName(displayNameVal),
                    addressStyle: addressStyleDraft,
                  })
                  setEditDisplayName(false)
                }}
              >
                ✓
              </button>
              <button
                className="profile-edit-cancel"
                onClick={() => {
                  setDisplayNameVal(data.displayName)
                  setAddressStyleDraft(data.addressStyle)
                  setEditDisplayName(false)
                }}
              >
                ✕
              </button>
            </div>
            <div className="profile-edit-inline-setting">
              <span className="profile-label">🗣️ Стиль обращения</span>
              <div className="profile-address-options">
                <button
                  className={`profile-address-btn ${addressStyleDraft === 'informal' ? 'active' : ''}`}
                  onClick={() => setAddressStyleDraft('informal')}
                >
                  на ты
                </button>
                <button
                  className={`profile-address-btn ${addressStyleDraft === 'formal' ? 'active' : ''}`}
                  onClick={() => setAddressStyleDraft('formal')}
                >
                  на вы
                </button>
              </div>
            </div>
            <div className="profile-edit-hint">{displayNameVal.length}/30 · можно оставить пустым</div>
          </div>
        ) : (
          <div className="profile-row profile-row-tap" onClick={() => { setDisplayNameVal(data.displayName); setAddressStyleDraft(data.addressStyle); setEditDisplayName(true) }}>
            <span className="profile-label">🙌 Имя в приложении</span>
            <span className="profile-val">{data.displayName || 'Не задано'} · {data.addressStyle === 'formal' ? 'на вы' : 'на ты'} <span className="profile-edit-icon">✏️</span></span>
          </div>
        )}
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
            <span className="profile-val">
              {data.gardenObjects.map(o => GROW_OPTIONS.find(g => g.id === o.type)?.icon).join(' ') || '—'}
            </span>
            <button className="profile-add-btn" onClick={() => setShowAddObject(true)} aria-label="Добавить объект огорода" title="Добавить объект огорода">+</button>
          </div>
        </div>
        {data.gardenObjects.length > 0 && (
          <div className="profile-object-list">
            {data.gardenObjects.map(object => {
              const option = GROW_OPTIONS.find(item => item.id === object.type)
              return (
                <button key={object.uid} className="profile-object-item" onClick={() => setEditObjectId(object.uid)}>
                  <span className="profile-object-icon">{option?.icon ?? '🏡'}</span>
                  <span className="profile-object-main">
                    <span className="profile-object-name">{object.name}</span>
                    <span className="profile-object-meta">
                      {[object.soilType, object.substrate].filter(Boolean).join(' · ') || 'Нажмите, чтобы настроить почву и состав'}
                    </span>
                  </span>
                  <span className="profile-object-edit">✏️</span>
                </button>
              )
            })}
          </div>
        )}
        <div className="profile-row"><span className="profile-label">🔔 Советы</span><span className="profile-val">{data.notifMorning} / {data.notifEvening}</span></div>
      </div>

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Удобство чтения</div>
      <div style={{ padding: '0 16px' }}>
        <button
          className={`ob-toggle-row ${data.uiTextScale === 'large' ? 'active' : ''}`}
          onClick={() => onUpdateData({ uiTextScale: data.uiTextScale === 'large' ? 'normal' : 'large' })}
          aria-label={data.uiTextScale === 'large' ? 'Выключить крупный текст' : 'Включить крупный текст'}
        >
          <div>
            <div className="profile-label" style={{ color: '#fff', fontWeight: 800 }}>🔎 Крупнее текст</div>
            <div className="section-helper" style={{ padding: 0, marginTop: 4 }}>
              Увеличивает подписи, поля и основные кнопки без общего zoom, чтобы интерфейс оставался ровным.
            </div>
          </div>
          <div className={`ob-toggle ${data.uiTextScale === 'large' ? 'on' : ''}`} />
        </button>
      </div>
      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Подсказки</div>
      <div style={{ padding: '0 16px' }}>
        <button
          className={`ob-toggle-row ${helpHintsEnabled ? 'active' : ''}`}
          onClick={onToggleHelpHints}
          aria-label={helpHintsEnabled ? 'Выключить подсказки' : 'Включить подсказки'}
        >
          <div>
            <div className="profile-label" style={{ color: '#fff', fontWeight: 800 }}>💡 Показывать подсказки по делу</div>
            <div className="section-helper" style={{ padding: 0, marginTop: 4 }}>
              Короткие пояснения на главной, в растениях, в луне, в дневнике и профиле. Не сыпятся подряд и не мешают работать.
            </div>
          </div>
          <div className={`ob-toggle ${helpHintsEnabled ? 'on' : ''}`} />
        </button>
        <button className="btn-help" style={{ margin: '0 0 10px', width: '100%' }} onClick={onReplayIntro}>
          Показать вступительное ознакомление ещё раз
        </button>
      </div>
      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Инструменты и материалы</div>
      <div style={{ padding: '0 16px' }}>
        <div className="section-helper" style={{ padding: 0, marginBottom: 10 }}>
          Отметьте, что у вас реально есть. Тогда AI будет советовать с опорой на эти вещи, а не ссылаться на абстрактные приборы.
        </div>
        <div className="section-helper" style={{ padding: 0, marginBottom: 10 }}>
          Лейку и шланг отдельно не спрашиваем: считаем их базовыми вещами по умолчанию.
        </div>
        <div className="ob-chips ob-chips-wrap">
          {TOOL_OPTIONS.map(toolName => (
            <button
              key={toolName}
              className={`ob-chip ${data.tools.includes(toolName) ? 'selected' : ''}`}
              onClick={() => handleToolToggle(toolName)}
            >
              {toolName}
            </button>
          ))}
        </div>
      </div>
      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Особенности участка</div>
      <div style={{ padding: '0 16px' }}>
        <div className="section-helper" style={{ padding: 0, marginBottom: 10 }}>
          Сюда можно записать постоянные особенности: почва быстро сохнет, северная сторона, сильный ветер, жёсткая вода, низина, слизни каждый год.
        </div>
        <textarea
          className="profile-edit-input"
          style={{ minHeight: 92, resize: 'vertical', width: '100%' }}
          placeholder="Например: почва быстро пересыхает, после обеда сильное солнце, вода жёсткая, участок ветреный"
          value={data.siteNotes ?? ''}
          onChange={e => onUpdateData({ siteNotes: e.target.value.slice(0, 500) })}
        />
        <div className="profile-edit-hint" style={{ marginTop: 6 }}>
          {`${(data.siteNotes ?? '').length}/500`}
        </div>
      </div>
      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Получать уведомления в</div>
      <div className="notif-channels-grid">
        {NOTIF_CHANNELS.map(ch => {
          const active = notifChannelsDraft.includes(ch.id)
          return (
            <button key={ch.id} className={`notif-channel-btn ${active ? 'active' : ''}`}
              onClick={() => handleChannelToggle(ch.id, active)}>
              <span className="notif-ch-icon">{ch.icon}</span>
              <span className="notif-ch-label">{ch.label}</span>
              {active && <span className="notif-ch-check">✓</span>}
            </button>
          )
        })}
      </div>
      <div style={{ padding: '8px 16px 0' }}>
        <div className="section-helper" style={{ padding: 0, marginBottom: 10 }}>
          Если не хотите усложнять, оставьте только VK и утреннее время. Остальное можно настроить позже.
        </div>
        <div className="section-helper" style={{ padding: 0, marginBottom: 10 }}>
          {telegramLinked
            ? `Telegram подключён${data.telegramUsername ? `: @${data.telegramUsername}` : ''}. Можно получать советы прямо в бот.`
            : 'Чтобы получать советы в Telegram, сначала войдите через Telegram на экране входа.'}
        </div>
        {telegramLinked && !tgTestOk && (
          <button
            className="btn-export"
            style={{ marginBottom: 10 }}
            disabled={tgTestSending}
            onClick={() => {
              setTgTestSending(true)
              void sendTestTelegramNotification(vkUserId)
                .then(() => {
                  try {
                    localStorage.setItem(`${TELEGRAM_TEST_OK_PREFIX}${vkUserId}`, '1')
                  } catch {
                    // Ignore localStorage write failures in private/incognito contexts.
                  }
                  setTgTestOk(true)
                  window.alert('Тестовое сообщение отправлено в Telegram.')
                })
                .catch(error => window.alert(error instanceof Error ? error.message : 'Не удалось отправить тест в Telegram.'))
                .finally(() => setTgTestSending(false))
            }}
          >
            {tgTestSending ? 'Отправляю тест...' : 'Отправить тест в Telegram'}
          </button>
        )}
        {telegramLinked && tgTestOk && (
          <div className="section-helper" style={{ padding: 0, marginBottom: 10 }}>
            Telegram уже проверен. Если когда-нибудь покажется, что советы не приходят, можно{' '}
            <button
              type="button"
              className="btn-link-inline"
              disabled={tgTestSending}
              onClick={() => {
                setTgTestSending(true)
                void sendTestTelegramNotification(vkUserId)
                  .then(() => window.alert('Тестовое сообщение снова отправлено в Telegram.'))
                  .catch(error => window.alert(error instanceof Error ? error.message : 'Не удалось отправить тест в Telegram.'))
                  .finally(() => setTgTestSending(false))
              }}
            >
              отправить ещё раз
            </button>.
          </div>
        )}
        <div className="ob-time-row" style={{ marginBottom: 12 }}>
          <div className="ob-time-field"><label>☀️ Утром</label><input type="time" value={notifMorningDraft} onChange={e => setNotifMorningDraft(e.target.value)} /></div>
          <div className="ob-time-field"><label>🌙 Вечером</label><input type="time" value={notifEveningDraft} onChange={e => setNotifEveningDraft(e.target.value)} /></div>
        </div>
        <input
          className="profile-edit-input"
          type="email"
          placeholder="Email для утренних советов"
          value={notificationEmailDraft}
          onChange={e => setNotificationEmailDraft(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {!isValidNotificationEmail(notificationEmailDraft) && (
          <div className="sub-alert-body" style={{ marginTop: 8, color: '#fca5a5' }}>
            Проверьте email: адрес нужен в формате name@example.com.
          </div>
        )}
        <div className="sub-alert-body" style={{ marginTop: 8 }}>
          Для email-советов используем один адрес.
        </div>
        <div className="sub-alert-body" style={{ marginTop: 6 }}>
          Часовой пояс: {data.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'не определён'}
        </div>
        <button className="btn-upgrade-full" style={{ marginTop: 12 }} onClick={saveNotificationSettings}>
          Сохранить настройки уведомлений
        </button>
      </div>

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>📅 История сезонов</div>
      <SeasonsScreen vkUserId={vkUserId} currentData={data} currentYear={new Date().getFullYear()} />

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Поделиться в VK</div>
      <div className="vk-share-grid">
        <button className="vk-share-card premium" disabled={vkSharing !== null} onClick={() => void handleVkShare()}>
          <div className="vk-share-badge">VK POST</div>
          <div className="vk-share-title">Красивый репост огорода</div>
          <div className="vk-share-sub">Соберу одну информативную карточку с вашим огородом и пользой приложения, открою пост в VK и начислю +1 день Базовой, если бонус сегодня ещё не забирали.</div>
          <div className="vk-share-action">{vkSharing === 'vk_post' ? 'Готовлю карточку и пост...' : 'Сделать репост и получить +1 день'}</div>
        </button>
      </div>

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Пригласи друзей</div>
      <div style={{ padding: '0 16px' }}>
        <div className="subscription-status-card">
          <div className="subscription-status-top">
            <div>
              <div className="subscription-status-label">Реферальная программа</div>
              <div className="subscription-status-title">7 дней Базовой за 3 друзей</div>
            </div>
            <span className="sub-active-badge">{data.referralInvitesAccepted ?? 0}/3</span>
          </div>
          <div className="subscription-status-meta">
            За каждых 3 друзей, которые пришли по твоей ссылке, ты получаешь 7 дней Базовой. За пост в VK — +1 день Базовой, но не чаще одного раза в день.
          </div>
          <div className="subscription-status-meta" style={{ marginTop: 6 }}>
            Друг, который придёт по твоей ссылке, получит 2 дня Базовой бесплатно.
          </div>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <div className="profile-row">
              <span className="profile-label">🎟️ Ваш код</span>
              <span className="profile-val">{data.referralCode || `OG-${vkUserId}`}</span>
            </div>
            <button className="btn-upgrade-full" onClick={() => void copyReferralLink()}>
              Скопировать ссылку приглашения
            </button>
            {data.referralAppliedCode ? (
              <div className="subscription-status-meta" style={{ textAlign: 'center' }}>
                ✅ Код друга применён — 2 дня Базовой уже начислены
              </div>
            ) : (
              <>
                <input
                  className="profile-edit-input"
                  placeholder="Ввести код друга"
                  value={referralInput}
                  onChange={e => setReferralInput(e.target.value.toUpperCase())}
                />
                <button className="btn-export" onClick={applyReferralCode}>
                  Применить код друга
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Ваш тариф</div>
      <div style={{ padding: '0 16px 8px' }}>
        {subscriptionNotice && (
          <div className={`sub-alert-card ${subscriptionNotice.tone === 'expired' ? 'expired' : ''}`} style={{ marginBottom: 10 }}>
            <div className="sub-alert-title">{subscriptionNotice.title}</div>
            <div className="sub-alert-body">{subscriptionNotice.body}</div>
            <button
              className="sub-alert-action"
              onClick={() => {
                const target = document.querySelector('.sub-cards')
                target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              Продлить сейчас
            </button>
          </div>
        )}
        <div className="subscription-status-card">
          <div className="subscription-status-top">
            <div>
              <div className="subscription-status-label">Активный доступ</div>
              <div className="subscription-status-title">{currentTitle}</div>
            </div>
            {plan !== 'free' && <span className="sub-active-badge">Активен</span>}
          </div>
          <div className="subscription-status-meta">{currentMeta}</div>
          {legacyPaidAccess && (
            <div className="subscription-status-meta" style={{ marginTop: 6 }}>
              Детали последней оплаты в этой карточке не сохранились, но сам тариф {plan === 'base' ? 'Базовая' : 'Про'} у вас активен и больше не должен теряться при обычном сохранении профиля.
            </div>
          )}
        </div>
      </div>

      {isOwner && (
        <>
          <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Статистика проекта</div>
          <div style={{ padding: '0 16px' }}>
            <div className="subscription-status-card">
              <div className="subscription-status-top">
                <div>
                  <div className="subscription-status-label">Только для владельца</div>
                  <div className="subscription-status-title">Воронка и выручка</div>
                </div>
                <span className="sub-active-badge">owner</span>
              </div>
              {adminLoading && <div className="subscription-status-meta">Загружаю статистику...</div>}
              {adminError && <div className="subscription-status-meta" style={{ color: '#fca5a5' }}>{adminError}</div>}
              {adminStats && (
                <>
                  <div className="admin-stats-grid">
                    <div className="admin-stat-card"><div className="admin-stat-label">Всего пользователей</div><div className="admin-stat-value">{adminStats.totalUsers}</div></div>
                    <div className="admin-stat-card"><div className="admin-stat-label">Новых за 7 дней</div><div className="admin-stat-value">{adminStats.newUsers7d}</div></div>
                    <div className="admin-stat-card"><div className="admin-stat-label">Платных активных</div><div className="admin-stat-value">{adminStats.activePaidUsers}</div></div>
                    <div className="admin-stat-card"><div className="admin-stat-label">Выручка 30 дней</div><div className="admin-stat-value">{formatPrice(adminStats.revenue30d)}</div></div>
                  </div>
                  <div className="sub-alert-body" style={{ marginTop: 12, wordBreak: 'break-all' }}>{ownerAnalyticsUrl}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn-export" onClick={onOpenOwnerAnalytics}>Открыть полный дашборд</button>
                    <button className="btn-export" onClick={() => void navigator.clipboard.writeText(ownerAnalyticsUrl)}>Скопировать ссылку</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {weeklyPlanOffer && (
        <>
          <div className="section-title" style={{ padding: '0 16px', marginTop: 12 }}>Отдельно от подписки</div>
          <div className="sub-cards">
            <div className={`sub-card ${weeklyPlannerAccess ? 'active' : ''}`}>
              <div className="sub-card-header">
                <span style={{ fontSize: 22 }}>{weeklyPlanOffer.icon}</span>
                <div>
                  <div className="sub-card-name">{weeklyPlanOffer.title}</div>
                  <div className="sub-card-price">{weeklyPlanOffer.priceLabel}</div>
                </div>
                {(plan === 'pro' || weeklyPlannerAccess) && (
                  <span className="sub-active-badge">{plan === 'pro' ? 'В Про' : 'Активен'}</span>
                )}
              </div>
              <div className="subscription-offer-sub">{weeklyPlanOffer.subtitle} · {weeklyPlanOffer.days} дн.</div>
              <div className="subscription-offer-savings" style={{ color: 'rgba(255,255,255,.65)', fontWeight: 600 }}>
                {weeklyPlannerMeta}
              </div>
              <ul className="plan-features">{weeklyPlanOffer.features.map(feature => <li key={`${weeklyPlanOffer.id}-${feature}`}>{feature}</li>)}</ul>
              {!weeklyPlannerAccess && (
                <button className="btn-upgrade-full" disabled={checkoutLoading} onClick={() => void openCheckout(weeklyPlanOffer.id)}>
                  {checkoutLoading && checkoutOfferId === weeklyPlanOffer.id ? 'Открываю оплату...' : `Купить за ${formatPrice(weeklyPlanOffer.amount)}`}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="section-title" style={{ padding: '0 16px', marginTop: 12 }}>Подписки</div>
      <div className="sub-cards">
        {subscriptionOffers.map(offer => {
          const isCurrent = currentSubscription
            ? currentSubscription.level === offer.level && currentSubscription.period === offer.period && plan === offer.level
            : plan === offer.level && offer.period === 'monthly'
          return (
            <div key={offer.id} className={`sub-card ${plan === offer.level ? 'active' : ''}`}>
              {offer.discountPercent > 0 && <div className="plan-badge">СЕЗОН -{offer.discountPercent}%</div>}
              <div className="sub-card-header">
                <span style={{ fontSize: 22 }}>{offer.icon}</span>
                <div>
                  <div className="sub-card-name">{offer.title}</div>
                  <div className="sub-card-price">{offer.priceLabel}</div>
                </div>
                {isCurrent && <span className="sub-active-badge">Текущий</span>}
              </div>
              <div className="subscription-offer-sub">{offer.subtitle} · {offer.days} дн.</div>
              {offer.savings > 0 && (
                <div className="subscription-offer-savings">
                  Было {formatPrice(offer.baseAmount)} · экономия {formatPrice(offer.savings)}
                </div>
              )}
              <ul className="plan-features">{offer.features.map(f => <li key={`${offer.id}-${f}`}>{f}</li>)}</ul>
              {!isCurrent && (
                <button className="btn-upgrade-full" disabled={checkoutLoading} onClick={() => void openCheckout(offer.id)}>
                  {checkoutLoading && checkoutOfferId === offer.id ? 'Открываю оплату...' : `Оплатить ${formatPrice(offer.amount)}`}
                </button>
              )}
            </div>
          )
        })}
        {plan !== 'free' && (
          <button className="btn-downgrade" onClick={downgradeToFree}>Перейти на бесплатный</button>
        )}
      </div>

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>📱 Офлайн-копия</div>
      <div style={{ padding: '0 16px' }}>
        <div className="subscription-status-card">
          <div className="subscription-status-top">
            <div>
              <div className="subscription-status-label">Без сети</div>
              <div className="subscription-status-title">Сохранить данные на устройстве</div>
            </div>
            <span className="sub-active-badge">{offlineMode ? 'Офлайн' : 'Готово'}</span>
          </div>
          <div className="subscription-status-meta">
            Можно заранее обновить офлайн-копию, чтобы без сети открывались сохранённые данные огорода, недавний дневник, последний совет, погода и план недели. Чат, оплата и новые данные без интернета не обновляются.
          </div>
          <div className="sub-alert-body" style={{ marginTop: 10 }}>
            {offlineBundleSavedAt
              ? `Последнее обновление: ${new Date(offlineBundleSavedAt).toLocaleString('ru-RU')}.`
              : 'Офлайн-копия ещё не подготовлена.'}
          </div>
          <button className="btn-upgrade-full" style={{ marginTop: 12 }} disabled={offlinePreparing} onClick={onPrepareOffline}>
            {offlinePreparing ? 'Обновляю офлайн-копию...' : 'Обновить офлайн-копию'}
          </button>
        </div>
      </div>

      {/* Экспорт */}
      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>📤 Экспорт данных</div>
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8 }}>
        <button className="btn-export" disabled={exporting} onClick={async () => {
          setExporting(true)
          const [diary, seasons, notifs] = await Promise.all([
            loadDiary(vkUserId),
            loadSeasons(vkUserId),
            loadNotifications(vkUserId, { limit: 100 }),
          ])
          await exportCSV(data, diary as DiaryEntry[], seasons as Season[], notifs as NotificationRow[])
          setExporting(false)
        }}>📊 CSV</button>
        <button className="btn-export" disabled={exporting} onClick={async () => {
          setExporting(true)
          const [diary, seasons, notifs] = await Promise.all([
            loadDiary(vkUserId),
            loadSeasons(vkUserId),
            loadNotifications(vkUserId, { limit: 100 }),
          ])
          exportHTML(data, diary as DiaryEntry[], seasons as Season[], notifs as NotificationRow[])
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

      <div style={{ padding: '0 16px 8px' }}>
        <button
          className="btn-help"
          onClick={() => {
            window.open('https://vk.com/im?media=&sel=16761047', '_blank', 'noopener,noreferrer')
          }}
        >
          ✉️ Написать нам
        </button>
        <div style={{ textAlign: 'center', marginTop: -6, fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
          Можно написать в VK или на почту <a href="mailto:gorant1991@gmail.com" style={{ color: 'rgba(255,255,255,.65)' }}>gorant1991@gmail.com</a>
        </div>
      </div>

      {/* Удаление аккаунта */}
      <DeleteAccountButton vkUserId={vkUserId} onDeleted={onVkLogout} />
    </div>
  )
}
