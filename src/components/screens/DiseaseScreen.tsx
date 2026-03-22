import type { CropEntry } from '../../utils/types'
import { CROPS, DISEASE_MATRIX } from '../../utils/constants'
import { useWeather } from '../../hooks'

export function DiseaseScreen({ cropEntries, city }: { cropEntries: CropEntry[]; city: string }) {
  const weather = useWeather(city)
  const myIds = cropEntries.filter(e => e.status === 'planted').map(e => e.id)

  const risks = DISEASE_MATRIX.filter(d =>
    !weather.loading && !weather.error &&
    d.condition(weather.temp, weather.humidity) &&
    d.crops.some(id => myIds.includes(id))
  )

  const noRisks = !weather.loading && !weather.error && risks.length === 0

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {weather.loading && <div style={{ color: '#64748b', fontSize: 13 }}>Загрузка погоды...</div>}
      {weather.error && <div style={{ color: '#f87171', fontSize: 13 }}>Погода недоступна — проверьте город в профиле</div>}
      {noRisks && (
        <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: 14, fontSize: 13, color: '#4ade80' }}>
          ✅ По текущей погоде ({weather.temp}°C, влажность {weather.humidity}%) рисков болезней не выявлено
        </div>
      )}
      {risks.map((r, i) => {
        const affectedCrops = r.crops.filter(id => myIds.includes(id))
        return (
          <div key={i} className={`disease-card ${r.severity}`} style={{ marginBottom: 10 }}>
            <div className="disease-name">{r.name}</div>
            <div className="disease-crops">
              {affectedCrops.map(id => {
                const c = CROPS.find(x => x.id === id)
                return <span key={id} className="compat-tag bad">{c?.icon} {c?.name}</span>
              })}
            </div>
            <div className="disease-advice">{r.advice}</div>
          </div>
        )
      })}
    </div>
  )
}
