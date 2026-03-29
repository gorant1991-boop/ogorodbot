import { useState } from 'react'
import type { CropEntry, GardenObject, Plan } from '../../utils/types'
import { CROPS, CROP_VARIETIES, GROW_OPTIONS, getOps, isPerennial } from '../../utils/constants'

export function CropEditModal({ entry, gardenObjects, onSave, onDelete, onClose, onAddDiary, onAskAi, plan = 'free' as Plan }: {
  entry: CropEntry
  gardenObjects: GardenObject[]
  onSave: (e: CropEntry) => void
  onDelete: () => void
  onClose: () => void
  onAddDiary: (cropId: string, varietyName?: string) => void
  onAskAi: (cropId: string, varietyName?: string) => void
  plan?: Plan
}) {
  const [e, setE] = useState<CropEntry>({ ...entry, varieties: entry.varieties.map(v => ({ ...v })) })
  const crop = CROPS.find(c => c.id === e.id)!
  const upd = (patch: Partial<CropEntry>) => setE(prev => ({ ...prev, ...patch }))
  const suggestedVarieties = CROP_VARIETIES[e.id] ?? []
  const addedNames = e.varieties.map(v => v.name)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const perennial = isPerennial(e.id)
  const locObj = gardenObjects.find(o => o.uid === e.location)
  const isEnclosed = locObj?.type === 'greenhouse' || locObj?.type === 'hotbed'
  const ops = getOps(e.id)
  const opList = isEnclosed ? [...ops, { id: 'ventilation', label: '🏠 Проветривание' }] : ops

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={ev => ev.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <span className="modal-icon">{crop.icon}</span>
          <span className="modal-title">{crop.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-section-label">Статус</div>
        <div className="modal-chips">
          <button className={`ob-chip ${e.status === 'planned' ? 'selected' : ''}`}
            onClick={() => upd({ status: 'planned' })}>📋 Готовлюсь</button>
          <button className={`ob-chip ${e.status === 'planted' ? 'selected' : ''}`}
            onClick={() => upd({ status: 'planted' })}>✅ Уже посадил</button>
        </div>

        {gardenObjects.length > 0 && (
          <>
            <div className="modal-section-label">Место</div>
            <div className="modal-chips">
              {gardenObjects.map(obj => {
                const opt = GROW_OPTIONS.find(o => o.id === obj.type)!
                return (
                  <button key={obj.uid} className={`ob-chip ${e.location === obj.uid ? 'selected' : ''}`}
                    onClick={() => upd({ location: obj.uid })}>
                    {opt.icon} {opt.title}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Дата — для многолетних добавляем год */}
        <div className="modal-section-label">{perennial ? 'Дата посадки' : 'Дата посева/высадки'}</div>
        <div className="ob-sow-row" style={{ marginBottom: perennial ? 8 : 12 }}>
          <div className="ob-dim-field" style={{ flex: 2 }}>
            <input type="date" value={e.sowDate} onChange={ev => upd({ sowDate: ev.target.value })} />
          </div>
          {!perennial && (
            <div style={{ flex: 3, display: 'flex', gap: 6 }}>
              <button className={`ob-chip ${e.sowMethod === 'seeds' ? 'selected' : ''}`}
                style={{ flex: 1 }} onClick={() => upd({ sowMethod: 'seeds' })}>🌱 Семена</button>
              <button className={`ob-chip ${e.sowMethod === 'seedling' ? 'selected' : ''}`}
                style={{ flex: 1 }} onClick={() => upd({ sowMethod: 'seedling' })}>🪴 Рассада</button>
            </div>
          )}
        </div>
        {e.sowMethod === 'seedling' && (
          <div className="ob-hint" style={{ marginTop: -8, marginBottom: 8 }}>
            💡 Для рассады укажите дату посева семян — так прогресс созревания будет точнее
          </div>
        )}
        {perennial && (
          <div className="ob-dim-field" style={{ marginBottom: 12 }}>
            <label>Год посадки (если давно, необязательно)</label>
            <input type="number" min="1990" max="2025"
              value={e.plantYear ?? ''}
              onChange={ev => upd({ plantYear: ev.target.value ? parseInt(ev.target.value) : undefined })}
              placeholder="Например: 2015" />
          </div>
        )}

        <div className="modal-section-label">Сорта</div>
        {e.varieties.map((v, vi) => (
          <div key={vi} className="variety-entry">
            <div className="ob-variety-row">
              <input className="ob-variety-input" value={v.name} placeholder={`Сорт ${vi + 1}`}
                onChange={ev => {
                  const vars = [...e.varieties]; vars[vi] = { ...vars[vi], name: ev.target.value }; upd({ varieties: vars })
                }} />
              {v.days && <span className="variety-days-badge">{v.days}д</span>}
              <button className="ob-variety-del" onClick={() => upd({ varieties: e.varieties.filter((_, i) => i !== vi) })}>✕</button>
            </div>
            <div className="variety-note-row">
              <input
                className="ob-variety-input variety-note-input"
                value={v.note ?? ''}
                placeholder="Пометка по сорту: подвязан, маленький, отстаёт, уже цветёт..."
                onChange={ev => {
                  const vars = [...e.varieties]; vars[vi] = { ...vars[vi], note: ev.target.value }; upd({ varieties: vars })
                }}
              />
              {v.name.trim() && (
                <button className="variety-quick-btn" onClick={() => onAddDiary(e.id, v.name.trim())}>
                  📝 В дневник
                </button>
              )}
            </div>
          </div>
        ))}
        {suggestedVarieties.filter(s => !addedNames.includes(s.name)).length > 0 && (
          <>
            <div className="variety-suggest-label">Популярные сорта:</div>
            <div className="variety-suggest-list">
              {suggestedVarieties.filter(s => !addedNames.includes(s.name)).map(s => (
                <button key={s.name} className="variety-suggest-btn"
                  onClick={() => upd({ varieties: [...e.varieties, { name: s.name, days: s.days }] })}>
                  <span className="variety-suggest-name">{s.name}</span>
                  <span className="variety-suggest-meta">{s.days}д{s.desc ? ` · ${s.desc}` : ''}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {plan === 'pro' ? (
          <button className="ob-add-variety" onClick={() => upd({ varieties: [...e.varieties, { name: '' }] })}>+ Свой сорт</button>
        ) : (
          <div className="empty-hint" style={{ marginTop: 8, fontSize: 13 }}>
            🔒 Свои сорта — только в тарифе <strong>Про</strong>
          </div>
        )}
        {e.varieties.some(v => v.name.trim()) && (
          <>
            <div className="variety-suggest-label">Запись по сорту:</div>
            <div className="variety-suggest-list">
              {e.varieties.filter(v => v.name.trim()).map(v => (
                <button
                  key={v.name}
                  className="variety-suggest-btn"
                  onClick={() => onAddDiary(e.id, v.name.trim())}
                >
                  <span className="variety-suggest-name">📝 {v.name.trim()}</span>
                  <span className="variety-suggest-meta">Запись в дневник</span>
                </button>
              ))}
            </div>
          </>
        )}
        {e.varieties.some(v => v.name.trim()) && (
          <>
            <div className="variety-suggest-label">Совет от AI по сорту:</div>
            <div className="variety-suggest-list">
              {e.varieties.filter(v => v.name.trim()).map(v => (
                <button
                  key={`ai-${v.name}`}
                  className="variety-suggest-btn"
                  onClick={() => onAskAi(e.id, v.name.trim())}
                >
                  <span className="variety-suggest-name">🤖 {v.name.trim()}</span>
                  <span className="variety-suggest-meta">Получить совет</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Уведомления */}
        <div className="modal-section-label" style={{ marginTop: 16 }}>Уведомления</div>
        <div className="ob-notif-toggles" style={{ marginBottom: 12 }}>
          {opList.map(op => {
            const isOn = e.notifs.includes(op.id)
            const isCritical = op.id === 'disease'
            return (
              <div key={op.id} className="ob-notif-toggle-row">
                <span className="ob-notif-label">{op.label}</span>
                <button className={`ob-toggle ${isOn ? 'on' : ''} ${isCritical ? 'locked' : ''}`}
                  onClick={() => {
                    if (isCritical) return
                    upd({ notifs: isOn ? e.notifs.filter(x => x !== op.id) : [...e.notifs, op.id] })
                  }} />
              </div>
            )
          })}
        </div>
        <div className="ob-hint">⚠️ Болезни нельзя отключить</div>

        <button className="btn-primary btn-full" style={{ marginTop: 16 }} onClick={() => onSave(e)}>Сохранить</button>
        <button className="btn-diary-add" style={{ marginTop: 8 }} onClick={() => onAddDiary(e.id)}>📝 Общая запись в дневник</button>
        <button className="btn-diary-add" style={{ marginTop: 8 }} onClick={() => onAskAi(e.id)}>🤖 Совет от AI по культуре</button>

        {showDeleteConfirm ? (
          <div className="delete-confirm">
            <span>Удалить из огорода?</span>
            <button className="btn-delete-yes" onClick={() => { onDelete(); onClose() }}>Да, удалить</button>
            <button className="btn-delete-no" onClick={() => setShowDeleteConfirm(false)}>Отмена</button>
          </div>
        ) : (
          <button className="btn-delete-crop" onClick={() => setShowDeleteConfirm(true)}>🗑️ Удалить из огорода</button>
        )}
      </div>
    </div>
  )
}
