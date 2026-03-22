// ============= Лунный календарь =============

export const MOON_PHASE_NAMES: Record<string, string> = {
  'New Moon': '🌑 Новолуние',
  'Waxing Crescent': '🌒 Растущий серп',
  'First Quarter': '🌓 Первая четверть',
  'Waxing Gibbous': '🌔 Растущая луна',
  'Full Moon': '🌕 Полнолуние',
  'Waning Gibbous': '🌖 Убывающая луна',
  'Third Quarter': '🌗 Последняя четверть',
  'Waning Crescent': '🌘 Убывающий серп',
}

export const MOON_GOOD: Record<string, string> = {
  'New Moon': 'Посев зелени, планирование',
  'Waxing Crescent': 'Посев надземных культур, полив',
  'First Quarter': 'Посев, пересадка рассады',
  'Waxing Gibbous': 'Полив, подкормка, пересадка',
  'Full Moon': 'Сбор урожая, консервация',
  'Waning Gibbous': 'Обрезка, прополка, борьба с вредителями',
  'Third Quarter': 'Посев корнеплодов, внесение удобрений',
  'Waning Crescent': 'Обрезка, пересадка многолетников',
}

export const MOON_BAD: Record<string, string> = {
  'New Moon': 'Пересадка, обрезка',
  'Waxing Crescent': 'Посев корнеплодов, обрезка',
  'First Quarter': 'Обрезка, сбор урожая',
  'Waxing Gibbous': 'Обрезка, посев корнеплодов',
  'Full Moon': 'Посев, пересадка',
  'Waning Gibbous': 'Посев надземных культур',
  'Third Quarter': 'Посев надземных культур, полив',
  'Waning Crescent': 'Посев, прививка',
}

// Хорошие дни для посадки по фазам луны
export const PLANTING_DAYS_BY_MOON = {
  'Waxing Crescent': { good: true, note: 'Идеален для листовых культур' },
  'First Quarter': { good: true, note: 'Хорош для плодов и семян' },
  'Waxing Gibbous': { good: true, note: 'Универсально хороший период' },
  'Full Moon': { good: false, note: 'Не рекомендуется посадка' },
  'Waning Gibbous': { good: false, note: 'Период для уборки' },
  'Third Quarter': { good: false, note: 'Подходит для подземных культур' },
}
