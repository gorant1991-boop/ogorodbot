self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', event => {
  const payload = event.data ? event.data.json() : {}
  const title = payload.title || 'ОгородБот'
  const body = payload.body || 'У вас новый совет агронома.'
  const url = payload.url || '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  event.waitUntil((async () => {
    const targetUrl = event.notification.data?.url || '/'
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) {
          await client.navigate(targetUrl)
        }
        return
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl)
    }
  })())
})
