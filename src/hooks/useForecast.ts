import { useState, useEffect } from 'react'

export interface WeatherForecastDay {
  date: string
  icon: string
  tempMax: number
  tempMin: number
  desc: string
  weatherId: number
  rainExpected: boolean
  precipitationMm: number
}

const OWM_KEY = (import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined)?.trim() ?? ''
const FORECAST_CONFIG_ERROR = 'Прогноз не настроен в этом релизе'
const FORECAST_CITY_ERROR = 'Укажите город в профиле'
const FORECAST_UNAVAILABLE_ERROR = 'Прогноз временно недоступен'
const EMPTY_FORECAST = {
  days: [] as WeatherForecastDay[],
  loading: false,
  error: FORECAST_UNAVAILABLE_ERROR,
}

interface ForecastApiItem {
  dt_txt: string
  dt: number
  main: {
    temp_max: number
    temp_min: number
  }
  weather: Array<{
    id: number
    description: string
  }>
  rain?: {
    ['3h']?: number
  }
  snow?: {
    ['3h']?: number
  }
  pop?: number
}

interface ForecastApiResponse {
  cod: string
  list: ForecastApiItem[]
}

function pickWeatherIcon(id: number) {
  if (id >= 200 && id < 300) return '⛈️'
  if (id >= 300 && id < 600) return '🌧️'
  if (id >= 600 && id < 700) return '❄️'
  if (id >= 700 && id < 800) return '🌫️'
  if (id === 800) return '☀️'
  return '⛅'
}

function mapForecastDays(items: ForecastApiItem[]) {
  const byDay = new Map<string, ForecastApiItem[]>()

  items.forEach(item => {
    const date = item.dt_txt.slice(0, 10)
    const bucket = byDay.get(date) ?? []
    bucket.push(item)
    byDay.set(date, bucket)
  })

  return Array.from(byDay.entries())
    .slice(0, 7)
    .map(([date, dayItems]) => {
      const representative = dayItems.find(item => item.dt_txt.includes('12:00')) ?? dayItems[Math.floor(dayItems.length / 2)] ?? dayItems[0]
      const rainyItem = dayItems.find(item => {
        const id = item.weather[0]?.id ?? 0
        const precipitation = (item.rain?.['3h'] ?? 0) + (item.snow?.['3h'] ?? 0)
        return precipitation > 0.1 || (item.pop ?? 0) >= 0.45 || (id >= 200 && id < 700)
      })
      const weatherId = rainyItem?.weather[0]?.id ?? representative.weather[0]?.id ?? 800
      const precipitationMm = dayItems.reduce((sum, item) => sum + (item.rain?.['3h'] ?? 0) + (item.snow?.['3h'] ?? 0), 0)
      const rainExpected = Boolean(rainyItem)

      return {
        date,
        icon: pickWeatherIcon(weatherId),
        tempMax: Math.round(Math.max(...dayItems.map(item => item.main.temp_max))),
        tempMin: Math.round(Math.min(...dayItems.map(item => item.main.temp_min))),
        desc: (rainyItem ?? representative).weather[0]?.description ?? '',
        weatherId,
        rainExpected,
        precipitationMm: Math.round(precipitationMm * 10) / 10,
      }
    })
}

export async function fetchForecastSnapshot(city: string): Promise<WeatherForecastDay[]> {
  const requestCity = city.trim()
  if (!requestCity) return []
  if (!OWM_KEY) throw new Error(FORECAST_CONFIG_ERROR)

  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(requestCity)}&appid=${OWM_KEY}&units=metric&lang=ru&cnt=56`
  )
  const data = await response.json() as ForecastApiResponse

  if (response.status === 401) {
    throw new Error('Ключ прогноза больше не работает')
  }
  if (data.cod !== '200') {
    throw new Error(data.cod === '404' ? 'Город не найден в погодном сервисе' : FORECAST_UNAVAILABLE_ERROR)
  }

  return mapForecastDays(data.list)
}

/**
 * Hook для получения 7-дневного прогноза погоды
 */
export function useForecast(city: string): {
  days: WeatherForecastDay[]
  loading: boolean
  error: string
} {
  const requestCity = city.trim()
  const requestKey = requestCity && OWM_KEY ? requestCity.toLowerCase() : ''
  const [f, setF] = useState<{
    days: WeatherForecastDay[]
    error: string
    key: string
  }>({ days: [], error: '', key: '' })

  useEffect(() => {
    if (!requestKey) return
    let cancelled = false

    fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(requestCity)}&appid=${OWM_KEY}&units=metric&lang=ru&cnt=56`
    )
      .then(async r => ({ response: r, data: await r.json() as ForecastApiResponse }))
      .then(({ response, data: d }) => {
        if (cancelled) return
        if (response.status === 401) {
          setF({ days: [], error: 'Ключ прогноза больше не работает', key: requestKey })
          return
        }
        if (d.cod !== '200') {
          setF({
            days: [],
            error: d.cod === '404' ? 'Город не найден в погодном сервисе' : FORECAST_UNAVAILABLE_ERROR,
            key: requestKey,
          })
          return
        }
        setF({ days: mapForecastDays(d.list), error: '', key: requestKey })
      })
      .catch(() => {
        if (!cancelled) {
          setF({ days: [], error: FORECAST_UNAVAILABLE_ERROR, key: requestKey })
        }
      })

    return () => {
      cancelled = true
    }
  }, [requestCity, requestKey])

  if (!requestCity) {
    return { ...EMPTY_FORECAST, error: FORECAST_CITY_ERROR }
  }

  if (!OWM_KEY) {
    return { ...EMPTY_FORECAST, error: FORECAST_CONFIG_ERROR }
  }

  return {
    days: f.key === requestKey ? f.days : [],
    loading: f.key !== requestKey,
    error: f.key === requestKey ? f.error : '',
  }
}
