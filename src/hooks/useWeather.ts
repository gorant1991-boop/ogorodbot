import { useState, useEffect } from 'react'
import type { WeatherData } from '../utils/types'

const OWM_KEY = (import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined)?.trim() ?? ''
const EMPTY_WEATHER: WeatherData = {
  temp: 0,
  feels: 0,
  desc: '',
  icon: '⛅',
  humidity: 0,
  wind: 0,
  loading: false,
  error: 'Ошибка',
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

/**
 * Hook для получения текущей погоды
 */
export function useWeather(city: string): WeatherData {
  const [w, setW] = useState<WeatherData>({
    ...EMPTY_WEATHER,
    loading: true,
    error: '',
  })

  useEffect(() => {
    if (!city.trim()) return
    if (!OWM_KEY) {
      setW(EMPTY_WEATHER)
      return
    }

    fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OWM_KEY}&units=metric&lang=ru`
    )
      .then(r => r.json())
      .then((d: WeatherApiResponse) => {
        if (d.cod !== 200) {
          setW(EMPTY_WEATHER)
          return
        }

        const temp = Math.round(d.main.temp)
        const id = d.weather[0].id
        let icon = '⛅'
        if (id >= 200 && id < 300) icon = '⛈️'
        else if (id >= 300 && id < 600) icon = '🌧️'
        else if (id >= 600 && id < 700) icon = '❄️'
        else if (id >= 700 && id < 800) icon = '🌫️'
        else if (id === 800) icon = '☀️'

        setW({
          temp,
          feels: Math.round(d.main.feels_like),
          desc: d.weather[0].description,
          icon,
          humidity: d.main.humidity,
          wind: Math.round(d.wind.speed),
          loading: false,
          error: '',
        })
      })
      .catch(() => setW(EMPTY_WEATHER))
  }, [city])

  return city.trim() ? w : EMPTY_WEATHER
}
