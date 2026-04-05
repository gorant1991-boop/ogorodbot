import { useState } from 'react'
import { trackAnalyticsEvent } from '../../supabase'
import type { OnboardingData } from '../../utils/types'
import {
  CROPS,
  DIAGNOSIS_CONDITION_OPTIONS,
  DIAGNOSIS_PART_OPTIONS,
  DIAGNOSIS_PRIMARY_OPTIONS,
  DIAGNOSIS_ZONE_OPTIONS,
  DISEASE_MATRIX,
  diagnoseCropSymptoms,
  type DiagnosisCondition,
  type DiagnosisPrimarySymptom,
  type DiagnosisSymptomPart,
  type DiagnosisSymptomZone,
} from '../../utils/constants'
import { useWeather } from '../../hooks'

export function DiseaseScreen({ data, vkUserId }: { data: OnboardingData; vkUserId: number }) {
  const weather = useWeather(data.city)
  const cropEntries = data.cropEntries
  const fertilizers = Array.isArray(data.fertilizers) ? data.fertilizers.filter(item => item.name.trim()) : []
  const myIds = cropEntries.filter(e => e.status === 'planted').map(e => e.id)
  const activeEntries = cropEntries.filter(entry => entry.status === 'planted')
  const [selectedCropId, setSelectedCropId] = useState<string>(activeEntries[0]?.id ?? '')
  const [symptomPart, setSymptomPart] = useState<DiagnosisSymptomPart | ''>('')
  const [symptomPrimary, setSymptomPrimary] = useState<DiagnosisPrimarySymptom | ''>('')
  const [symptomZone, setSymptomZone] = useState<DiagnosisSymptomZone | ''>('')
  const [symptomConditions, setSymptomConditions] = useState<DiagnosisCondition[]>([])
  const [symptomResults, setSymptomResults] = useState(() => activeEntries[0]?.id ? diagnoseCropSymptoms(activeEntries[0].id, {
    part: '',
    symptom: '',
    zone: '',
    conditions: [],
  }) : [])

  const risks = DISEASE_MATRIX.filter(d =>
    !weather.loading && !weather.error &&
    d.condition(weather.temp, weather.humidity) &&
    d.crops.some(id => myIds.includes(id))
  )

  const noRisks = !weather.loading && !weather.error && risks.length === 0
  const selectedCrop = activeEntries.find(entry => entry.id === selectedCropId) ?? null
  const fertilizerPreview = fertilizers.slice(0, 3)
  const extraFertilizers = fertilizers.length - fertilizerPreview.length

  function toggleCondition(conditionId: DiagnosisCondition) {
    setSymptomConditions(prev => prev.includes(conditionId)
      ? prev.filter(item => item !== conditionId)
      : [...prev, conditionId])
  }

  function formatFertilizerLabel(item: typeof fertilizers[number]) {
    const parts = [item.name.trim()]
    if (item.composition?.trim()) parts.push(item.composition.trim())
    else if (item.brand?.trim()) parts.push(item.brand.trim())
    return parts.join(' · ')
  }

  function getFertilizerAdvice(resultId: string) {
    if (fertilizers.length === 0) return null

    if (resultId === 'nitrogen_or_root_stress' || resultId === 'chlorosis_or_microelements' || resultId === 'growth_stall') {
      return {
        title: 'Что уже есть у вас из удобрений',
        body: 'Перед новой подкормкой сначала сверьтесь с тем, что уже под рукой. Лучше выбрать одно мягкое подходящее удобрение, чем дать несколько подряд.',
        bullets: [
          `Под рукой: ${fertilizerPreview.map(formatFertilizerLabel).join(', ')}${extraFertilizers > 0 ? ` + ещё ${extraFertilizers}` : ''}.`,
          'Смотрите, чтобы состав не дублировал недавнюю подкормку и подходил именно под текущую задачу.',
          'Если причина больше похожа на перелив, холод или слабые корни, удобрение сейчас может не решить проблему.',
        ],
      }
    }

    if (resultId === 'salt_burn' || resultId === 'fruit_rot') {
      return {
        title: 'С удобрениями сейчас аккуратно',
        body: 'Диагностика видит, что у вас уже есть свои подкормки. В этих сценариях важнее не добавлять новое автоматически, а сначала проверить, не стало ли хуже именно после питания.',
        bullets: [
          `У вас есть: ${fertilizerPreview.map(formatFertilizerLabel).join(', ')}${extraFertilizers > 0 ? ` + ещё ${extraFertilizers}` : ''}.`,
          'Не повторяйте концентрированную подкормку по инерции только потому, что средство под рукой.',
          'Сначала выровняйте полив и посмотрите на новый прирост или новые плоды.',
        ],
      }
    }

    return null
  }

  function handleRunSymptomDiagnosis() {
    if (!selectedCrop) return
    const results = diagnoseCropSymptoms(selectedCrop.id, {
      part: symptomPart,
      symptom: symptomPrimary,
      zone: symptomZone,
      conditions: symptomConditions,
    })
    setSymptomResults(results)
    void trackAnalyticsEvent({
      vkUserId,
      eventType: 'symptom_diagnosis_completed',
      source: 'disease_screen',
      metadata: {
        cropId: selectedCrop.id,
        symptom: symptomPrimary || null,
        part: symptomPart || null,
        zone: symptomZone || null,
        conditions: symptomConditions,
        findings: results.map(item => item.id),
        fertilizerCount: fertilizers.length,
      },
    })
  }

  function resetSymptomDiagnosis() {
    setSymptomPart('')
    setSymptomPrimary('')
    setSymptomZone('')
    setSymptomConditions([])
    setSymptomResults([])
  }

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ marginBottom: 16, background: 'rgba(15, 23, 42, 0.45)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 16, padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', marginBottom: 6 }}>Бесплатная диагностика по симптомам</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: '#94a3b8', marginBottom: 12 }}>
          Выберите, где именно проблема и как она выглядит. Диагностика охватывает все культуры в приложении и помогает быстро сузить круг причин без фото и без лишних трат.
        </div>

        {fertilizers.length > 0 && (
          <div style={{ marginBottom: 12, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.18)', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#dcfce7', marginBottom: 4 }}>
              Диагностика помнит ваши удобрения
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.5, color: '#bbf7d0' }}>
              Под рукой: {fertilizerPreview.map(formatFertilizerLabel).join(', ')}{extraFertilizers > 0 ? ` + ещё ${extraFertilizers}` : ''}. Если версия упрётся в питание или ожог после подкормки, экран отдельно напомнит сначала свериться с ними.
            </div>
          </div>
        )}

        {activeEntries.length > 0 && (
          <>
            <div className="modal-section-label" style={{ marginBottom: 8 }}>Какая это культура</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {activeEntries.map(entry => {
                const crop = CROPS.find(item => item.id === entry.id)
                return (
                  <button
                    key={entry.id}
                    className={`ob-chip ${selectedCropId === entry.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedCropId(entry.id)
                      setSymptomResults([])
                    }}
                  >
                    {crop?.icon} {crop?.name}
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className="modal-section-label" style={{ marginBottom: 8 }}>Где проблема</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {DIAGNOSIS_PART_OPTIONS.map(option => (
            <button
              key={option.id}
              className={`ob-chip ${symptomPart === option.id ? 'selected' : ''}`}
              onClick={() => setSymptomPart(symptomPart === option.id ? '' : option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="modal-section-label" style={{ marginBottom: 8 }}>Что видно сильнее всего</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {DIAGNOSIS_PRIMARY_OPTIONS.map(option => (
            <button
              key={option.id}
              className={`ob-chip ${symptomPrimary === option.id ? 'selected' : ''}`}
              onClick={() => setSymptomPrimary(symptomPrimary === option.id ? '' : option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="modal-section-label" style={{ marginBottom: 8 }}>Где выражено сильнее</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {DIAGNOSIS_ZONE_OPTIONS.map(option => (
            <button
              key={option.id}
              className={`ob-chip ${symptomZone === option.id ? 'selected' : ''}`}
              onClick={() => setSymptomZone(symptomZone === option.id ? '' : option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="modal-section-label" style={{ marginBottom: 8 }}>Какие условия подходят</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {DIAGNOSIS_CONDITION_OPTIONS.map(option => (
            <button
              key={option.id}
              className={`ob-chip ${symptomConditions.includes(option.id) ? 'selected' : ''}`}
              onClick={() => toggleCondition(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button className="btn-export" disabled={!selectedCrop || !symptomPrimary} onClick={handleRunSymptomDiagnosis}>
            Подобрать версии
          </button>
          <button className="btn-export" onClick={resetSymptomDiagnosis}>
            Сбросить
          </button>
        </div>

        {symptomResults.length > 0 && (
          <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
            {symptomResults.map(result => (
              <div key={result.id} style={{ borderRadius: 14, padding: 14, background: 'rgba(15, 23, 42, 0.55)', border: `1px solid ${result.urgency === 'high' ? 'rgba(248,113,113,0.35)' : result.urgency === 'medium' ? 'rgba(251,191,36,0.25)' : 'rgba(148,163,184,0.18)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc' }}>{result.title}</div>
                  <span className={`compat-tag ${result.urgency === 'high' ? 'bad' : result.urgency === 'medium' ? 'neutral' : 'good'}`}>
                    {result.urgency === 'high' ? 'Смотреть быстро' : result.urgency === 'medium' ? 'Проверить сегодня' : 'Без спешки'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 10 }}>{result.summary}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Что проверить</div>
                <div style={{ display: 'grid', gap: 5, marginBottom: 10 }}>
                  {result.checks.map(item => (
                    <div key={item} style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.45 }}>• {item}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Что сделать сейчас</div>
                <div style={{ display: 'grid', gap: 5 }}>
                  {result.actions.map(item => (
                    <div key={item} style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.45 }}>• {item}</div>
                  ))}
                </div>
                {getFertilizerAdvice(result.id) && (
                  <div style={{ marginTop: 12, borderRadius: 12, padding: 12, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.16)' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#dcfce7', marginBottom: 6 }}>
                      {getFertilizerAdvice(result.id)?.title}
                    </div>
                    <div style={{ fontSize: 11, lineHeight: 1.5, color: '#bbf7d0', marginBottom: 8 }}>
                      {getFertilizerAdvice(result.id)?.body}
                    </div>
                    <div style={{ display: 'grid', gap: 5 }}>
                      {getFertilizerAdvice(result.id)?.bullets.map(item => (
                        <div key={item} style={{ fontSize: 11, color: '#d9f99d', lineHeight: 1.45 }}>• {item}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, lineHeight: 1.5, color: '#94a3b8', marginBottom: 12 }}>
          Эта кнопочная диагностика работает бесплатно и охватывает все культуры в приложении. Она помогает сузить круг причин: грибковая проблема, вредители, стресс по влаге, питание, холод или ожог после подкормки.
        </div>
      </div>

      {weather.loading && <div style={{ color: '#64748b', fontSize: 13 }}>Загрузка погоды...</div>}
      {weather.error && <div style={{ color: '#f87171', fontSize: 13 }}>{weather.error}</div>}
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
