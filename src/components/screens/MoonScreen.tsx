import type { Plan, RainObservation, RainObservationStatus } from '../../utils/types'
import { MOON_PHASE_NAMES, MOON_GOOD, MOON_BAD, formatDateLabel, getRainObservation, getRainObservationLabel } from '../../utils/constants'
import { useMoon, useForecast } from '../../hooks'
import type { WeekDay } from '../../hooks'

function getLocalDateKey(value: string | Date) {
  return new Date(value).toLocaleDateString('en-CA')
}

export function MoonScreen({
  plan,
  city,
  rainObservations = [],
  weeklyPlannerAccess = false,
  weeklyPlanAccessUntil = null,
  weeklyPlanDays = [],
  weeklyPlanLoading = false,
  weeklyPlanError = false,
  onUpdateRainObservation,
  onOpenUpgrade,
}: {
  plan: Plan
  city: string
  rainObservations?: RainObservation[]
  weeklyPlannerAccess?: boolean
  weeklyPlanAccessUntil?: string | null
  weeklyPlanDays?: WeekDay[]
  weeklyPlanLoading?: boolean
  weeklyPlanError?: boolean
  onUpdateRainObservation?: (date: string, status: RainObservationStatus) => void
  onOpenUpgrade?: () => void
}) {
  const moon = useMoon()
  const forecast = useForecast(city)
  const phaseName = MOON_PHASE_NAMES[moon.phase] ?? moon.phase
  const good = MOON_GOOD[moon.phase] ?? 'Полив, уход за растениями'
  const bad = MOON_BAD[moon.phase] ?? 'Обрезка'
  const todayKey = getLocalDateKey(new Date())
  const todayForecast = forecast.days.find(day => day.date === todayKey) ?? forecast.days[0] ?? null
  const todayPlan = weeklyPlanDays.find(day => getLocalDateKey(day.date) === todayKey) ?? null
  const todayNeedsRainCheck = Boolean(todayForecast && (
    todayForecast.rainExpected
    || todayPlan?.tasks.some(task => {
      const normalized = task.action.toLowerCase()
      return normalized.includes('полив') || normalized.includes('опрыск')
    })
  ))
  const todayRainObservation = getRainObservation(rainObservations, todayKey)
  const rainObservationOptions: Array<{ value: RainObservationStatus; label: string }> = [
    { value: 'soaked', label: 'Хорошо промочило' },
    { value: 'light', label: 'Только слегка' },
    { value: 'missed', label: 'Нас обошло' },
  ]

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
      <div className="section-helper" style={{ padding: '0 16px 4px' }}>
        Лунный календарь подсказывает общий ритм работ. Если сомневаетесь, ориентируйтесь в первую очередь на погоду и состояние растений.
      </div>

      {/* Недельный план */}
      {weeklyPlannerAccess ? (
      <div className="moon-card" style={{ marginTop: 10 }}>
        <div className="moon-card-title">📅 План на неделю</div>
        {plan !== 'pro' && weeklyPlanAccessUntil && (
          <div className="moon-card-body" style={{ marginBottom: 10 }}>
            Отдельный доступ активен до {formatDateLabel(weeklyPlanAccessUntil)}.
          </div>
        )}
        {weeklyPlanLoading && <div className="moon-card-body">Составляю план...</div>}
        {weeklyPlanError && <div className="moon-card-body" style={{ color: '#f87171' }}>Не удалось загрузить план</div>}
        {!weeklyPlanLoading && !weeklyPlanError && weeklyPlanDays.length === 0 && (
          <div className="moon-card-body" style={{ color: '#64748b' }}>Добавьте посаженные культуры чтобы получить план</div>
        )}
        {weeklyPlanDays.map(day => {
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
        {todayNeedsRainCheck && (
          <div className="rain-observation-card">
            <div className="rain-observation-title">🌧️ Уточните дождь по факту</div>
            <div className="rain-observation-text">
              Прогноз по городу не всегда совпадает с участком. Это уточнение поможет не промахнуться с поливом и опрыскиванием сегодня.
            </div>
            <div className="rain-observation-actions">
              {rainObservationOptions.map(option => (
                <button
                  key={option.value}
                  className={`ob-chip ${todayRainObservation?.status === option.value ? 'selected' : ''}`}
                  onClick={() => onUpdateRainObservation?.(todayKey, option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {todayRainObservation && (
              <div className="rain-observation-meta">
                Сейчас учтено: {getRainObservationLabel(todayRainObservation.status)}.
              </div>
            )}
          </div>
        )}
      </div>
      ) : (
        <div className="plan-promo">
          <div className="plan-promo-icon">📅</div>
          <div>
            <div className="plan-promo-title">План на неделю</div>
            <div className="plan-promo-sub">Можно купить отдельно за 99 ₽ без Базовой или Про. В Про он уже включён.</div>
          </div>
          <button className="btn-upgrade" onClick={onOpenUpgrade}>Открыть оплату</button>
        </div>
      )}

      {(plan === 'base' || plan === 'pro') ? (
        forecast.loading ? (
          <div className="moon-card"><div className="moon-card-body">Загрузка прогноза...</div></div>
        ) : forecast.error ? (
          <div className="moon-card moon-card-warn"><div className="moon-card-body">{forecast.error}</div></div>
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
          <div><div className="plan-promo-title">Прогноз на 7 дней</div><div className="plan-promo-sub">Доступно в Базовой за 150 ₽ в месяц. В Про тоже входит.</div></div>
          <button className="btn-upgrade" onClick={onOpenUpgrade}>Открыть тарифы</button>
        </div>
      )}
    </div>
  )
}
