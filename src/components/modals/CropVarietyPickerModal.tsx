import { useState } from 'react'
import type { CropVariety, Plan } from '../../utils/types'
import { CROPS, CROP_VARIETIES } from '../../utils/constants'

export function CropVarietyPickerModal({ cropId, onConfirm, onClose, plan = 'free' }: {
  cropId: string
  onConfirm: (varieties: CropVariety[]) => void
  onClose: () => void
  plan?: Plan
}) {
  const crop = CROPS.find(c => c.id === cropId)!
  const suggested = CROP_VARIETIES[cropId] ?? []
  const [selected, setSelected] = useState<CropVariety[]>([])
  const [customName, setCustomName] = useState('')
  const [customDays, setCustomDays] = useState('')

  const toggle = (v: CropVariety) => {
    setSelected(prev => prev.some(p => p.name === v.name)
      ? prev.filter(p => p.name !== v.name)
      : [...prev, { name: v.name, days: v.days, desc: v.desc }]
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <span className="modal-icon">{crop.icon}</span>
          <span className="modal-title">{crop.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {suggested.length > 0 ? (
          <>
            <div className="variety-suggest-label">Выберите сорта (или пропустите):</div>
            <div className="variety-suggest-list">
              {suggested.map(s => {
                const isSel = selected.some(p => p.name === s.name)
                return (
                  <button key={s.name} className={`variety-suggest-btn ${isSel ? 'selected' : ''}`} onClick={() => toggle(s)}>
                    <span className="variety-suggest-name">{s.name}</span>
                    <span className="variety-suggest-meta">{s.days}д · {s.desc}</span>
                    {isSel && <span style={{ color: '#4ade80', fontWeight: 800, flexShrink: 0 }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <div className="empty-hint">Для этой культуры пока нет списка сортов</div>
        )}

        {plan === 'pro' ? (
          <>
            <div className="variety-suggest-label" style={{ marginTop: 12 }}>Свой сорт:</div>
            <div className="ob-variety-row">
              <input className="ob-variety-input" value={customName}
                placeholder="Название сорта" onChange={e => setCustomName(e.target.value)} />
              <input className="ob-variety-input" value={customDays}
                placeholder="Дней" type="number" min="1" max="365"
                style={{ width: 70, flexShrink: 0 }}
                onChange={e => setCustomDays(e.target.value)} />
              <button className="profile-edit-save" onClick={() => {
                if (customName.trim()) {
                  const days = customDays ? parseInt(customDays) : undefined
                  setSelected(prev => [...prev, { name: customName.trim(), ...(days ? { days } : {}) }])
                  setCustomName('')
                  setCustomDays('')
                }
              }}>+</button>
            </div>
          </>
        ) : (
          <div className="empty-hint" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            🔒 Свои сорта — только в тарифе <strong>Про</strong>
          </div>
        )}
        {selected.filter(v => !suggested.some(s => s.name === v.name)).map((v, i) => (
          <div key={i} className="ob-variety-row">
            <span className="ob-variety-input" style={{ display: 'flex', alignItems: 'center' }}>
              {v.name}{v.days ? ` · ${v.days}д` : ''}
            </span>
            <button className="ob-variety-del" onClick={() => setSelected(prev => prev.filter(p => p.name !== v.name))}>✕</button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => { onConfirm(selected); onClose() }}>
            {selected.length > 0 ? `Добавить с ${selected.length} сорт(ами)` : 'Добавить без сорта'}
          </button>
        </div>
      </div>
    </div>
  )
}
