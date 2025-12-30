// Custom Service Worker code for background notifications
// This gets injected into the Workbox-generated service worker

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_REMINDERS') {
    const { reminders } = event.data
    console.log('[SW] Received reminders to schedule:', reminders.length)
    
    // Store reminders in IndexedDB via the service worker
    event.waitUntil(
      self.registration.sync.register('check-reminders').catch(err => {
        console.log('[SW] Background Sync not supported, using setInterval fallback')
        // Fallback: check every minute
        setupReminderCheck(reminders)
      })
    )
  }
})

// Check reminders periodically (fallback when Background Sync isn't available)
function setupReminderCheck(reminders) {
  setInterval(() => {
    checkAndFireReminders(reminders)
  }, 60000) // Check every minute
}

async function checkAndFireReminders(reminders) {
  const now = Date.now()
  
  for (const reminder of reminders) {
    const fireAt = new Date(reminder.fireAt).getTime()
    const diff = fireAt - now
    
    // Fire if within the next minute and not yet fired
    if (diff > 0 && diff <= 60000 && !reminder.fired) {
      console.log('[SW] Firing reminder:', reminder.title)
      
      await self.registration.showNotification(reminder.title, {
        body: reminder.body,
        icon: '/pwa-icons/icon-192.png',
        badge: '/pwa-icons/icon-192.png',
        tag: 'session-reminder-' + reminder.sessionId,
        requireInteraction: false,
        data: { sessionId: reminder.sessionId }
      })
      
      reminder.fired = true
    }
  }
}

// Handle sync event for checking reminders
self.addEventListener('sync', (event) => {
  if (event.tag === 'check-reminders') {
    console.log('[SW] Background sync: checking reminders')
    // Would load reminders from IndexedDB here
  }
})
