import { useState, useEffect } from 'react'
import type { WeatherData } from '../utils/types'

const OWM_KEY = (import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined)?.trim() ?? ''
const WEATHER_CONFIG_ERROR = 'Погода не настроена в этом релизе'
const WEATHER_CITY_ERROR = 'Укажите город в профиле'
const WEATHER_UNAVAILABLE_ERROR = 'Погода временно недоступна'
const EMPTY_WEATHER: WeatherData = {
  temp: 0,
  feels: 0,
  desc: '',
  icon: '⛅',
  humidity: 0,
  wind: 0,
  loading: false,
  error: WEATHER_UNAVAILABLE_ERROR,
}

interface WeatherApiResponse {
  cod: number
  main: {
    temp: number
    feels_like: number
    humidity: number
  }
  weather: Array<{
    id: number
    description: string
  }>
  wind: {
    speed: number
  }
}

function buildWeatherError(error: string): WeatherData {
  return {
    ...EMPTY_WEATHER,
    error,
  }
}

async function requestWeather(city: string): Promise<WeatherData> {
  const requestCity = city.trim()
  if (!requestCity) return buildWeatherError(WEATHER_CITY_ERROR)
  if (!OWM_KEY) return buildWeatherError(WEATHER_CONFIG_ERROR)

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(requestCity)}&appid=${OWM_KEY}&units=metric&lang=ru`
    )
    const d = await response.json() as WeatherApiResponse
    if (response.status === 401) {
      return buildWeatherError('Ключ погоды больше не работает')
    }
    if (d.cod !== 200) {
      if (d.cod === 404) {
        return buildWeatherError('Город не найден в погодном сервисе')
      }
      return buildWeatherError(WEATHER_UNAVAILABLE_ERROR)
    }

    const temp = Math.round(d.main.temp)
    const id = d.weather[0].id
    let icon = '⛅'
    if (id >= 200 && id < 300) icon = '⛈️'
    else if (id >= 300 && id < 600) icon = '🌧️'
    else if (id >= 600 && id < 700) icon = '❄️'
    else if (id >= 700 && id < 800) icon = '🌫️'
    else if (id === 800) icon = '☀️'

    return {
      temp,
      feels: Math.round(d.main.feels_like),
      desc: d.weather[0].description,
      icon,
      humidity: d.main.humidity,
      wind: Math.round(d.wind.speed),
      loading: false,
      error: '',
    }
  } catch {
    return buildWeatherError(WEATHER_UNAVAILABLE_ERROR)
  }
}

export async function fetchWeatherSnapshot(city: string): Promise<WeatherData> {
  return requestWeather(city)
}

/**
 * Hook для получения текущей погоды
 */
export function useWeather(city: string): WeatherData {
  const requestCity = city.trim()
  const requestKey = requestCity && OWM_KEY ? requestCity.toLowerCase() : ''
  const [w, setW] = useState<WeatherData & { key: string }>({
    ...EMPTY_WEATHER,
    loading: true,
    error: '',
    key: '',
  })

  useEffect(() => {
    if (!requestKey) return
    let cancelled = false

    requestWeather(requestCity)
      .then(nextWeather => {
        if (cancelled) return
        setW({
          ...nextWeather,
          key: requestKey,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setW({ ...buildWeatherError(WEATHER_UNAVAILABLE_ERROR), key: requestKey })
        }
      })

    return () => {
      cancelled = true
    }
  }, [requestCity, requestKey])

  if (!requestCity) {
    return buildWeatherError(WEATHER_CITY_ERROR)
  }

  if (!OWM_KEY) {
    return buildWeatherError(WEATHER_CONFIG_ERROR)
  }

  return w.key === requestKey
    ? w
    : {
        ...EMPTY_WEATHER,
        loading: true,
        error: '',
      }
}
