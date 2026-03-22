import { useState, useEffect } from 'react'
import type { OnboardingData, Season } from '../../utils/types'
import { CROPS } from '../../utils/constants'
import { saveSeasonSnapshot, loadSeasons } from '../../supabase'

export function SeasonsScreen({ vkUserId, currentData, currentYear }: {
  vkUserId: number
  currentData: OnboardingData
  currentYear: number
}) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedYear, setExpandedYear] = useState<number | null>(null)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)

  useEffect(() => {
    loadSeasons(vkUserId).then(d => { setSeasons(d as Season[]); setLoading(false) })
  }, [vkUserId])

  async function handleSaveSeason() {
    setSaving(true)
    const planted = currentData.cropEntries.filter(e => e.status === 'planted')
    const cropNames = planted.map(e => CROPS.find(c => c.id === e.id)?.name).filter(Boolean).join(', ')
    const summary = `Сезон ${currentYear}: посажено ${planted.length} культур (${cropNames || 'нет'}). Объектов: ${currentData.gardenObjects.length}.`
    await saveSeasonSnapshot(vkUserId, currentYear, currentData, summary)
    const updated = await loadSeasons(vkUserId)
    setSeasons(updated as Season[])
    setSaving(false)
    setShowSaveConfirm(false)
  }

  const currentSeason = seasons.find(s => s.year === currentYear)

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {/* Сохранить текущий сезон */}
      <div className="season-save-card">
        <div className="season-save-title">🌱 Сезон {currentYear}</div>
        <div className="season-save-sub">
          {currentSeason
            ? `Сохранён ${new Date(currentSeason.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
            : 'Сохраните огород этого сезона — весной удобно сравнивать'}
        </div>
        {!showSaveConfirm ? (
          <button className="btn-primary" style={{ marginTop: 10, width: '100%' }}
            onClick={() => setShowSaveConfirm(true)}>
            {currentSeason ? '🔄 Обновить сезон' : '💾 Сохранить сезон'}
          </button>
        ) : (
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={handleSaveSeason} disabled={saving}>
              {saving ? 'Сохраняю...' : 'Да, сохранить'}
            </button>
            <button className="btn-back" onClick={() => setShowSaveConfirm(false)}>Отмена</button>
          </div>
        )}
      </div>

      {/* Прошлые сезоны */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>Загрузка...</div>
      ) : seasons.filter(s => s.year !== currentYear).length === 0 ? (
        <div style={{ textAlign: 'center', color: '#555', padding: 24, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
          Прошлые сезоны появятся здесь.<br/>Приложение будет с вами каждый год 🌱
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {seasons.filter(s => s.year !== currentYear).map(season => {
            const planted = (season.snapshot?.cropEntries || []).filter(e => e.status === 'planted')
            const isOpen = expandedYear === season.year
            return (
              <div key={season.id} className="season-card">
                <button className="season-card-header" onClick={() => setExpandedYear(isOpen ? null : season.year)}>
                  <span className="season-year">🗓️ {season.year}</span>
                  <span className="season-crop-count">{planted.length} культур</span>
                  <span className="season-arrow">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="season-card-body">
                    {season.summary && <div className="season-summary">{season.summary}</div>}
                    <div className="season-crops-grid">
                      {planted.map((e, i: number) => {
                        const crop = CROPS.find(c => c.id === e.id)
                        const variety = e.varieties?.[0]?.name
                        return (
                          <div key={i} className="season-crop-item">
                            <span>{crop?.icon ?? '🌱'}</span>
                            <span>{crop?.name ?? e.id}{variety ? ` · ${variety}` : ''}</span>
                          </div>
                        )
                      })}
                    </div>
                    {season.snapshot?.gardenObjects?.length > 0 && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                        Объекты: {season.snapshot.gardenObjects.map(o => o.name).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
