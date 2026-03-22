import type { CropEntry, DiaryEntry, OnboardingData } from './types'
import { getOps, CROPS } from './index'

interface ExportSeason {
  year: number
  summary: string | null
  snapshot?: {
    cropEntries?: CropEntry[]
  } | null
}

interface ExportNotification {
  created_at: string
  title: string
  body: string
}

/**
 * Экспортировать данные в CSV формат
 */
export async function exportCSV(
  data: OnboardingData,
  diary: DiaryEntry[],
  seasons: ExportSeason[],
  notifications: ExportNotification[]
) {
  const rows: string[][] = []
  const sep = ','

  // Секция: огород
  rows.push(['=== ОГОРОД ==='])
  rows.push(['Город', data.city])
  rows.push(['Опыт', data.experience])
  rows.push([])
  rows.push(['Культура', 'Сорт', 'Статус', 'Дата посева', 'Место', 'Метод'])
  data.cropEntries.forEach(e => {
    const crop = CROPS.find(c => c.id === e.id)
    const obj = data.gardenObjects.find(o => o.uid === e.location)
    const variety = e.varieties.map(v => v.name).join('; ')
    rows.push([
      crop?.name ?? e.id,
      variety,
      e.status === 'planted' ? 'Посажено' : 'Планируется',
      e.sowDate,
      obj?.name ?? '',
      e.sowMethod === 'seeds' ? 'Семена' : e.sowMethod === 'seedling' ? 'Рассада' : '',
    ])
  })

  rows.push([])
  rows.push(['=== ДНЕВНИК ==='])
  rows.push(['Дата', 'Культура', 'Операция', 'Запись'])
  diary.forEach(d => {
    const crop = d.crop_id ? CROPS.find(c => c.id === d.crop_id) : null
    const op = d.operation && d.crop_id ? getOps(d.crop_id).find(o => o.id === d.operation) : null
    rows.push([
      new Date(d.created_at).toLocaleDateString('ru-RU'),
      crop?.name ?? 'Общее',
      op?.label ?? '',
      d.text,
    ])
  })

  rows.push([])
  rows.push(['=== СОВЕТЫ АГРОНОМА ==='])
  rows.push(['Дата', 'Заголовок', 'Текст'])
  notifications.forEach(n => {
    rows.push([
      new Date(n.created_at).toLocaleDateString('ru-RU'),
      n.title,
      n.body,
    ])
  })

  rows.push([])
  rows.push(['=== ИСТОРИЯ СЕЗОНОВ ==='])
  rows.push(['Год', 'Итог', 'Культур'])
  seasons.forEach(s => {
    const planted = (s.snapshot?.cropEntries || []).filter(e => e.status === 'planted')
    rows.push([String(s.year), s.summary ?? '', String(planted.length)])
  })

  const csv = rows.map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(sep)).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ogorod_${new Date().getFullYear()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Экспортировать данные в HTML формат
 */
export function exportHTML(
  data: OnboardingData,
  diary: DiaryEntry[],
  seasons: ExportSeason[],
  notifications: ExportNotification[]
) {
  const date = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  const year = new Date().getFullYear()

  const cropRows = data.cropEntries
    .map(e => {
      const crop = CROPS.find(c => c.id === e.id)
      const obj = data.gardenObjects.find(o => o.uid === e.location)
      const variety = e.varieties.map(v => v.name).filter(Boolean).join(', ')
      const status = e.status === 'planted' ? '✅ Посажено' : '📋 Планируется'
      const sowDate = e.sowDate ? new Date(e.sowDate).toLocaleDateString('ru-RU') : '—'
      return `<tr>
      <td>${crop?.icon ?? ''} ${crop?.name ?? e.id}</td>
      <td>${variety || '—'}</td>
      <td>${status}</td>
      <td>${sowDate}</td>
      <td>${obj?.name ?? '—'}</td>
    </tr>`
    })
    .join('')

  const diaryRows = diary
    .map(d => {
      const crop = d.crop_id ? CROPS.find(c => c.id === d.crop_id) : null
      const op = d.operation && d.crop_id ? getOps(d.crop_id).find(o => o.id === d.operation) : null
      const dt = new Date(d.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      return `<tr>
      <td>${dt}</td>
      <td>${crop ? crop.icon + ' ' + crop.name : '🌱 Общее'}</td>
      <td>${op?.label ?? '—'}</td>
      <td>${d.text}</td>
    </tr>`
    })
    .join('')

  const notifRows = notifications
    .map(n => {
      const dt = new Date(n.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
      return `<tr>
      <td>${dt}</td>
      <td><strong>${n.title}</strong></td>
      <td>${n.body}</td>
    </tr>`
    })
    .join('')

  const seasonBlocks = seasons
    .map(s => {
      const planted = (s.snapshot?.cropEntries || []).filter(e => e.status === 'planted')
      const cropList = planted
        .map(e => {
          const crop = CROPS.find(c => c.id === e.id)
          const v = e.varieties?.[0]?.name
          return `<span class="tag">${crop?.icon ?? '🌱'} ${crop?.name ?? e.id}${v ? ' · ' + v : ''}</span>`
        })
        .join('')
      return `<div class="season-block">
      <div class="season-year">🗓️ Сезон ${s.year} — ${planted.length} культур</div>
      ${s.summary ? `<div class="season-sum">${s.summary}</div>` : ''}
      <div class="tags">${cropList}</div>
    </div>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Мой огород ${year}</title>
<style>
  body { font-family: Georgia, serif; max-width: 900px; margin: 0 auto; padding: 20px; color: #1a1a1a; background: #fafaf8; }
  h1 { color: #166534; font-size: 28px; margin-bottom: 4px; }
  .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
  h2 { color: #15803d; font-size: 18px; border-bottom: 2px solid #bbf7d0; padding-bottom: 6px; margin-top: 32px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
  th { background: #dcfce7; color: #166534; padding: 8px 10px; text-align: left; font-weight: 600; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0fdf4; vertical-align: top; }
  tr:hover td { background: #f0fdf4; }
  .season-block { background: #f0fdf4; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
  .season-year { font-weight: 700; color: #166534; font-size: 15px; margin-bottom: 6px; }
  .season-sum { color: #4b5563; font-size: 13px; margin-bottom: 8px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { background: #dcfce7; color: #166534; border-radius: 6px; padding: 3px 9px; font-size: 12px; }
  .footer { margin-top: 40px; color: #9ca3af; font-size: 12px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 16px; }
  @media print { body { padding: 10px; } h2 { page-break-before: auto; } }
</style>
</head>
<body>
<h1>🌱 Мой огород</h1>
<div class="subtitle">${data.city} · Экспорт от ${date} · Опыт: ${{ beginner: 'Новичок', amateur: 'Любитель', experienced: 'Опытный', expert: 'Эксперт' }[data.experience] ?? data.experience}</div>

<h2>🥦 Культуры</h2>
<table>
  <thead><tr><th>Культура</th><th>Сорт</th><th>Статус</th><th>Дата посева</th><th>Место</th></tr></thead>
  <tbody>${cropRows}</tbody>
</table>

${diary.length > 0 ? `<h2>📖 Дневник</h2>
<table>
  <thead><tr><th>Дата</th><th>Культура</th><th>Операция</th><th>Запись</th></tr></thead>
  <tbody>${diaryRows}</tbody>
</table>` : ''}

${notifications.length > 0 ? `<h2>🤖 Советы агронома</h2>
<table>
  <thead><tr><th>Дата</th><th>Заголовок</th><th>Совет</th></tr></thead>
  <tbody>${notifRows}</tbody>
</table>` : ''}

${seasons.length > 0 ? `<h2>📅 История сезонов</h2>${seasonBlocks}` : ''}

<div class="footer">Создано в приложении Огород AI · ogorod-ai.ru</div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ogorod_${year}.html`
  a.click()
  URL.revokeObjectURL(url)
}
