import { useState } from 'react'
import type { OnboardingData } from '../../utils/types'
import { empty } from '../../utils/constants'
import { ProgressBar, NavButtons } from '../ui'

const TOTAL = 1

const TERRAIN_OPTIONS = [
  { id: 'city', icon: '🏙️', title: 'Город', sub: 'Чаще теплее, меньше риск заморозков' },
  { id: 'dacha_forest', icon: '🌲', title: 'СНТ / дача у леса', sub: 'Часто прохладнее, сырее и с более поздним прогревом' },
  { id: 'lowland', icon: '🌊', title: 'Низина', sub: 'Холод и туманы держатся дольше' },
  { id: 'highland', icon: '⛰️', title: 'Возвышенность', sub: 'Суше и ветренее' },
  { id: 'near_water', icon: '🏞️', title: 'Рядом с водой', sub: 'Влажность выше, микроклимат мягче' },
]

const EXPERIENCE_OPTIONS = [
  { id: 'beginner', icon: '🌱', title: 'Новичок', sub: 'С пояснениями и подсказками' },
  { id: 'amateur', icon: '🌿', title: 'Любитель', sub: 'Коротко и по делу' },
  { id: 'experienced', icon: '🧑‍🌾', title: 'Опытный', sub: 'Только важное и по срокам' },
  { id: 'expert', icon: '🏆', title: 'Эксперт', sub: 'Без лишних объяснений' },
]

function getSeasonalPreview(month: number): { icon: string; label: string; tasks: string[] } {
  if (month === 1 || month === 2) return {
    icon: '📋',
    label: 'Сейчас — время планировать',
    tasks: ['Заказать и проверить семена', 'Составить план посевов и посадок', 'Проверить запасы удобрений и инструмент'],
  }
  if (month === 3) return {
    icon: '🌱',
    label: 'Март — старт рассадного сезона',
    tasks: ['Посев перца, баклажанов и томатов на рассаду', 'Подготовка грунта и ёмкостей', 'Проверка сроков заморозков для вашего региона'],
  }
  if (month === 4) return {
    icon: '🌿',
    label: 'Апрель — активный сев',
    tasks: ['Продолжаем сев томатов, перца, огурцов', 'Редис, зелень и лук — прямо в грунт', 'Прогрев и рыхление грядок после зимы'],
  }
  if (month === 5) return {
    icon: '🏡',
    label: 'Май — высадка в открытый грунт',
    tasks: ['Высадка рассады томатов, перца, капусты', 'Посев огурцов, кабачков, тыкв', 'Мульчирование и первые подкормки'],
  }
  if (month === 6) return {
    icon: '☀️',
    label: 'Июнь — пик роста',
    tasks: ['Регулярный полив в жаркое время', 'Пасынкование томатов', 'Первые подкормки и защита от вредителей'],
  }
  if (month === 7) return {
    icon: '🥒',
    label: 'Июль — первые плоды',
    tasks: ['Сбор огурцов и зелени', 'Подкормка томатов и перца', 'Следим за болезнями при влажной погоде'],
  }
  if (month === 8) return {
    icon: '🍅',
    label: 'Август — урожай в разгаре',
    tasks: ['Сбор томатов, перца, баклажанов', 'Посев зелени на осень', 'Начало уборки раннего картофеля'],
  }
  if (month === 9) return {
    icon: '🍂',
    label: 'Сентябрь — подготовка к финишу',
    tasks: ['Уборка урожая и закладка на хранение', 'Подзимний посев моркови и петрушки', 'Внесение органики в почву'],
  }
  if (month === 10) return {
    icon: '🍁',
    label: 'Октябрь — закрытие сезона',
    tasks: ['Последний сбор и консервация', 'Мульчирование многолетников', 'Подзимний посев чеснока'],
  }
  return {
    icon: '❄️',
    label: 'Ноябрь–декабрь — межсезонье',
    tasks: ['Обработка инструмента и теплицы', 'Планирование следующего сезона', 'Заказ семян по каталогам'],
  }
}

function normalizeLocationValue(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some(needle => haystack.includes(needle))
}

function buildLocationHints(city: string, terrain: string) {
  const hints: string[] = []
  const normalizedCity = normalizeLocationValue(city)

  if (terrain === 'dacha_forest') {
    hints.push('Весной почва и воздух здесь часто прогреваются позже, чем в самом городе.')
    hints.push('Утренний холод, сырость и тень у кромки леса могут держаться дольше обычного.')
    hints.push('Для старта сезона полезно заранее проверить дренаж, освещение и реальные сроки последних заморозков.')
  } else if (terrain === 'lowland') {
    hints.push('В низинах холодный воздух и туман часто задерживаются дольше.')
    hints.push('После дождей почва может просыхать медленнее, а риск сырости и грибковых проблем бывает выше.')
  } else if (terrain === 'highland') {
    hints.push('На возвышенности место часто сильнее продувается и быстрее пересыхает.')
    hints.push('Там обычно важнее контроль полива, мульча и защита от ветра.')
  } else if (terrain === 'near_water') {
    hints.push('Рядом с водой влажность воздуха и почвы часто выше, а роса держится дольше.')
    hints.push('Это может смягчать жару, но иногда добавляет сырость и медленное просыхание листьев.')
  } else if (terrain === 'city') {
    hints.push('В городе или плотном пригороде весной обычно теплее, чем за его пределами.')
    hints.push('Но условия сильно зависят от двора: тень от построек, перегрев у стен и ветер в проходах могут менять картину.')
  }

  if (includesAny(normalizedCity, ['санкт петербург', 'петербург', 'ленинград', 'петрозаводск', 'архангельск', 'вологда', 'псков', 'мурманск'])) {
    hints.push('Для таких северо-западных и северных направлений часто характерны более влажные сезоны и более кислые почвы.')
  } else if (includesAny(normalizedCity, ['краснодар', 'ростов', 'астрахан', 'волгоград', 'ставрополь', 'оренбург', 'элиста'])) {
    hints.push('Для южных и степных направлений чаще важны пересыхание, яркое солнце и ветровая нагрузка.')
  } else if (includesAny(normalizedCity, ['калининград', 'владивосток', 'сочи', 'новороссийск', 'мурманск'])) {
    hints.push('В приморских городах и рядом с крупной водой ветер и влажность могут влиять сильнее обычного.')
  } else if (includesAny(normalizedCity, ['москва', 'тверь', 'ярослав', 'владимир', 'иванов', 'калуга', 'костром', 'нижний новгород', 'рязан', 'тул', 'брянск'])) {
    hints.push('Для средней полосы чаще встречаются суглинки и супеси, но реальные условия на участке могут сильно отличаться даже в пределах одного города.')
  }

  return Array.from(new Set(hints)).slice(0, 4)
}

function createInitialOnboardingData(): OnboardingData {
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return {
    ...empty,
    timeZone: browserTimeZone || empty.timeZone,
    terrain: 'city',
    experience: 'amateur',
    helpHintsEnabled: true,
    introSeen: false,
    seenHints: [],
  }
}

function finalizeOnboardingData(data: OnboardingData): OnboardingData {
  return {
    ...data,
    terrain: data.terrain || 'city',
    experience: data.experience || 'amateur',
    notifMorning: data.notifMorning || '06:00',
    notifEvening: data.notifEvening || '19:00',
    notifLevel: data.notifLevel || 'standard',
    notifChannels: data.notifChannels.length > 0 ? data.notifChannels : ['vk'],
  }
}

export function Onboarding({ onDone }: { onDone: (d: OnboardingData) => void }) {
  const [step, setStep] = useState(0)
  const [d, setD] = useState<OnboardingData>(createInitialOnboardingData)

  const set = (patch: Partial<OnboardingData>) => setD(prev => ({ ...prev, ...patch }))

  const next = () => setStep(current => current + 1)
  const back = () => setStep(current => current - 1)

  function finishOnboarding() {
    onDone(finalizeOnboardingData(d))
  }

  const currentMonth = new Date().getMonth() + 1
  const seasonal = getSeasonalPreview(currentMonth)

  if (step === 0) {
    const locationHints = buildLocationHints(d.city, d.terrain)
    const cityLabel = d.city.trim() ? `В ${d.city}` : 'У вас'

    return (
      <div className="screen onboarding">
        <div className="ob-bg" />
        <div className="ob-content">
          <ProgressBar step={1} total={TOTAL} />
          <div className="ob-seasonal-preview">
            <div className="ob-seasonal-icon">{seasonal.icon}</div>
            <div className="ob-seasonal-body">
              <div className="ob-seasonal-label">{cityLabel} сейчас</div>
              <div className="ob-seasonal-label-sub">{seasonal.label}</div>
              <ul className="ob-seasonal-tasks">
                {seasonal.tasks.map(task => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="ob-icon" style={{ marginTop: 20 }}>🗺️</div>
          <h1>Где ваш огород?</h1>
          <p>Укажите город — уточним советы под вашу погоду и сезон.</p>
          <div className="ob-city-input-wrap">
            <input
              className="ob-city-input"
              type="text"
              value={d.city}
              onChange={event => set({ city: event.target.value })}
              placeholder="Например: Коряжма"
              autoFocus
            />
            {d.city && <span className="ob-city-check">✓</span>}
          </div>
          <p className="ob-city-hint">Можно написать город или ближайший крупный населённый пункт.</p>
          <div className="ob-section-label" style={{ marginTop: 18 }}>Местность</div>
          <div className="ob-cards">
            {TERRAIN_OPTIONS.map(option => (
              <button
                key={option.id}
                className={`ob-card ${d.terrain === option.id ? 'selected' : ''}`}
                onClick={() => set({ terrain: option.id })}
              >
                <span className="ob-card-icon">{option.icon}</span>
                <div>
                  <div className="ob-card-title">{option.title}</div>
                  <div className="ob-card-sub">{option.sub}</div>
                </div>
                {d.terrain === option.id && <span className="ob-check">✓</span>}
              </button>
            ))}
          </div>
          {locationHints.length > 0 && (
            <div className="ob-location-profile">
              <div className="ob-location-profile-title">Предварительные ориентиры</div>
              <div className="ob-location-profile-sub">
                Это не точные факты по участку, а стартовые подсказки по городу и типу местности. Позже их можно уточнить в профиле через почву, сырость, ветер и заметки по участку.
              </div>
              <div className="ob-location-profile-list">
                {locationHints.map(hint => (
                  <div key={hint} className="ob-location-profile-item">{hint}</div>
                ))}
              </div>
            </div>
          )}
          <NavButtons onBack={undefined} onNext={next} nextDisabled={!d.city.trim()} showSkip={false} />
        </div>
      </div>
    )
  }

  if (step === 1) {
    return (
      <div className="screen onboarding">
        <div className="ob-bg" />
        <div className="ob-content">
          <ProgressBar step={TOTAL} total={TOTAL} />
          <div className="ob-icon">🔔</div>
          <h1>Как вести вас дальше?</h1>
          <p>Последний шаг. Культуры, объекты, почву и удобрения добавите внутри приложения.</p>

          <div className="ob-section-label">Как вас называть</div>
          <div className="ob-city-input-wrap" style={{ marginBottom: 16 }}>
            <input
              className="ob-city-input"
              type="text"
              value={d.displayName}
              onChange={event => set({ displayName: event.target.value.slice(0, 30) })}
              placeholder="Можно пропустить"
            />
          </div>

          <div className="ob-section-label">Уровень советов</div>
          <div className="ob-cards">
            {EXPERIENCE_OPTIONS.map(option => (
              <button
                key={option.id}
                className={`ob-card ${d.experience === option.id ? 'selected' : ''}`}
                onClick={() => set({ experience: option.id })}
              >
                <span className="ob-card-icon">{option.icon}</span>
                <div>
                  <div className="ob-card-title">{option.title}</div>
                  <div className="ob-card-sub">{option.sub}</div>
                </div>
                {d.experience === option.id && <span className="ob-check">✓</span>}
              </button>
            ))}
          </div>

          <div className="ob-section-label" style={{ marginTop: 16 }}>Когда присылать советы?</div>
          <div className="ob-time-row" style={{ marginBottom: 20 }}>
            <div className="ob-time-field">
              <label>☀️ Утром</label>
              <input type="time" value={d.notifMorning} onChange={event => set({ notifMorning: event.target.value })} />
            </div>
            <div className="ob-time-field">
              <label>🌙 Вечером</label>
              <input type="time" value={d.notifEvening} onChange={event => set({ notifEvening: event.target.value })} />
            </div>
          </div>

          <div className="ob-hint">По умолчанию советы останутся в VK. Email и остальные настройки доступны внутри приложения.</div>
          <NavButtons onBack={back} onNext={finishOnboarding} nextLabel="Открыть огород 🌱" showSkip={false} />
          <p className="ob-terms-inline">
            Нажимая «Открыть огород», вы принимаете{' '}
            <a href="https://ogorod-ai.ru/terms-privacy.html" target="_blank" rel="noopener noreferrer">
              условия использования
            </a>
          </p>
        </div>
      </div>
    )
  }

  return null
}
