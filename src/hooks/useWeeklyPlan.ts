import { useState, useEffect } from 'react'

export interface WeekTask {
  crop: string
  action: string
  reason: string
}

export interface WeekDay {
  date: string
  tasks: WeekTask[]
}

interface WeeklyPlanResponse {
  plan?: WeekDay[]
}

/**
 * Hook для получения еженедельного AI плана
 */
export function useWeeklyPlan(
  vkUserId: number,
  enabled: boolean
): {
  days: WeekDay[]
  loading: boolean
  error: boolean
} {
  const requestKey = enabled && vkUserId ? String(vkUserId) : ''
  const [state, setState] = useState<{
    days: WeekDay[]
    error: boolean
    key: string
  }>({ days: [], error: false, key: '' })

  useEffect(() => {
    if (!requestKey) return

    fetch('https://garden-agent.gorant1991.workers.dev/weekly-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vk_user_id: vkUserId }),
    })
      .then(r => r.json())
      .then((d: WeeklyPlanResponse) => setState({ days: d.plan || [], error: false, key: requestKey }))
      .catch(() => setState({ days: [], error: true, key: requestKey }))
  }, [requestKey, vkUserId])

  if (!requestKey) {
    return { days: [], loading: false, error: false }
  }

  return {
    days: state.key === requestKey ? state.days : [],
    loading: state.key !== requestKey,
    error: state.key === requestKey ? state.error : false,
  }
}
