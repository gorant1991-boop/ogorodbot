import { useEffect, useState } from 'react'
import type { DiaryEntry, OnboardingData, Plan, Season } from '../../utils/types'
import { FAQ_ITEMS, NOTIF_CHANNELS, GROW_OPTIONS, OBJECT_LIMITS, buildSubscriptionOffers, formatDateLabel, formatPrice, getSubscriptionNotice, getSubscriptionStatusLabel, makeObject } from '../../utils/constants'
import { shareGardenToVk } from '../../utils/shareCards'
import type { VkAuthState } from '../../utils/vk'
import type { AdminStats, EmailAuthState } from '../../supabase'
import { SeasonsScreen } from './SeasonsScreen'
import { exportCSV, exportHTML } from '../../utils/export'
import { createYooKassaPayment, getYooKassaPaymentStatus, loadAdminStats, loadDiary, loadSeasons, trackAnalyticsEvent } from '../../supabase'
import { supabase } from '../../supabase'
import { DeleteAccountButton } from '../modals'

interface NotificationRow {
  created_at: string
  title: string
  body: string
}

const OWNER_VK_ID = 16761047
const OWNER_EMAILS = ['gorant1991@gmail.com']

export function ProfileScreen({ data, plan, onChangePlan, onUpdateData, vkUserId, vkAuth, emailAuth, vkLoginAvailable, onVkLogin, onVkLogout }: {
  data: OnboardingData
  plan: Plan
  onChangePlan: (p: Plan) => void
  onUpdateData: (patch: Partial<OnboardingData>) => void
  vkUserId: number
  vkAuth: VkAuthState | null
  emailAuth: EmailAuthState | null
  vkLoginAvailable: boolean
  onVkLogin: () => void
  onVkLogout: () => void
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
  const [editExp, setEditExp] = useState(false)
  const [showAddObject, setShowAddObject] = useState(false)
  const [editObjectId, setEditObjectId] = useState<string | null>(null)
  const [showFaq, setShowFaq] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [vkSharing, setVkSharing] = useState<'garden' | 'premium' | null>(null)
  const [referralInput, setReferralInput] = useState('')
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null)
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [notifMorningDraft, setNotifMorningDraft] = useState(data.notifMorning)
  const [notifEveningDraft, setNotifEveningDraft] = useState(data.notifEvening)
  const [notificationEmailDraft, setNotificationEmailDraft] = useState(data.notificationEmail)
  const [notifChannelsDraft, setNotifChannelsDraft] = useState(data.notifChannels)
  const expLabel = { beginner: '🌱 Новичок', amateur: '🌿 Любитель', experienced: '🧑‍🌾 Опытный', expert: '🏆 Эксперт' }[data.experience] ?? '—'
  const offers = buildSubscriptionOffers()
  const currentSubscription = data.subscription ?? null
  const subscriptionNotice = getSubscriptionNotice(currentSubscription)
  const isOwner = vkUserId === OWNER_VK_ID || Boolean(emailAuth?.email && OWNER_EMAILS.includes(emailAuth.email.toLowerCase()))
  const currentTitle = plan === 'free'
    ? 'Бесплатный тариф'
    : currentSubscription
      ? getSubscriptionStatusLabel(currentSubscription)
      : (plan === 'base' ? 'Базовая' : 'Про')
  const currentMeta = currentSubscription
    ? `До ${formatDateLabel(currentSubscription.endsAt)} · оплачено ${formatPrice(currentSubscription.amount)}${currentSubscription.discountPercent > 0 ? ` · скидка ${currentSubscription.discountPercent}%` : ''}`
    : plan === 'free'
      ? '10 культур, 1 объект, базовые советы агронома'
      : 'Активный доступ сохранён. Здесь отображаются срок и сумма после успешной оплаты через ЮKassa.'

  function normalizeNotificationEmail(value: string) {
    return value.trim().toLowerCase()
  }

  function isValidNotificationEmail(value: string) {
    const normalized = normalizeNotificationEmail(value)
    if (!normalized) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  }

  function handleChannelToggle(channelId: string, active: boolean) {
    setNotifChannelsDraft(prev => active ? prev.filter(x => x !== channelId) : [...prev, channelId])
  }

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
        source: 'subscription',
        metadata: { offerId },
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

  async function handleVkShare(theme: 'garden' | 'premium') {
    setVkSharing(theme)
    try {
      await shareGardenToVk(data, plan, theme)
      void trackAnalyticsEvent({
        vkUserId,
        eventType: 'vk_share',
        source: theme,
        metadata: { theme, plan },
      })
      const lastPromoShareAt = data.lastPromoShareAt ? new Date(data.lastPromoShareAt) : null
      const oneDayMs = 24 * 60 * 60 * 1000
      const canGrantShareBonus = !lastPromoShareAt || (Date.now() - lastPromoShareAt.getTime()) >= oneDayMs
      if (canGrantShareBonus) {
        onUpdateData({
          promoPostShares: (data.promoPostShares ?? 0) + 1,
          lastPromoShareAt: new Date().toISOString(),
          subscription: {
            level: 'base',
            period: 'monthly',
            status: 'active',
            startsAt: new Date().toISOString(),
            endsAt: (() => {
              const base = data.subscription && new Date(data.subscription.endsAt).getTime() > Date.now()
                ? new Date(data.subscription.endsAt)
                : new Date()
              base.setDate(base.getDate() + 1)
              return base.toISOString()
            })(),
            monthlyPrice: 150,
            amount: data.subscription?.amount ?? 0,
            baseAmount: data.subscription?.baseAmount ?? 0,
            discountPercent: data.subscription?.discountPercent ?? 0,
            source: 'manual',
          },
        })
        if (plan === 'free') onChangePlan('base')
        window.alert('За пост в VK начислен бонус: +1 день Базовой подписки.')
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
  }, [data.notifMorning, data.notifEvening, data.notificationEmail, data.notifChannels])

  async function copyReferralLink() {
    const link = `${window.location.origin}?ref=${encodeURIComponent(data.referralCode || `OG-${vkUserId}`)}`
    await navigator.clipboard.writeText(link)
    window.alert('Ссылка приглашения скопирована.')
  }

  useEffect(() => {
    if (!checkoutOpen || !checkoutToken) return

    const confirmationToken = checkoutToken
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

      const container = document.getElementById('yookassa-payment-widget')
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
      widget.render(container)
    }

    void renderWidget().catch((error: unknown) => {
      setCheckoutStatus('error')
      setCheckoutError(error instanceof Error ? error.message : 'Не удалось подготовить окно оплаты')
    })

    return () => {
      canceled = true
      widget?.destroy?.()
      const container = document.getElementById('yookassa-payment-widget')
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
        if (result.status === 'succeeded' && result.subscription) {
          onUpdateData({ subscription: result.subscription })
          onChangePlan(result.subscription.level)
          void trackAnalyticsEvent({
            vkUserId,
            eventType: 'payment_succeeded',
            source: 'yookassa',
            metadata: {
              paymentId: checkoutPaymentId,
              level: result.subscription.level,
              period: result.subscription.period,
              amount: result.subscription.amount,
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
  }, [checkoutOpen, checkoutPaymentId, checkoutStatus, onChangePlan, onUpdateData, vkUserId])

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

  const checkoutOffer = offers.find(item => item.id === checkoutOfferId) ?? null

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
              После успешной оплаты тариф включится автоматически и появится в вашем профиле.
            </div>
            {checkoutError && <div className="payment-error">{checkoutError}</div>}
            {checkoutStatus === 'succeeded' ? (
              <div className="payment-success">
                <div className="payment-success-title">Оплата прошла</div>
                <div className="payment-success-sub">Подписка уже активирована.</div>
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

      {editingObject && (
        <div className="modal-overlay" onClick={() => setEditObjectId(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">Редактировать объект</span>
              <button className="modal-close" onClick={() => setEditObjectId(null)}>✕</button>
            </div>
            <div className="modal-section-label">Название</div>
            <input
              className="profile-edit-input"
              value={editingObject.name}
              onChange={e => updateObject(editingObject.uid, { name: e.target.value })}
              placeholder="Название объекта"
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
            <div className="vk-connect-title">VK ID</div>
            <div className="vk-connect-sub">
              {vkAuth
                ? `Подключён аккаунт VK · ID ${vkAuth.userId}${vkAuth.email ? ` · ${vkAuth.email}` : ''}`
                : emailAuth
                  ? `Вы вошли по email · ${emailAuth.email}`
                : vkLoginAvailable
                  ? 'Подключите VK, чтобы сайт узнавал ваш аккаунт и открывался как доверенное web-приложение.'
                  : 'Добавьте VITE_VK_APP_ID в .env, чтобы включить вход через VK ID.'}
            </div>
          </div>
          {vkAuth || emailAuth ? (
            <button className="vk-connect-btn secondary" onClick={onVkLogout}>Выйти</button>
          ) : (
            <button className="vk-connect-btn" disabled={!vkLoginAvailable} onClick={onVkLogin}>Войти через VK</button>
          )}
        </div>

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
            <button className="profile-add-btn" onClick={() => setShowAddObject(true)}>+</button>
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
        <button className="vk-share-card" disabled={vkSharing !== null} onClick={() => void handleVkShare('garden')}>
          <div className="vk-share-badge">VK POST</div>
          <div className="vk-share-title">Обычный пост огорода</div>
          <div className="vk-share-sub">Соберу красивую карточку грядок, сортов и города, затем открою пост в VK.</div>
          <div className="vk-share-action">{vkSharing === 'garden' ? 'Готовлю карточку...' : 'Сделать пост'}</div>
        </button>
        <button className="vk-share-card premium" disabled={vkSharing !== null} onClick={() => void handleVkShare('premium')}>
          <div className="vk-share-badge">PREMIUM</div>
          <div className="vk-share-title">Премиум-пост</div>
          <div className="vk-share-sub">Более яркая карточка с акцентом на подписку, AI-советы, свои сорта и дневник.</div>
          <div className="vk-share-action">{vkSharing === 'premium' ? 'Готовлю премиум...' : 'Сделать премиум-пост'}</div>
        </button>
      </div>

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Пригласи друзей</div>
      <div style={{ padding: '0 16px' }}>
        <div className="subscription-status-card">
          <div className="subscription-status-top">
            <div>
              <div className="subscription-status-label">Реферальная программа</div>
              <div className="subscription-status-title">7 дней Базовой за 2 друзей</div>
            </div>
            <span className="sub-active-badge">{data.referralInvitesAccepted ?? 0}/2</span>
          </div>
          <div className="subscription-status-meta">
            За каждых 2 друзей, которые пришли по твоей ссылке, ты получаешь 7 дней Базовой. За пост в VK — +1 день Базовой, но не чаще одного раза в день.
          </div>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <div className="profile-row">
              <span className="profile-label">🎟️ Ваш код</span>
              <span className="profile-val">{data.referralCode || `OG-${vkUserId}`}</span>
            </div>
            <button className="btn-upgrade-full" onClick={() => void copyReferralLink()}>
              Скопировать ссылку приглашения
            </button>
            <input
              className="profile-edit-input"
              placeholder="Ввести код друга"
              value={referralInput}
              onChange={e => setReferralInput(e.target.value.toUpperCase())}
            />
            <button className="btn-export" onClick={applyReferralCode}>
              Применить код друга
            </button>
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
                <div className="admin-stats-grid">
                  <div className="admin-stat-card"><div className="admin-stat-label">Всего пользователей</div><div className="admin-stat-value">{adminStats.totalUsers}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Новых за 7 дней</div><div className="admin-stat-value">{adminStats.newUsers7d}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Платных активных</div><div className="admin-stat-value">{adminStats.activePaidUsers}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Записей в дневнике</div><div className="admin-stat-value">{adminStats.diaryEntries}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Успешных оплат</div><div className="admin-stat-value">{adminStats.successfulPayments}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Выручка всего</div><div className="admin-stat-value">{formatPrice(adminStats.revenueTotal)}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Выручка 30 дней</div><div className="admin-stat-value">{formatPrice(adminStats.revenue30d)}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Входов 7 дней</div><div className="admin-stat-value">{adminStats.authSuccesses7d}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Онбординг 7 дней</div><div className="admin-stat-value">{adminStats.onboardingCompleted7d}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Открыли оплату</div><div className="admin-stat-value">{adminStats.checkoutOpened7d}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Оплатили 30 дней</div><div className="admin-stat-value">{adminStats.paymentSucceeded30d}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">Рефералы 7 дней</div><div className="admin-stat-value">{adminStats.referralApplied7d}</div></div>
                  <div className="admin-stat-card"><div className="admin-stat-label">VK-посты 7 дней</div><div className="admin-stat-value">{adminStats.vkShares7d}</div></div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="sub-cards">
        {offers.map(offer => {
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

      {/* Экспорт */}
      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>📤 Экспорт данных</div>
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 8 }}>
        <button className="btn-export" disabled={exporting} onClick={async () => {
          setExporting(true)
          const [diary, seasons, notifs] = await Promise.all([
            loadDiary(vkUserId),
            loadSeasons(vkUserId),
            supabase.from('notifications').select('*').eq('vk_user_id', vkUserId).order('created_at', { ascending: false }).limit(100).then(r => r.data || []),
          ])
          await exportCSV(data, diary as DiaryEntry[], seasons as Season[], notifs as NotificationRow[])
          setExporting(false)
        }}>📊 CSV</button>
        <button className="btn-export" disabled={exporting} onClick={async () => {
          setExporting(true)
          const [diary, seasons, notifs] = await Promise.all([
            loadDiary(vkUserId),
            loadSeasons(vkUserId),
            supabase.from('notifications').select('*').eq('vk_user_id', vkUserId).order('created_at', { ascending: false }).limit(100).then(r => r.data || []),
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
      <DeleteAccountButton vkUserId={vkUserId} />
    </div>
  )
}
