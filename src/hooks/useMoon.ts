import { useState } from 'react'
import * as SunCalc from 'suncalc'
import type { MoonData } from '../utils/types'

/**
 * Рассчитать текущую лунную фазу и данные
 */
function calcMoon(): MoonData & { dayStart: Date; dayEnd: Date } {
  const now = new Date()
  const SYNODIC = 29.53058867 // дней в лунном месяце

  // Точный возраст луны через suncalc
  const illum = SunCalc.getMoonIllumination(now)
  // illum.phase: 0 = новолуние, 0.5 = полнолуние, 1 = новолуние
  const age = illum.phase * SYNODIC

  // Определяем фазу
  let phase = 'New Moon'
  if (age < 1.85) phase = 'New Moon'
  else if (age < 7.38) phase = 'Waxing Crescent'
  else if (age < 9.22) phase = 'First Quarter'
  else if (age < 14.77) phase = 'Waxing Gibbous'
  else if (age < 16.61) phase = 'Full Moon'
  else if (age < 22.15) phase = 'Waning Gibbous'
  else if (age < 23.99) phase = 'Third Quarter'
  else phase = 'Waning Crescent'

  const illumination = Math.round(illum.fraction * 100)
  const lunarDay = Math.floor(age) + 1
  const daysUntilFullMoon = Math.ceil((14.76 - age + SYNODIC) % SYNODIC)

  // Вычисляем начало и конец текущего лунного дня
  // Один лунный день = SYNODIC / 29.53 * 24ч ≈ 24ч 50мин
  const msPerLunarDay = (SYNODIC / 29.53058867) * 24 * 60 * 60 * 1000
  // Начало текущего лунного дня
  const dayStart = new Date(now.getTime() - (age % 1) * 24 * 60 * 60 * 1000)
  const dayEnd = new Date(dayStart.getTime() + msPerLunarDay)

  return { phase, illumination, age: lunarDay, loading: false, daysUntilFullMoon, dayStart, dayEnd }
}

/**
 * Hook для получения текущей лунной фазы
 */
export function useMoon(): MoonData & { dayStart: Date; dayEnd: Date } {
  const [m] = useState(() => calcMoon())
  return m
}
