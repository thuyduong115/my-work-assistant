/* Imported into the generated service worker: notification clicks focus the app */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data && event.notification.data.target
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if (target) c.postMessage({ type: 'mwa-notification', target })
          return c.focus()
        }
      }
      let q = ''
      if (target && target.kind === 'ritual') q = '?action=' + target.ritual
      else if (target && target.kind === 'focus') q = '?action=focus'
      return self.clients.openWindow(self.registration.scope + q)
    }),
  )
})
