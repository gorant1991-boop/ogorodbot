import { useState } from 'react'
import type { OnboardingData, GardenObject, CropEntry } from '../../utils/types'
import { CROP_CATEGORIES, GROW_OPTIONS, CROPS, NOTIF_CHANNELS, PLAN_SUMMARY_CARDS, empty, makeObject, getOps } from '../../utils/constants'
import { CropVarietyPickerModal } from '../modals'
import { TermsCheckbox, ProgressBar, NavButtons } from '../ui'

export function Onboarding({ onDone }: { onDone: (d: OnboardingData) => void }) {
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
          {PLAN_SUMMARY_CARDS.map(p => (
            <div key={p.id} className={`plan-card plan-${p.id}`}>
              {p.badge && <div className="plan-badge">{p.badge}</div>}
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
        if (obLimitReached) return
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
