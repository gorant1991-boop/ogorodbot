import { useState, useEffect } from 'react'

export interface ForecastDay {
  date: string
  icon: string
  tempMax: number
  tempMin: number
  desc: string
}

const OWM_KEY = '74da32bba104679e8fe0a5d77b2d18fd'
const EMPTY_FORECAST = {
  days: [] as ForecastDay[],
  loading: false,
  error: true,
}

interface ForecastApiItem {
  dt_txt: string
  main: {
    temp_max: number
    temp_min: number
  }
  weather: Array<{
    id: number
    description: string
  }>
}

interface ForecastApiResponse {
  cod: string
  list: ForecastApiItem[]
}

/**
 * Hook для получения 7-дневного прогноза погоды
 */
export function useForecast(city: string): {
  days: ForecastDay[]
  loading: boolean
  error: boolean
} {
  const [f, setF] = useState<{
    days: ForecastDay[]
    loading: boolean
    error: boolean
  }>({ days: [], loading: true, error: false })

  useEffect(() => {
    if (!city.trim()) return

    fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${OWM_KEY}&units=metric&lang=ru&cnt=56`
    )
      .then(r => r.json())
      .then((d: ForecastApiResponse) => {
        if (d.cod !== '200') {
          setF(EMPTY_FORECAST)
          return
        }

        // Группируем по дням — берём запись около полудня
        const byDay: Record<string, ForecastApiItem> = {}
        d.list.forEach(item => {
          const date = item.dt_txt.slice(0, 10)
          if (!byDay[date] || item.dt_txt.includes('12:00')) byDay[date] = item
        })

        const days: ForecastDay[] = Object.entries(byDay)
          .slice(0, 7)
          .map(([date, item]) => {
            const id = item.weather[0].id
            let icon = '⛅'
            if (id >= 200 && id < 300) icon = '⛈️'
            else if (id >= 300 && id < 600) icon = '🌧️'
            else if (id >= 600 && id < 700) icon = '❄️'
            else if (id >= 700 && id < 800) icon = '🌫️'
            else if (id === 800) icon = '☀️'

            return {
              date,
              icon,
              tempMax: Math.round(item.main.temp_max),
              tempMin: Math.round(item.main.temp_min),
              desc: item.weather[0].description,
            }
          })

        setF({ days, loading: false, error: false })
      })
      .catch(() => setF(EMPTY_FORECAST))
  }, [city])

  return city.trim() ? f : EMPTY_FORECAST
}
