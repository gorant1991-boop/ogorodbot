export interface EmbeddedBrowserInfo {
  isEmbedded: boolean
  source: 'telegram' | 'instagram' | 'facebook' | 'messenger' | 'vk' | 'generic'
  label: string
  preferredBrowser: string
  hint: string
}

function getPreferredBrowserLabel(ua: string) {
  const normalized = ua.toLowerCase()
  if (/iphone|ipad|ipod/.test(normalized)) return 'Safari или в Яндекс Браузере'
  if (/android/.test(normalized)) return 'Chrome или в Яндекс Браузере'
  return 'обычном браузере, например в Chrome или в Яндекс Браузере'
}

export function detectEmbeddedBrowser(userAgent = navigator.userAgent): EmbeddedBrowserInfo | null {
  const ua = userAgent
  const normalized = ua.toLowerCase()
  const preferredBrowser = getPreferredBrowserLabel(ua)
  const isIosWebView = /iphone|ipad|ipod/.test(normalized)
    && /applewebkit/.test(normalized)
    && !/safari|crios|fxios|edgios|yabrowser/.test(normalized)
  const isAndroidWebView = /android/.test(normalized)
    && (/\bwv\b/.test(normalized) || /version\/[\d.]+.*chrome\/[\d.]+.*mobile safari\/[\d.]+/.test(normalized))

  if (/telegram/.test(normalized)) {
    return {
      isEmbedded: true,
      source: 'telegram',
      label: 'встроенном браузере Telegram',
      preferredBrowser,
      hint: `В Telegram откройте меню ⋯ и выберите «Открыть в браузере», лучше в ${preferredBrowser}.`,
    }
  }

  if (/instagram/.test(normalized)) {
    return {
      isEmbedded: true,
      source: 'instagram',
      label: 'встроенном браузере Instagram',
      preferredBrowser,
      hint: `В Instagram откройте меню ⋯ и выберите «Открыть в браузере», лучше в ${preferredBrowser}.`,
    }
  }

  if (/messenger/.test(normalized)) {
    return {
      isEmbedded: true,
      source: 'messenger',
      label: 'встроенном браузере Messenger',
      preferredBrowser,
      hint: `В Messenger откройте меню и выберите «Open in Browser», лучше в ${preferredBrowser}.`,
    }
  }

  if (/fban|fbav/.test(normalized)) {
    return {
      isEmbedded: true,
      source: 'facebook',
      label: 'встроенном браузере Facebook',
      preferredBrowser,
      hint: `В Facebook откройте меню ⋯ и выберите «Open in Browser», лучше в ${preferredBrowser}.`,
    }
  }

  if (/vkclient|vk_ios|vkandroid/.test(normalized)) {
    return {
      isEmbedded: true,
      source: 'vk',
      label: 'встроенном браузере ВКонтакте',
      preferredBrowser,
      hint: `Во ВКонтакте откройте меню и выберите «Открыть в браузере», лучше в ${preferredBrowser}.`,
    }
  }

  if (isIosWebView || isAndroidWebView) {
    return {
      isEmbedded: true,
      source: 'generic',
      label: 'встроенном браузере приложения',
      preferredBrowser,
      hint: `Откройте меню этого окна и выберите «Открыть в браузере», лучше в ${preferredBrowser}.`,
    }
  }

  return null
}
