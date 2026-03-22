import { useState } from 'react'
import type { CropEntry } from '../../utils/types'
import { CROPS, CROP_COMPAT } from '../../utils/constants'

export function CompatScreen({ cropEntries }: { cropEntries: CropEntry[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const planted = cropEntries.filter(e => e.status === 'planted')
  const myIds = planted.map(e => e.id)

  const compat = selected ? CROP_COMPAT[selected] : null
  const goodInGarden = compat ? myIds.filter(id => id !== selected && compat.good.includes(id)) : []
  const badInGarden = compat ? myIds.filter(id => id !== selected && compat.bad.includes(id)) : []
  const goodOther = compat ? compat.good.filter(id => !myIds.includes(id)) : []

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        Выберите культуру чтобы увидеть с чем она дружит
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {planted.map(e => {
          const crop = CROPS.find(c => c.id === e.id)
          return (
            <button key={e.id} className={`ob-chip ${selected === e.id ? 'selected' : ''}`}
              onClick={() => setSelected(selected === e.id ? null : e.id)}>
              {crop?.icon} {crop?.name}
            </button>
          )
        })}
      </div>

      {selected && compat && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {goodInGarden.length > 0 && (
            <div className="compat-card compat-good">
              <div className="compat-title">✅ Хорошие соседи (уже в огороде)</div>
              <div className="compat-crops">
                {goodInGarden.map(id => {
                  const c = CROPS.find(x => x.id === id)
                  return <span key={id} className="compat-tag good">{c?.icon} {c?.name}</span>
                })}
              </div>
            </div>
          )}
          {badInGarden.length > 0 && (
            <div className="compat-card compat-bad">
              <div className="compat-title">⚠️ Плохие соседи (уже в огороде)</div>
              <div className="compat-crops">
                {badInGarden.map(id => {
                  const c = CROPS.find(x => x.id === id)
                  return <span key={id} className="compat-tag bad">{c?.icon} {c?.name}</span>
                })}
              </div>
              <div style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>Попробуйте разместить их подальше друг от друга</div>
            </div>
          )}
          {goodOther.length > 0 && (
            <div className="compat-card" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="compat-title" style={{ color: '#94a3b8' }}>💡 Хорошие соседи (можно добавить)</div>
              <div className="compat-crops">
                {goodOther.map(id => {
                  const c = CROPS.find(x => x.id === id)
                  return <span key={id} className="compat-tag neutral">{c?.icon} {c?.name}</span>
                })}
              </div>
            </div>
          )}
          {goodInGarden.length === 0 && badInGarden.length === 0 && (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 16, fontSize: 13 }}>
              Среди ваших культур нет явных друзей или врагов для этой культуры
            </div>
          )}
        </div>
      )}
      {planted.length === 0 && (
        <div style={{ textAlign: 'center', color: '#555', padding: 24, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🌱</div>
          Сначала посадите культуры — тогда увидите совместимость
        </div>
      )}
    </div>
  )
}
