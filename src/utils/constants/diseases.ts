export const DISEASE_MATRIX: { 
  condition: (temp: number, humidity: number) => boolean
  crops: string[]
  name: string
  advice: string
  severity: 'warn' | 'danger'
}[] = [
  {
    name: '🍄 Фитофтора',
    condition: (t, h) => t >= 15 && t <= 25 && h >= 75,
    crops: ['tomato', 'potato'],
    advice: 'Обработайте медным купоросом или фунгицидом. Избегайте полива сверху.',
    severity: 'danger',
  },
  {
    name: '🕷️ Паутинный клещ',
    condition: (t, h) => t >= 25 && h < 50,
    crops: ['cucumber', 'pepper', 'eggplant', 'tomato'],
    advice: 'Опрыскайте акарицидом или мыльным раствором. Повысьте влажность.',
    severity: 'warn',
  },
  {
    name: '🌫️ Мучнистая роса',
    condition: (t, h) => t >= 18 && t <= 26 && h >= 60 && h <= 80,
    crops: ['cucumber', 'zucchini', 'pumpkin', 'strawberry'],
    advice: 'Обработайте содовым раствором или фунгицидом. Улучшите вентиляцию.',
    severity: 'warn',
  },
  {
    name: '🦟 Белокрылка',
    condition: (t, h) => t >= 22 && h >= 70,
    crops: ['tomato', 'pepper', 'eggplant', 'cucumber'],
    advice: 'Используйте жёлтые клеевые ловушки, обработайте инсектицидом.',
    severity: 'warn',
  },
  {
    name: '🐛 Капустная совка',
    condition: (t, h) => t >= 18 && t <= 28 && h >= 65,
    crops: ['cabbage'],
    advice: 'Осмотрите листья снизу, удалите яйца вручную. Обработайте Лепидоцидом.',
    severity: 'warn',
  },
  {
    name: '❄️ Риск заморозка',
    condition: (t, humidity) => t <= 3 && humidity >= 0,
    crops: ['tomato', 'cucumber', 'pepper', 'eggplant', 'zucchini', 'pumpkin', 'basil'],
    advice: 'Укройте растения агроволокном или плёнкой на ночь.',
    severity: 'danger',
  },
]
