import { useEffect, useMemo, useState } from 'react'
import { loadAdminStats, type AdminStats } from '../../supabase'
import { formatPrice } from '../../utils/constants'

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value * 100)}%`
}

function safeRatio(numerator: number, denominator: number) {
  if (!denominator) return 0
  return numerator / denominator
}

function buildOwnerAnalyticsUrl() {
  return `${window.location.origin}/?view=owner-analytics`
}

export function OwnerAnalyticsScreen({
  isOwner,
  onBack,
}: {
  isOwner: boolean
  onBack: () => void
}) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOwner) return

    let cancelled = false

    void loadAdminStats()
      .then(nextStats => {
        if (!cancelled) setStats(nextStats)
      })
      .catch(nextError => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить аналитику')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOwner])

  const funnel = useMemo(() => {
    if (!stats) return null

    const authToOnboarding = safeRatio(stats.onboardingCompleted7d, stats.authSuccesses7d)
    const onboardingToCheckout = safeRatio(stats.checkoutOpened7d, stats.onboardingCompleted7d)
    const checkoutToPayment = safeRatio(stats.successfulPayments7d, stats.checkoutOpened7d)
    const authToPayment = safeRatio(stats.successfulPayments7d, stats.authSuccesses7d)
    const paidShare = safeRatio(stats.activePaidUsers, stats.totalUsers)
    const arppu30d = safeRatio(stats.revenue30d, stats.paymentSucceeded30d)

    return {
      authToOnboarding,
      onboardingToCheckout,
      checkoutToPayment,
      authToPayment,
      paidShare,
      arppu30d,
    }
  }, [stats])

  const ownerAnalyticsUrl = buildOwnerAnalyticsUrl()

  return (
    <div className="tab-content">
      <div className="main-header">
        <div>
          <div className="greeting">Owner Analytics</div>
          <div className="date">Приватный дашборд проекта</div>
        </div>
        <button className="back-btn" onClick={onBack}>←</button>
      </div>

      <div style={{ padding: '0 16px 100px' }}>
        <div className="subscription-status-card" style={{ marginTop: 8 }}>
          <div className="subscription-status-top">
            <div>
              <div className="subscription-status-label">Прямая ссылка</div>
              <div className="subscription-status-title">Отдельный вход в аналитику</div>
            </div>
            <span className="sub-active-badge">owner</span>
          </div>
          <div className="subscription-status-meta">
            Это не отдельный логин. Ссылка сработает только в том браузере и профиле, где уже активен владельческий вход; в инкогнито, другом браузере или на другом устройстве придётся войти заново.
          </div>
          <div className="sub-alert-body" style={{ marginTop: 10, wordBreak: 'break-all' }}>{ownerAnalyticsUrl}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn-export" onClick={() => void navigator.clipboard.writeText(ownerAnalyticsUrl)}>Скопировать ссылку</button>
            <button className="btn-export" onClick={() => window.location.assign(ownerAnalyticsUrl)}>Открыть здесь</button>
          </div>
        </div>

        {loading && (
          <div className="subscription-status-card" style={{ marginTop: 16 }}>
            <div className="subscription-status-meta">Загружаю owner-метрики...</div>
          </div>
        )}

        {!isOwner && (
          <div className="sub-alert-card expired" style={{ marginTop: 16 }}>
            <div className="sub-alert-title">Доступ закрыт</div>
            <div className="sub-alert-body">Этот экран доступен только владельцу проекта. Если вы владелец, откройте ссылку в той же сессии, где уже выполнен вход через VK ID или owner-email.</div>
          </div>
        )}

        {isOwner && !loading && error && (
          <div className="sub-alert-card expired" style={{ marginTop: 16 }}>
            <div className="sub-alert-title">Доступ закрыт</div>
            <div className="sub-alert-body">{error}</div>
          </div>
        )}

        {isOwner && !loading && !error && stats && funnel && (
          <>
            <div className="section-title" style={{ padding: '0 0', marginTop: 16 }}>Срез</div>
            <div className="admin-stats-grid">
              <div className="admin-stat-card"><div className="admin-stat-label">Всего пользователей</div><div className="admin-stat-value">{stats.totalUsers}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Платных активных</div><div className="admin-stat-value">{stats.activePaidUsers}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Новых за 7 дней</div><div className="admin-stat-value">{stats.newUsers7d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Новых за 30 дней</div><div className="admin-stat-value">{stats.newUsers30d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Выручка 7 дней</div><div className="admin-stat-value">{formatPrice(stats.revenue7d)}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Выручка 30 дней</div><div className="admin-stat-value">{formatPrice(stats.revenue30d)}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Успешных оплат всего</div><div className="admin-stat-value">{stats.successfulPayments}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Успешных оплат 7 дней</div><div className="admin-stat-value">{stats.successfulPayments7d}</div></div>
            </div>

            <div className="section-title" style={{ padding: '0 0', marginTop: 16 }}>Воронка 7 дней</div>
            <div className="admin-stats-grid">
              <div className="admin-stat-card"><div className="admin-stat-label">Успешных входов</div><div className="admin-stat-value">{stats.authSuccesses7d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Завершили онбординг</div><div className="admin-stat-value">{stats.onboardingCompleted7d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Открыли оплату</div><div className="admin-stat-value">{stats.checkoutOpened7d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Успешно оплатили</div><div className="admin-stat-value">{stats.successfulPayments7d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Вход → онбординг</div><div className="admin-stat-value">{formatPercent(funnel.authToOnboarding)}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Онбординг → оплата</div><div className="admin-stat-value">{formatPercent(funnel.onboardingToCheckout)}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Оплата → успех</div><div className="admin-stat-value">{formatPercent(funnel.checkoutToPayment)}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Вход → платёж</div><div className="admin-stat-value">{formatPercent(funnel.authToPayment)}</div></div>
            </div>

            <div className="section-title" style={{ padding: '0 0', marginTop: 16 }}>Качество базы</div>
            <div className="admin-stats-grid">
              <div className="admin-stat-card"><div className="admin-stat-label">Активных профилей 7 дней</div><div className="admin-stat-value">{stats.activeProfiles7d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Активных профилей 30 дней</div><div className="admin-stat-value">{stats.activeProfiles30d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Доля платящих</div><div className="admin-stat-value">{formatPercent(funnel.paidShare)}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Средний чек 30 дней</div><div className="admin-stat-value">{formatPrice(funnel.arppu30d)}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Записей в дневнике</div><div className="admin-stat-value">{stats.diaryEntries}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Выручка всего</div><div className="admin-stat-value">{formatPrice(stats.revenueTotal)}</div></div>
            </div>

            <div className="section-title" style={{ padding: '0 0', marginTop: 16 }}>Маркетинг 30 дней</div>
            <div className="admin-stats-grid">
              <div className="admin-stat-card"><div className="admin-stat-label">Успешных входов</div><div className="admin-stat-value">{stats.authSuccesses30d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Онбординг завершён</div><div className="admin-stat-value">{stats.onboardingCompleted30d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Открыли оплату</div><div className="admin-stat-value">{stats.checkoutOpened30d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Оплатили</div><div className="admin-stat-value">{stats.paymentSucceeded30d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">Рефералов</div><div className="admin-stat-value">{stats.referralApplied30d}</div></div>
              <div className="admin-stat-card"><div className="admin-stat-label">VK-постов</div><div className="admin-stat-value">{stats.vkShares30d}</div></div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
