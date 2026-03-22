import { useState, useEffect } from 'react'
import type { CropEntry, DiaryEntry } from '../../utils/types'
import { CROPS, buildDiaryText, getOps, parseDiaryText } from '../../utils/constants'
import { loadDiary, addDiaryEntry } from '../../supabase'

export function DiaryScreen({ vkUserId, cropEntries }: { vkUserId: number; cropEntries: CropEntry[] }) {
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [filterCrop, setFilterCrop] = useState<string | null>(null)
  const [loadedKey, setLoadedKey] = useState<string>('')
  const [showAdd, setShowAdd] = useState(false)
  const [addCropId, setAddCropId] = useState<string>('')
  const [addVarietyName, setAddVarietyName] = useState<string>('')
  const [addOp, setAddOp] = useState<string>('')
  const [addText, setAddText] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const requestKey = `${vkUserId}:${filterCrop ?? 'all'}`
  const loading = loadedKey !== requestKey

  useEffect(() => {
    loadDiary(vkUserId, filterCrop ?? undefined).then(d => {
      setEntries(d as DiaryEntry[])
      setLoadedKey(requestKey)
    })
  }, [filterCrop, requestKey, vkUserId])

  function closeAddModal() {
    setAddText('')
    setAddOp('')
    setAddCropId('')
    setAddVarietyName('')
    setShowAdd(false)
    setSaving(false)
  }

  async function handleAdd() {
    if (!addText.trim()) return
    setSaving(true)
    await addDiaryEntry(vkUserId, addCropId || null, addOp || null, buildDiaryText(addText, addVarietyName))
    closeAddModal()
    const diary = await loadDiary(vkUserId, filterCrop ?? undefined)
    setEntries(diary as DiaryEntry[])
    setLoadedKey(requestKey)
  }

  const plantedCrops = cropEntries.filter(e => e.status === 'planted')
  const activeCropEntry = plantedCrops.find(e => e.id === addCropId)
  const availableVarieties = activeCropEntry?.varieties.filter(v => v.name.trim()) ?? []

  return (
    <div style={{ padding: '0 0 80px' }}>
      {/* Фильтр по культуре */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto' }}>
        <button className={`ob-chip ${!filterCrop ? 'selected' : ''}`} onClick={() => setFilterCrop(null)}>Все</button>
        {plantedCrops.map(e => {
          const crop = CROPS.find(c => c.id === e.id)
          return (
            <button key={e.id} className={`ob-chip ${filterCrop === e.id ? 'selected' : ''}`}
              onClick={() => setFilterCrop(filterCrop === e.id ? null : e.id)}>
              {crop?.icon} {crop?.name}
            </button>
          )
        })}
      </div>

      {/* Кнопка добавить */}
      <div style={{ padding: '0 16px 12px' }}>
        <button className="btn-chat" onClick={() => setShowAdd(true)}>📝 Новая запись</button>
      </div>

      {/* Модалка добавления */}
      {showAdd && (
        <div className="modal-overlay" onClick={closeAddModal}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-title">📝 Запись в дневник</span>
              <button className="modal-close" onClick={closeAddModal}>✕</button>
            </div>
            <div className="modal-section-label">Культура</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              <button className={`ob-chip ${!addCropId ? 'selected' : ''}`} onClick={() => { setAddCropId(''); setAddOp(''); setAddVarietyName('') }}>Общее</button>
              {plantedCrops.map(e => {
                const crop = CROPS.find(c => c.id === e.id)
                return (
                  <button key={e.id} className={`ob-chip ${addCropId === e.id ? 'selected' : ''}`}
                    onClick={() => { setAddCropId(e.id); setAddOp(''); setAddVarietyName('') }}>
                    {crop?.icon} {crop?.name}
                  </button>
                )
              })}
            </div>
            {addCropId && (
              <>
                {availableVarieties.length > 0 && (
                  <>
                    <div className="modal-section-label">Сорт</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {availableVarieties.map(v => (
                        <button
                          key={v.name}
                          className={`ob-chip ${addVarietyName === v.name ? 'selected' : ''}`}
                          onClick={() => setAddVarietyName(addVarietyName === v.name ? '' : v.name)}
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="modal-section-label">Операция</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {getOps(addCropId).map(op => (
                    <button key={op.id} className={`ob-chip ${addOp === op.id ? 'selected' : ''}`}
                      onClick={() => setAddOp(addOp === op.id ? '' : op.id)}>{op.label}</button>
                  ))}
                </div>
              </>
            )}
            <div className="modal-section-label">Заметка</div>
            <textarea
              style={{ width: '100%', minHeight: 80, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 10, color: '#fff', fontSize: 14, resize: 'none', boxSizing: 'border-box' }}
              placeholder="Что сделали, что заметили..."
              value={addText}
              onChange={e => setAddText(e.target.value)}
            />
            <button className="btn-primary btn-full" style={{ marginTop: 12 }} onClick={handleAdd} disabled={saving || !addText.trim()}>
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {/* Лента записей */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>Загрузка...</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#666', padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📖</div>
          <div>Записей пока нет</div>
        </div>
      ) : (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(entry => {
            const crop = entry.crop_id ? CROPS.find(c => c.id === entry.crop_id) : null
            const op = entry.operation && entry.crop_id ? getOps(entry.crop_id).find(o => o.id === entry.operation) : null
            const date = new Date(entry.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            const parsed = parseDiaryText(entry.text)
            return (
              <div key={entry.id} className="diary-entry">
                <div className="diary-entry-header">
                  <span className="diary-crop">{crop ? `${crop.icon} ${crop.name}` : '🌱 Огород'}</span>
                  {parsed.varietyName && <span className="diary-variety">Сорт: {parsed.varietyName}</span>}
                  {op && <span className="diary-op">{op.label}</span>}
                  <span className="diary-date">{date}</span>
                </div>
                <div className="diary-text">{parsed.text}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
