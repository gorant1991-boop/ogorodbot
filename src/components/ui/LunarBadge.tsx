import { useMoon } from '../../hooks'
import { MOON_PHASE_NAMES } from '../../utils/constants'

export function LunarBadge() {
  const moon = useMoon()
  const icon = moon.loading ? '🌙' : (MOON_PHASE_NAMES[moon.phase] ?? '🌙').split(' ')[0]
  const short = moon.loading ? '...' : (moon.phase === 'Full Moon' ? 'Полнолуние' : moon.phase === 'New Moon' ? 'Новолуние' : `${moon.age}-й день`)
  return <div className="lunar-badge">{icon} {short}</div>
}
