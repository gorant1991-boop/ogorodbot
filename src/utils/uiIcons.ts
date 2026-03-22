export const UI_ICONS = {
  agronomist: '/icons/icon_agronomist.webp',
  sunrise: '/icons/icon_sunrise.webp',
  tab_home: '/icons/tab_home.webp',
  tab_plants: '/icons/tab_plants.webp',
  tab_moon: '/icons/tab_moon.webp',
  tab_profile: '/icons/tab_profile_male.webp',
  notif_vk: '/icons/notif_vk.webp',
  notif_tg: '/icons/notif_tg.webp',
  notif_ok: '/icons/notif_ok.webp',
  notif_push: '/icons/notif_bell.webp',
  open: '/icons/open.webp',
  greenhouse: '/icons/greenhouse.webp',
  hotbed: '/icons/hotbed.webp',
} as const

export function getNotificationIconSrc(id: string): string | null {
  const map: Record<string, string> = {
    vk: UI_ICONS.notif_vk,
    tg: UI_ICONS.notif_tg,
    ok: UI_ICONS.notif_ok,
    push: UI_ICONS.notif_push,
  }

  return map[id] ?? null
}

export function getGrowObjectIconSrc(id: string): string | null {
  const map: Record<string, string> = {
    open: UI_ICONS.open,
    greenhouse: UI_ICONS.greenhouse,
    hotbed: UI_ICONS.hotbed,
  }

  return map[id] ?? null
}
