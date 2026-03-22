import { useState } from 'react'
import type { DiaryEntry, OnboardingData, Plan, Season } from '../../utils/types'
import { FAQ_ITEMS, NOTIF_CHANNELS, GROW_OPTIONS, OBJECT_LIMITS, buildSubscriptionOffers, createSubscriptionFromOffer, formatDateLabel, formatPrice, getSubscriptionStatusLabel, makeObject } from '../../utils/constants'
import { SeasonsScreen } from './SeasonsScreen'
import { exportCSV, exportHTML } from '../../utils/export'
import { loadDiary, loadSeasons } from '../../supabase'
import { supabase } from '../../supabase'
import { DeleteAccountButton } from '../modals'

interface NotificationRow {
  created_at: string
  title: string
  body: string
}

export function ProfileScreen({ data, plan, onChangePlan, onUpdateData, vkUserId }: {
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
  const offers = buildSubscriptionOffers()
  const currentSubscription = data.subscription ?? null
  const currentTitle = plan === 'free'
    ? 'Бесплатный тариф'
    : currentSubscription
      ? getSubscriptionStatusLabel(currentSubscription)
      : (plan === 'base' ? 'Базовая' : 'Про')
  const currentMeta = currentSubscription
    ? `До ${formatDateLabel(currentSubscription.endsAt)} · оплачено ${formatPrice(currentSubscription.amount)}${currentSubscription.discountPercent > 0 ? ` · скидка ${currentSubscription.discountPercent}%` : ''}`
    : plan === 'free'
      ? '10 культур, 1 объект, базовые советы агронома'
      : 'Активный доступ сохранён. После подключения VK Pay здесь появятся срок и сумма подписки.'

  function activateOffer(offerId: string) {
    const offer = offers.find(item => item.id === offerId)
    if (!offer) return
    onUpdateData({ subscription: createSubscriptionFromOffer(offer) })
    onChangePlan(offer.level)
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
            <span className="profile-val">
              {data.gardenObjects.map(o => GROW_OPTIONS.find(g => g.id === o.type)?.icon).join(' ') || '—'}
            </span>
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

      <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>Ваш тариф</div>
      <div style={{ padding: '0 16px 8px' }}>
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
                <button className="btn-upgrade-full" onClick={() => activateOffer(offer.id)}>
                  Выбрать за {formatPrice(offer.amount)}
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

      {/* Удаление аккаунта */}
      <DeleteAccountButton vkUserId={vkUserId} />
    </div>
  )
}
