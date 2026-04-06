import { useState } from 'react'
import type { DiaryEntry, OnboardingData, CropEntry, CropVariety, FertilizerItem, Plan } from '../../utils/types'
import { CROPS, CROP_CATEGORIES, CROP_DAYS, PLAN_LIMITS, GROW_OPTIONS, OBJECT_LIMITS, SOIL_LABELS, buildDiaryText, buildObjectName, getCropNameCase, getDiaryEntryKindOptions, getFirstOp, getOperationDetailOptions, getOps, getPrimaryOp, getWeatherRisks, daysSince, getCropStage, isPerennial, makeObject } from '../../utils/constants'
import { useWeather } from '../../hooks'
import { CropEditModal, CropVarietyPickerModal } from '../../components/modals'
import { CompatScreen } from './CompatScreen'
import { DiseaseScreen } from './DiseaseScreen'
import { addDiaryEntry } from '../../supabase'

export function PlantsScreen({ data, plan, onUpdateEntry, onAddEntry, onDeleteEntry, vkUserId, onAskAi, onUpdateData, completedTodayTaskKeys = [], completingTodayTaskKey = '', onCompleteTodayTask, onDiaryEntryAdded, onUpgrade }: {
  data: OnboardingData
  plan: Plan
  onUpdateEntry: (id: string, patch: Partial<CropEntry>) => void
  onAddEntry: (entry: CropEntry) => void
  onDeleteEntry: (id: string) => void
  vkUserId: number
  onAskAi: (question: string, displayQuestion: string) => void
  onUpdateData: (patch: Partial<OnboardingData>) => void
  completedTodayTaskKeys?: string[]
  completingTodayTaskKey?: string
  onCompleteTodayTask?: (entry: CropEntry) => void
  onDiaryEntryAdded?: (entry: DiaryEntry) => void
  onUpgrade?: () => void
}) {
  const [editEntry, setEditEntry] = useState<CropEntry | null>(null)
  const [showDiaryAdd, setShowDiaryAdd] = useState(false)
  const [diaryCropId, setDiaryCropId] = useState<string>('')
  const [diaryVariety, setDiaryVariety] = useState<string>('')
  const [diaryText, setDiaryText] = useState('')
  const [diaryOp, setDiaryOp] = useState('')
  const [diaryKind, setDiaryKind] = useState<'done' | 'observation' | 'plan'>('observation')
  const [diaryOpDetail, setDiaryOpDetail] = useState('')
  const [diarySaving, setDiarySaving] = useState(false)
  const [showAddCrop, setShowAddCrop] = useState(false)
  const [pickerCropId, setPickerCropId] = useState<string | null>(null)
  const [activeCat, setActiveCat] = useState(0)
  const weather = useWeather(data.city)
  const [plantsTab, setPlantsTab] = useState<'plants' | 'fertilizers' | 'compat' | 'disease'>('plants')
  const [fertilizerDraft, setFertilizerDraft] = useState<FertilizerItem>({ id: '', name: '', brand: '', composition: '', note: '' })
  const [editingFertilizerId, setEditingFertilizerId] = useState<string | null>(null)
  const risks = weather.loading || weather.error ? [] : getWeatherRisks(weather.temp, weather.humidity, data.cropEntries, data.gardenObjects)

  function getVarietySummary(entry: CropEntry) {
    const namedVarieties = entry.varieties.filter(v => v.name.trim())
    if (namedVarieties.length === 0) return ''
    if (namedVarieties.length === 1) return namedVarieties[0].name.trim()

    const preview = namedVarieties.slice(0, 2).map(v => v.name.trim()).join(', ')
    const extra = namedVarieties.length - 2
    return extra > 0 ? `${preview} +${extra}` : preview
  }

  function getVarietyNotes(entry: CropEntry) {
    return entry.varieties
      .filter(v => v.name.trim() && v.note?.trim())
      .map(v => `${v.name.trim()}: ${v.note?.trim()}`)
  }

  function getProgressStartDate(entry: CropEntry) {
    return entry.emergenceDate?.trim() || entry.sowDate
  }

  function getTotalMaturityDays(entry: CropEntry) {
    return entry.maturityDays ?? entry.varieties[0]?.days ?? CROP_DAYS[entry.id] ?? 90
  }

  function getTimingSourceLabel(entry: CropEntry) {
    if (entry.emergenceDate) return 'от всходов'
    if (entry.sowMethod === 'seedling') return 'от посева'
    return 'от посева'
  }

  const existingIds = data.cropEntries.map(e => e.id)
  const cropLimit = PLAN_LIMITS[plan]
  const cropLimitReached = data.cropEntries.length >= cropLimit
  const diaryCrop = data.cropEntries.find(e => e.id === diaryCropId)

  function buildAdviceQuestion(entry: CropEntry, varietyName?: string) {
    const crop = CROPS.find(c => c.id === entry.id)
    const location = data.gardenObjects.find(obj => obj.uid === entry.location)
    const cleanVariety = varietyName?.trim()
    const selectedVariety = cleanVariety
      ? entry.varieties.find(variety => variety.name.trim() === cleanVariety)
      : null
    const allVarieties = entry.varieties.filter(v => v.name.trim()).map(v => v.name.trim())
    const varietyLabel = cleanVariety
      ? `Сорт: ${cleanVariety}.${selectedVariety?.note?.trim() ? ` Пометка по сорту: ${selectedVariety.note.trim()}.` : ''}${selectedVariety?.days ? ` Срок сорта: около ${selectedVariety.days} дней.` : ''}`
      : allVarieties.length > 0
        ? `Сорта: ${allVarieties.join(', ')}.`
        : 'Сорт пока не указан.'
    const shortVarietyLabel = cleanVariety
      ? `сорт ${cleanVariety}`
      : allVarieties.length > 0
        ? `сорта ${allVarieties.slice(0, 2).join(', ')}${allVarieties.length > 2 ? ' и др.' : ''}`
        : ''
    const statusLabel = entry.status === 'planted' ? 'уже посажена' : 'пока планируется'
    const dateLabel = entry.sowDate ? `Дата посева или высадки: ${entry.sowDate}.` : 'Дата посева или высадки пока не указана.'
    const cropDative = getCropNameCase(entry.id, 'dative')
    const displayQuestion = [
      `Совет по культуре: ${crop?.name ?? entry.id}`,
      shortVarietyLabel,
      location?.name ? `место ${location.name}` : '',
      entry.status === 'planted' ? 'статус: посажена' : 'статус: в планах',
      entry.sowDate ? `дата: ${entry.sowDate}` : '',
    ].filter(Boolean).join(' · ')

    return {
      displayQuestion,
      aiQuestion: `Дай конкретный практический совет по ${cropDative}. ${varietyLabel} Статус: ${statusLabel}. ${dateLabel} Место выращивания: ${location?.name ?? 'не указано'}. Пиши только по-русски, без английских слов и технических id. Лучше отвечай коротко и по схеме: что сделать сейчас, что проверить дальше, за чем следить в ближайшие дни.`,
    }
  }

  function closeDiaryAdd() {
    setDiaryText('')
    setDiaryOp('')
    setDiaryCropId('')
    setDiaryVariety('')
    setDiaryKind('observation')
    setDiaryOpDetail('')
    setShowDiaryAdd(false)
    setDiarySaving(false)
  }

  async function handleDiarySave() {
    if (!diaryText.trim()) return
    setDiarySaving(true)
    try {
      const savedEntry = await addDiaryEntry(
        vkUserId,
        diaryCropId || null,
        diaryOp || null,
        buildDiaryText(diaryText, {
          varietyName: diaryVariety,
          entryKind: diaryKind,
          operationDetail: diaryOpDetail || null,
        })
      )
      onDiaryEntryAdded?.(savedEntry)
      closeDiaryAdd()
    } catch (error) {
      setDiarySaving(false)
      window.alert(error instanceof Error ? error.message : 'Не удалось сохранить запись. Попробуйте ещё раз.')
    }
  }

  function updateFertilizers(next: FertilizerItem[]) {
    onUpdateData({ fertilizers: next })
  }

  function resetFertilizerDraft() {
    setFertilizerDraft({ id: '', name: '', brand: '', composition: '', note: '' })
    setEditingFertilizerId(null)
  }

  function startEditFertilizer(item: FertilizerItem) {
    setFertilizerDraft(item)
    setEditingFertilizerId(item.id)
    setPlantsTab('fertilizers')
  }

  function saveFertilizer() {
    if (!fertilizerDraft.name.trim()) return
    const nextItem = {
      ...fertilizerDraft,
      id: fertilizerDraft.id || crypto.randomUUID(),
      name: fertilizerDraft.name.trim(),
      brand: fertilizerDraft.brand?.trim() ?? '',
      composition: fertilizerDraft.composition?.trim() ?? '',
      note: fertilizerDraft.note?.trim() ?? '',
    }
    const existing = Array.isArray(data.fertilizers) ? data.fertilizers : []
    const next = editingFertilizerId
      ? existing.map(item => item.id === editingFertilizerId ? nextItem : item)
      : [...existing, nextItem]
    updateFertilizers(next)
    resetFertilizerDraft()
  }

  function removeFertilizer(id: string) {
    const existing = Array.isArray(data.fertilizers) ? data.fertilizers : []
    updateFertilizers(existing.filter(item => item.id !== id))
    if (editingFertilizerId === id) resetFertilizerDraft()
  }

  const diaryKindOptions = getDiaryEntryKindOptions()
  const diaryDetailOptions = diaryOp ? getOperationDetailOptions(diaryOp) : []

  return (
    <div className="tab-content">
      {showDiaryAdd && (
        <div className="modal-overlay" onClick={closeDiaryAdd}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">📝 Запись в дневник</span>
              <button className="modal-close" onClick={closeDiaryAdd}>✕</button>
            </div>
            {diaryCropId && (
              <>
                <div className="modal-section-label">Культура</div>
                <div className="ob-hint" style={{ marginBottom: 12 }}>
                  {CROPS.find(c => c.id === diaryCropId)?.icon} {CROPS.find(c => c.id === diaryCropId)?.name}
                  {diaryVariety ? ` · сорт ${diaryVariety}` : ''}
                </div>
                <div className="modal-section-label">Операция</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {getOps(diaryCropId).map(op => (
                    <button key={op.id} className={`ob-chip ${diaryOp === op.id ? 'selected' : ''}`}
                      onClick={() => {
                        const nextValue = diaryOp === op.id ? '' : op.id
                        setDiaryOp(nextValue)
                        setDiaryOpDetail('')
                        if (nextValue && diaryKind === 'observation') setDiaryKind('done')
                      }}>{op.label}</button>
                  ))}
                </div>
                <div className="modal-section-label">Это что за запись</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {diaryKindOptions.map(option => (
                    <button
                      key={option.value}
                      className={`ob-chip ${diaryKind === option.value ? 'selected' : ''}`}
                      onClick={() => setDiaryKind(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {diaryDetailOptions.length > 0 && (
                  <>
                    <div className="modal-section-label">Уточнение операции</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {diaryDetailOptions.map(option => (
                        <button
                          key={option.value}
                          className={`ob-chip ${diaryOpDetail === option.value ? 'selected' : ''}`}
                          onClick={() => setDiaryOpDetail(diaryOpDetail === option.value ? '' : option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {diaryCrop?.varieties.some(v => v.name.trim()) && (
                  <>
                    <div className="modal-section-label">Сорт</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {diaryCrop.varieties.filter(v => v.name.trim()).map(v => (
                        <button
                          key={v.name}
                          className={`ob-chip ${diaryVariety === v.name ? 'selected' : ''}`}
                          onClick={() => setDiaryVariety(diaryVariety === v.name ? '' : v.name)}
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            <div className="modal-section-label">Заметка</div>
            <textarea
              style={{ width: '100%', minHeight: 80, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 10, color: '#fff', fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
              placeholder="Что сделали, что заметили..."
              value={diaryText}
              onChange={e => setDiaryText(e.target.value)}
            />
            <button className="btn-primary btn-full" style={{ marginTop: 12 }} onClick={handleDiarySave} disabled={diarySaving || !diaryText.trim()}>
              {diarySaving ? 'Сохраняю...' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}
      {editEntry && (
        <CropEditModal
          entry={editEntry}
          gardenObjects={data.gardenObjects}
          plan={plan}
          onSave={(e: CropEntry) => { onUpdateEntry(e.id, e); setEditEntry(null) }}
          onDelete={() => { onDeleteEntry(editEntry.id); setEditEntry(null) }}
          onClose={() => setEditEntry(null)}
          onAddDiary={(cropId: string, varietyName?: string) => {
            setDiaryCropId(cropId)
            setDiaryVariety(varietyName ?? '')
            setDiaryText('')
            setDiaryOp('')
            setDiaryKind('observation')
            setDiaryOpDetail('')
            setEditEntry(null)
            setShowDiaryAdd(true)
          }}
          onAskAi={(cropId: string, varietyName?: string) => {
            const entry = data.cropEntries.find(item => item.id === cropId)
            if (!entry) return
            const adviceQuestion = buildAdviceQuestion(entry, varietyName)
            setEditEntry(null)
            onAskAi(adviceQuestion.aiQuestion, adviceQuestion.displayQuestion)
          }}
        />
      )}

      {/* Модалка добавления культуры */}
      {showAddCrop && !pickerCropId && (
        <div className="modal-overlay" onClick={() => setShowAddCrop(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">Добавить культуру</span>
              <button className="modal-close" onClick={() => setShowAddCrop(false)}>✕</button>
            </div>
            {cropLimitReached ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                  Лимит культур достигнут
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 16 }}>
                  {plan === 'free'
                    ? `Бесплатно — ${cropLimit} культур. Перейдите на Базовую (15 культур)`
                    : `Базовая — ${cropLimit} культур. Перейдите на Про для неограниченного количества`}
                </div>
                <button className="btn-upgrade" onClick={() => { setShowAddCrop(false); onUpgrade?.() }}>Перейти к тарифам →</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', textAlign: 'center', marginBottom: 10 }}>
                  {data.cropEntries.length} из {cropLimit === 999 ? '∞' : cropLimit} культур
                </div>
                <div className="cat-tabs">
                  {CROP_CATEGORIES.map((cat, i) => (
                    <button key={cat.id} className={`cat-tab ${activeCat === i ? 'active' : ''}`}
                      onClick={() => setActiveCat(i)}>{cat.label}</button>
                  ))}
                </div>
                <div className="add-crop-grid">
                  {CROP_CATEGORIES[activeCat].crops.filter(c => !existingIds.includes(c.id)).map(c => (
                    <button key={c.id} className="ob-crop-card" onClick={() => setPickerCropId(c.id)}>
                      <div className="ob-crop-icon">{c.icon}</div>
                      <div className="ob-crop-name">{c.name}</div>
                    </button>
                  ))}
                  {CROP_CATEGORIES[activeCat].crops.every(c => existingIds.includes(c.id)) && (
                    <div className="empty-hint" style={{ gridColumn: '1/-1' }}>Все культуры этой категории добавлены</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {pickerCropId && !cropLimitReached && (
        <CropVarietyPickerModal
          cropId={pickerCropId}
          plan={plan}
          onConfirm={(varieties: CropVariety[]) => {
            const loc = data.gardenObjects[0]?.uid ?? 'open'
            const newEntry: CropEntry = { id: pickerCropId, location: loc, sowDate: '', sowMethod: '', status: 'planned', priority: 'extra', notifs: getOps(pickerCropId).map(o => o.id), varieties }
            onAddEntry(newEntry)
            setPickerCropId(null)
            setShowAddCrop(false)
            setTimeout(() => setEditEntry(newEntry), 50)
          }}
          onClose={() => { setPickerCropId(null) }}
        />
      )}

      {/* Погода */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, padding: '8px 16px 4px' }}>
        <button className={`ob-chip ${plantsTab === 'plants' ? 'selected' : ''}`} style={{ whiteSpace: 'normal', lineHeight: 1.15, minHeight: 40, width: '100%', textAlign: 'center', justifyContent: 'center' }} onClick={() => setPlantsTab('plants')}>🌱 Огород</button>
        <button className={`ob-chip ${plantsTab === 'fertilizers' ? 'selected' : ''}`} style={{ whiteSpace: 'normal', lineHeight: 1.15, minHeight: 40, width: '100%', textAlign: 'center', justifyContent: 'center' }} onClick={() => setPlantsTab('fertilizers')}>🧴 Удобрения</button>
        <button className={`ob-chip ${plantsTab === 'compat' ? 'selected' : ''}`} style={{ whiteSpace: 'normal', lineHeight: 1.15, minHeight: 40, width: '100%', textAlign: 'center', justifyContent: 'center' }} onClick={() => setPlantsTab('compat')}>🤝 Совместимость</button>
        <button className={`ob-chip ${plantsTab === 'disease' ? 'selected' : ''}`} style={{ whiteSpace: 'normal', lineHeight: 1.15, minHeight: 40, width: '100%', textAlign: 'center', justifyContent: 'center' }} onClick={() => setPlantsTab('disease')}>⚠️ Болезни</button>
      </div>

      {plantsTab !== 'disease' && data.cropEntries.some(entry => entry.status === 'planted') && (
        <div style={{ padding: '8px 16px 6px' }}>
          <div style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.22)', borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#dcfce7', marginBottom: 4 }}>
              Новая бесплатная диагностика по симптомам
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: '#bbf7d0', marginBottom: 10 }}>
              Во вкладке `Болезни` можно быстро сузить причину по кнопкам: пятна, налёт, вялость, вредители, стресс по влаге и другие сценарии для всех ваших культур.
            </div>
            <button className="btn-export" onClick={() => setPlantsTab('disease')}>
              Открыть диагностику
            </button>
          </div>
        </div>
      )}

      {plantsTab === 'compat' && <CompatScreen cropEntries={data.cropEntries} />}
      {plantsTab === 'disease' && <DiseaseScreen data={data} vkUserId={vkUserId} />}
      {plantsTab === 'fertilizers' && (
        <div style={{ padding: '12px 16px 24px' }}>
          <div className="section-title">Мои удобрения</div>
          <div className="weather-card" style={{ padding: 14 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <input
                className="ob-city-input"
                style={{ fontSize: 15 }}
                placeholder="Название удобрения"
                value={fertilizerDraft.name}
                onChange={e => setFertilizerDraft(prev => ({ ...prev, name: e.target.value }))}
              />
              <input
                className="ob-city-input"
                style={{ fontSize: 15 }}
                placeholder="Фирма"
                value={fertilizerDraft.brand ?? ''}
                onChange={e => setFertilizerDraft(prev => ({ ...prev, brand: e.target.value }))}
              />
              <input
                className="ob-city-input"
                style={{ fontSize: 15 }}
                placeholder="Состав"
                value={fertilizerDraft.composition ?? ''}
                onChange={e => setFertilizerDraft(prev => ({ ...prev, composition: e.target.value }))}
              />
              <textarea
                style={{ width: '100%', minHeight: 72, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, color: '#fff', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
                placeholder="Пометка: для рассады, для томатов, осторожно по дозировке..."
                value={fertilizerDraft.note ?? ''}
                onChange={e => setFertilizerDraft(prev => ({ ...prev, note: e.target.value }))}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ flex: 1 }} onClick={saveFertilizer}>
                  {editingFertilizerId ? 'Сохранить удобрение' : 'Добавить удобрение'}
                </button>
                {editingFertilizerId && (
                  <button className="btn-secondary" style={{ flex: 1 }} onClick={resetFertilizerDraft}>
                    Отмена
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 18 }}>В наличии</div>
          {(data.fertilizers?.length ?? 0) === 0 ? (
            <div className="empty-hint">Добавь удобрения, чтобы советы агронома учитывали, что у тебя уже есть под рукой.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {(data.fertilizers ?? []).map(item => (
                <div key={item.id} className="weather-card" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{item.name}</div>
                      {item.brand && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 4 }}>{item.brand}</div>}
                      {item.composition && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', marginTop: 6 }}>{item.composition}</div>}
                      {item.note && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.58)', marginTop: 8 }}>{item.note}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="ob-chip selected" onClick={() => startEditFertilizer(item)}>Изменить</button>
                      <button className="ob-chip" onClick={() => removeFertilizer(item.id)}>Удалить</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {plantsTab === 'plants' && <div>
      <div className="weather-card">
        {weather.loading ? (
          <div className="weather-loading">Загружаем погоду...</div>
        ) : weather.error ? (
          <div className="weather-loading">{weather.error}</div>
        ) : (
          <div className="weather-row">
            <div className="weather-main">
              <span className="weather-icon">{weather.icon}</span>
              <div>
                <div className="weather-temp">{weather.temp > 0 ? '+' : ''}{weather.temp}°C</div>
                <div className="weather-desc">{weather.desc}</div>
                <div className="weather-loc">{data.city}</div>
              </div>
            </div>
            <div className="weather-extra">
              <div className="weather-detail">💧 {weather.humidity}%</div>
              <div className="weather-detail">💨 {weather.wind} м/с</div>
            </div>
          </div>
        )}
        {!weather.loading && !weather.error && risks.length > 0 && (
          <div className="weather-risks" style={{ marginTop: 10 }}>
            {risks.map((r, i) => <div key={i} className={`risk-badge risk-${r.type}`}>{r.text}</div>)}
          </div>
        )}
      </div>

      {/* Сегодня сделать */}
      {data.cropEntries.filter(e => e.status === 'planted').length > 0 && (
        <>
          <div className="section-title" style={{ padding: '0 16px', marginTop: 16 }}>📅 Сегодня сделать</div>
          <div className="section-helper" style={{ padding: '0 16px' }}>
            Нажмите на карточку культуры, чтобы открыть её подробнее, или на кнопку справа, чтобы сразу отметить дело в дневнике.
          </div>
          <div className="ops-list">
            {data.cropEntries.filter(e => e.status === 'planted').slice(0, 5).map(entry => {
              const crop = CROPS.find(c => c.id === entry.id)
              const primaryOp = getPrimaryOp(entry.id)
              const taskKey = `${entry.id}:${primaryOp.id}`
              const taskDone = completedTodayTaskKeys.includes(taskKey)
              if (!crop) return null
              return (
                <div key={entry.id} className={`op-row ${taskDone ? 'is-complete' : ''}`} onClick={() => setEditEntry(entry)}>
                  <span className="op-icon">{crop.icon}</span>
                  <div className="op-info">
                    <div className="op-name">
                      {crop.name}
                      {entry.varieties.filter(v => v.name.trim()).length > 0 ? ` · ${getVarietySummary(entry)}` : ''}
                    </div>
                    <div className="op-action">{taskDone ? 'Отмечено в дневнике сегодня' : getFirstOp(entry.id)}</div>
                  </div>
                  <button
                    className={`btn-done-sm ${taskDone ? 'done' : ''}`}
                    disabled={taskDone || completingTodayTaskKey === taskKey}
                    aria-label={taskDone ? `Задача для ${crop.name} уже отмечена` : `Отметить дело для ${crop.name}`}
                    onClick={e => {
                      e.stopPropagation()
                      onCompleteTodayTask?.(entry)
                    }}
                  >
                    {taskDone ? 'Готово' : completingTodayTaskKey === taskKey ? '...' : 'Отметить'}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Секции по объектам */}
      {data.gardenObjects.map(obj => {
        const opt = GROW_OPTIONS.find(o => o.id === obj.type)!
        const objCrops = data.cropEntries.filter(e => e.location === obj.uid)
        const soilLabel = SOIL_LABELS[obj.soilType] || SOIL_LABELS[obj.substrate] || ''
        return (
          <div key={obj.uid} className="garden-section">
            <div className="garden-section-header">
              <span className="garden-section-icon">{opt.icon}</span>
              <div>
                <div className="garden-section-title">{opt.title}</div>
                {soilLabel && <div className="garden-section-sub">{soilLabel}</div>}
              </div>
              <span className="garden-section-count">{objCrops.length} культур</span>
            </div>
            <div className="crops-dashboard">
              {objCrops.map(entry => {
                const crop = CROPS.find(c => c.id === entry.id)
                if (!crop) return null
                const days = daysSince(getProgressStartDate(entry))
                const totalDays = getTotalMaturityDays(entry)
                const perennial = isPerennial(entry.id)
                const stage = perennial
                  ? '🌿 Многолетник'
                  : entry.status === 'planted'
                    ? getCropStage(days, totalDays, { afterEmergence: Boolean(entry.emergenceDate) })
                    : '📋 Планируется'
                const pct = !perennial && days >= 0 && entry.status === 'planted' ? Math.min(100, (days / totalDays) * 100) : 0
                const daysLeft = !perennial && entry.status === 'planted' && days >= 0 ? Math.max(0, totalDays - days) : null
                const namedVarieties = entry.varieties.filter(v => v.name.trim())
                const varietyNotes = getVarietyNotes(entry)
                const timingSourceLabel = getTimingSourceLabel(entry)
                return (
                  <button key={entry.id} className="crop-dash-card" onClick={() => { setShowAddCrop(false); setPickerCropId(null); setEditEntry(entry) }}>
                    <div className="crop-dash-top">
                      <span className="crop-dash-icon">{crop.icon}</span>
                    </div>
                    <div className="crop-dash-name">{crop.name}</div>
                    {namedVarieties.length > 0 && (
                      <div className="crop-dash-variety">
                        {namedVarieties.length === 1 ? namedVarieties[0].name : `${namedVarieties.length} сорта: ${getVarietySummary(entry)}`}
                      </div>
                    )}
                    {varietyNotes.length > 0 && (
                      <div className="crop-dash-variety" style={{ marginTop: 4, fontStyle: 'normal', color: 'rgba(255,255,255,.62)' }}>
                        {varietyNotes[0]}
                        {varietyNotes.length > 1 ? ` +${varietyNotes.length - 1}` : ''}
                      </div>
                    )}
                    <div className={`crop-dash-stage ${entry.status === 'planned' ? 'planned' : ''}`}>{stage}</div>
                    {daysLeft !== null && <div className="crop-dash-days">{daysLeft === 0 ? '🎉 Готов!' : `${daysLeft}д`}</div>}
                    {entry.status === 'planted' && !perennial && (
                      <div className="crop-dash-timing">
                        {timingSourceLabel} · {totalDays}д
                      </div>
                    )}
                    {!perennial && <div className="crop-dash-bar"><div className="crop-dash-fill" style={{ width: `${pct}%` }} /></div>}
                    {namedVarieties.length > 1 && entry.status === 'planted' && entry.sowDate && !perennial && (
                      <div className="crop-variety-bars">
                        {namedVarieties.map((v, vi) => {
                          const vDays = v.days ?? entry.maturityDays ?? totalDays
                          const vPct = Math.min(100, (days / vDays) * 100)
                          const vLeft = Math.max(0, vDays - days)
                          return (
                            <div key={vi} className="crop-variety-bar-row">
                              <span className="crop-variety-bar-name">{v.name}</span>
                              <div className="crop-variety-bar-track"><div className="crop-variety-bar-fill" style={{ width: `${vPct}%` }} /></div>
                              <span className="crop-variety-bar-days">{vLeft === 0 ? '✓' : `${vLeft}д`}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </button>
                )
              })}
              <button className="crop-dash-add" onClick={() => {
                if (cropLimitReached) { setShowAddCrop(true) } else { setShowAddCrop(true) }
              }} aria-label={cropLimitReached ? 'Лимит культур достигнут, посмотреть тарифы' : 'Добавить новую культуру'} title={cropLimitReached ? 'Лимит культур достигнут' : 'Добавить культуру'}>
                <div style={{ fontSize: cropLimitReached ? 16 : 24 }}>{cropLimitReached ? '🔒' : '＋'}</div>
                <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{cropLimitReached ? `${cropLimit} макс` : 'Добавить'}</div>
              </button>
            </div>
          </div>
        )
      })}

      {data.gardenObjects.length === 0 && (
        <div className="plants-no-objects">
          <div className="plants-no-objects-icon">🏡</div>
          <div className="plants-no-objects-title">Сначала добавьте место выращивания</div>
          <div className="plants-no-objects-sub">Грядка, теплица, парник, ягодник — выберите что есть у вас, а потом разместите туда культуры.</div>
          <div className="plants-no-objects-grid">
            {GROW_OPTIONS.slice(0, 4).map(o => (
              <button
                key={o.id}
                className="plants-no-objects-btn"
                disabled={false}
                onClick={() => {
                  if (data.gardenObjects.length >= OBJECT_LIMITS[plan]) {
                    onUpgrade?.()
                    return
                  }
                  const count = data.gardenObjects.filter(x => x.type === o.id).length
                  onUpdateData({ gardenObjects: [...data.gardenObjects, makeObject(o.id, buildObjectName(o.id, count + 1))] })
                }}
              >
                <span>{o.icon}</span>
                <span>{o.title}</span>
              </button>
            ))}
          </div>
          <div className="plants-no-objects-more">
            Клумба, ягодник и горшки — в разделе «Профиль → Объекты»
          </div>
        </div>
      )}
      </div>}
    </div>
  )
}
