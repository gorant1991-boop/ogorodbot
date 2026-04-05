import type { OnboardingData, Plan } from './types'
import { CROPS, GROW_OPTIONS } from './constants'

type ShareCardTheme = 'garden' | 'premium'

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function getExperienceLabel(value: string) {
  return {
    beginner: 'Новичок',
    amateur: 'Любитель',
    experienced: 'Опытный',
    expert: 'Эксперт',
  }[value] ?? 'Садовод'
}

function summarizeGarden(data: OnboardingData) {
  const planted = data.cropEntries.filter(entry => entry.status === 'planted')
  const varieties = data.cropEntries.reduce((acc, entry) => acc + entry.varieties.filter(v => v.name.trim()).length, 0)
  const varietyList = data.cropEntries.flatMap(entry => {
    const crop = CROPS.find(item => item.id === entry.id)
    const cropLabel = crop ? `${crop.icon} ${crop.name}` : '🌱 Культура'
    const namedVarieties = entry.varieties.filter(v => v.name.trim())
    return namedVarieties.map(variety => `${cropLabel} · ${variety.name.trim()}`)
  })
  const places = data.gardenObjects
    .map(object => {
      const option = GROW_OPTIONS.find(item => item.id === object.type)
      return option ? `${option.icon} ${object.name}` : object.name
    })
    .slice(0, 3)
  const topCrops = data.cropEntries
    .slice(0, 4)
    .map(entry => {
      const crop = CROPS.find(item => item.id === entry.id)
      const firstVariety = entry.varieties.find(v => v.name.trim())
      return `${crop?.icon ?? '🌱'} ${crop?.name ?? entry.id}${firstVariety ? ` · ${firstVariety.name}` : ''}`
    })

  return {
    planted: planted.length,
    total: data.cropEntries.length,
    varieties,
    varietyList,
    places,
    topCrops,
  }
}

function wrapTextLines(items: string[], maxCharsPerLine: number, maxLines: number) {
  const lines: string[] = []
  let current = ''
  let shownCount = 0

  for (const item of items) {
    const next = current ? `${current}  •  ${item}` : item
    if (next.length <= maxCharsPerLine) {
      current = next
      shownCount += 1
      continue
    }

    if (current) lines.push(current)
    current = item
    shownCount += 1

    if (lines.length >= maxLines) break
  }

  if (lines.length < maxLines && current) lines.push(current)

  if (items.length > 0 && lines.length === maxLines) {
    const rest = items.length - shownCount
    if (rest > 0) {
      lines[maxLines - 1] = `${lines[maxLines - 1]}  •  +${rest} ещё`
    }
  }

  return lines.slice(0, maxLines)
}

function createListLines(items: string[], maxCharsPerLine: number, maxLines: number) {
  const clean = items.filter(Boolean)
  const lines = wrapTextLines(clean, maxCharsPerLine, maxLines)
  return lines.length > 0 ? lines : ['Пока пусто']
}

function buildSvg(data: OnboardingData, plan: Plan, theme: ShareCardTheme) {
  const summary = summarizeGarden(data)
  const title = theme === 'premium' ? 'Огород под полным контролем' : 'Огород под рукой'
  const subtitle = theme === 'premium'
    ? 'AI-советы, дневник и сезонный план по вашим культурам'
    : 'AI подсказывает полив, подкормки, риски по погоде и уход по культурам'
  const accent = theme === 'premium' ? '#f7c948' : '#8ae28f'
  const accentSoft = theme === 'premium' ? 'rgba(247,201,72,0.18)' : 'rgba(138,226,143,0.16)'
  const badge = theme === 'premium' ? 'PREMIUM' : 'OGOROD AI'
  const city = data.city || 'Мой участок'
  const exp = getExperienceLabel(data.experience)
  const cropsLines = createListLines(summary.topCrops, 30, 3)
  const varietyLines = createListLines(summary.varietyList, 30, 4)
  const objectsLabel = summary.places.length > 0 ? summary.places.join('  •  ') : 'Объекты ещё не добавлены'
  const planLabel = plan === 'free' ? 'Первый совет бесплатно' : plan === 'base' ? 'Базовая подписка' : 'Премиум-подписка'

  const cropsSvg = cropsLines
    .map((line, index) => `<text x="88" y="${500 + index * 24}" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="600" fill="#f8fafc">${escapeXml(line)}</text>`)
    .join('\n')

  const varietiesSvg = varietyLines
    .map((line, index) => `<text x="626" y="${500 + index * 24}" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="600" fill="#f8fafc">${escapeXml(line)}</text>`)
    .join('\n')

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme === 'premium' ? '#0b1324' : '#0c2113'}"/>
      <stop offset="100%" stop-color="${theme === 'premium' ? '#1b3b52' : '#215f37'}"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme === 'premium' ? 'rgba(8,18,34,0.92)' : 'rgba(13,35,19,0.92)'}"/>
      <stop offset="100%" stop-color="${theme === 'premium' ? 'rgba(16,54,73,0.92)' : 'rgba(20,68,38,0.9)'}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="30" flood-color="rgba(0,0,0,0.28)"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1070" cy="126" r="128" fill="${accentSoft}"/>
  <circle cx="90" cy="560" r="116" fill="rgba(255,255,255,0.06)"/>
  <circle cx="1004" cy="526" r="78" fill="rgba(255,255,255,0.04)"/>

  <g filter="url(#shadow)">
    <rect x="48" y="42" width="1104" height="546" rx="34" fill="url(#panel)" stroke="rgba(255,255,255,0.08)"/>
  </g>

  <rect x="84" y="82" width="${theme === 'premium' ? '170' : '198'}" height="44" rx="22" fill="${accentSoft}" stroke="rgba(255,255,255,0.08)"/>
  <text x="${theme === 'premium' ? '169' : '183'}" y="110" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="18" fill="${accent}">${badge}</text>

  <text x="84" y="184" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="64" fill="#ffffff">${escapeXml(title)}</text>
  <text x="84" y="224" font-family="Inter, Arial, sans-serif" font-weight="500" font-size="27" fill="rgba(255,255,255,0.82)">${escapeXml(subtitle)}</text>

  <rect x="84" y="254" width="188" height="38" rx="19" fill="rgba(255,255,255,0.08)"/>
  <text x="178" y="278" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="18" fill="${accent}">${escapeXml(city)}</text>
  <rect x="286" y="254" width="170" height="38" rx="19" fill="rgba(255,255,255,0.08)"/>
  <text x="371" y="278" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="18" fill="#f8fafc">${escapeXml(exp)}</text>
  <rect x="470" y="254" width="264" height="38" rx="19" fill="rgba(255,255,255,0.08)"/>
  <text x="602" y="278" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="18" fill="#f8fafc">${escapeXml(planLabel)}</text>

  <g>
    <rect x="84" y="324" width="314" height="112" rx="26" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.09)"/>
    <text x="112" y="358" font-family="Inter, Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.64)">Культур в сезоне</text>
    <text x="112" y="412" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="52" fill="#ffffff">${summary.total}</text>
    <text x="198" y="412" font-family="Inter, Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.64)">уже посажено ${summary.planted}</text>
  </g>

  <g>
    <rect x="442" y="324" width="314" height="112" rx="26" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.09)"/>
    <text x="470" y="358" font-family="Inter, Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.64)">Сортов и пометок</text>
    <text x="470" y="412" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="52" fill="#ffffff">${summary.varieties}</text>
    <text x="556" y="412" font-family="Inter, Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.64)">свои заметки по каждому сорту</text>
  </g>

  <g>
    <rect x="800" y="324" width="268" height="112" rx="26" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.09)"/>
    <text x="828" y="358" font-family="Inter, Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.64)">Объекты</text>
    <text x="828" y="412" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="52" fill="#ffffff">${data.gardenObjects.length}</text>
    <text x="892" y="412" font-family="Inter, Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.64)">парники, грядки, теплицы</text>
  </g>

  <rect x="84" y="454" width="500" height="108" rx="26" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)"/>
  <text x="88" y="480" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="${accent}">Что уже растёт</text>
  ${cropsSvg}

  <rect x="618" y="454" width="450" height="108" rx="26" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)"/>
  <text x="622" y="480" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800" fill="${accent}">Мои сорта</text>
  ${varietiesSvg}

  <rect x="84" y="576" width="984" height="1" fill="rgba(255,255,255,0.12)"/>
  <text x="84" y="603" font-family="Inter, Arial, sans-serif" font-size="17" fill="rgba(255,255,255,0.72)">${escapeXml(objectsLabel)}</text>
  <text x="1068" y="603" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="700" fill="rgba(255,255,255,0.78)">ogorod-ai.ru</text>
</svg>`.trim()
}

async function svgToPngBlob(svg: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 630
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is unavailable')
    ctx.drawImage(image, 0, 0, 1200, 630)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(nextBlob => {
        if (nextBlob) resolve(nextBlob)
        else reject(new Error('Не удалось собрать PNG'))
      }, 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function generateGardenShareCard(data: OnboardingData, plan: Plan, theme: ShareCardTheme) {
  const svg = buildSvg(data, plan, theme)
  const png = await svgToPngBlob(svg)
  const file = new File([png], theme === 'premium' ? 'ogorodbot-premium-card.png' : 'ogorodbot-garden-card.png', {
    type: 'image/png',
  })
  return { file, svg }
}

export async function shareGardenToVk(data: OnboardingData, plan: Plan, theme: ShareCardTheme) {
  const { file } = await generateGardenShareCard(data, plan, theme)
  const title = theme === 'premium' ? 'Огород под контролем в МойАгрономе' : 'Что делать в огороде сегодня'
  const text = theme === 'premium'
    ? 'Веду сезон в МойАгрономе: AI-советы, свои сорта, дневник и сезонный план в одном месте.'
    : 'МойАгроном подсказывает полив, подкормки и риски по погоде под мои культуры. Первый совет можно получить бесплатно.'

  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator
  const canShareFiles = canNativeShare && 'canShare' in navigator && navigator.canShare({ files: [file] })

  try {
    if (canShareFiles) {
      await navigator.share({
        title,
        text,
        files: [file],
      })
      return
    }
  } catch {
    // graceful fallback below
  }

  downloadBlob(file, file.name)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(`${title}\n\n${text}\n\nhttps://ogorod-ai.ru`)
  }
  const shareUrl = new URL('https://vk.com/share.php')
  shareUrl.searchParams.set('url', 'https://ogorod-ai.ru')
  shareUrl.searchParams.set('title', title)
  shareUrl.searchParams.set('comment', `${text} Карточка уже сохранена на устройство: останется прикрепить её к посту.`)
  window.open(shareUrl.toString(), '_blank', 'noopener,noreferrer')
}
