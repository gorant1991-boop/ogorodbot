import { useEffect } from 'react'
import type { CropEntry, Plan } from '../../utils/types'
import { CROPS, MOON_PHASE_NAMES, MOON_GOOD, MOON_BAD } from '../../utils/constants'
import { useMoon, useForecast, useWeeklyPlan } from '../../hooks'

export function MoonScreen({ plan, city, vkUserId, cropEntries = [] }: { plan: Plan; city: string; vkUserId: number; cropEntries?: CropEntry[] }) {
  const moon = useMoon()
  const forecast = useForecast(city)
  const weekPlan = useWeeklyPlan(vkUserId, plan === 'pro')
  const phaseName = MOON_PHASE_NAMES[moon.phase] ?? moon.phase
  
  // Логирование культур при загрузке/смене
  useEffect(() => {
    const plantedCrops = cropEntries.filter(e => e.status === 'planted').map(e => CROPS.find(c => c.id === e.id)?.name || e.id)
    console.log('[Moon Calendar] Planted cultures for recommendations:', {
      total: cropEntries.length,
      planted: plantedCrops.length,
      crops: plantedCrops,
      allCropIds: cropEntries.map(e => e.id),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
    })
  }, [cropEntries])
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
      {plan === 'pro' ? (
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
          <div><div className="plan-promo-title">План на неделю</div><div className="plan-promo-sub">Доступно в Про: 300 ₽/мес или сезон со скидкой 20%</div></div>
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
          <div><div className="plan-promo-title">Прогноз на 7 дней</div><div className="plan-promo-sub">Доступно в Базовой: 150 ₽/мес или сезон со скидкой 20%</div></div>
          <button className="btn-upgrade">Подключить</button>
        </div>
      )}
    </div>
  )
}
