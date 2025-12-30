/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope

// Precache app shell
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Runtime caching for schedule JSON
registerRoute(
  /\/schedule\.json(\?.*)?$/i,
  new StaleWhileRevalidate({
    cacheName: 'schedule-json',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  })
)

// Store for reminders
let activeReminders: Array<{
  sessionId: string
  title: string
  body: string
  fireAt: string
  fired: boolean
}> = []

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_REMINDERS') {
    const { reminders } = event.data
    console.log('[SW] Received reminders to schedule:', reminders.length)
    activeReminders = reminders.map((r: any) => ({ ...r, fired: false }))
    
    // Start checking reminders
    startReminderCheck()
  }
})

let reminderCheckInterval: number | null = null

function startReminderCheck() {
  // Clear existing interval
  if (reminderCheckInterval !== null) {
    clearInterval(reminderCheckInterval)
  }
  
  console.log('[SW] Starting reminder check interval')
  
  // Check every 30 seconds
  reminderCheckInterval = setInterval(() => {
    console.log('[SW] Interval tick - checking reminders')
    checkAndFireReminders()
  }, 30000) as unknown as number
  
  // Also check immediately
  checkAndFireReminders()
}

async function checkAndFireReminders() {
  const now = Date.now()
  console.log('[SW] Checking reminders at', new Date().toISOString())
  
  for (const reminder of activeReminders) {
    if (reminder.fired) continue
    
    const fireAt = new Date(reminder.fireAt).getTime()
    const diff = fireAt - now
    
    // Fire if time has passed and within last 2 minutes to avoid missing
    if (diff <= 0 && diff > -120000) {
      console.log('[SW] Firing reminder:', reminder.title)
      
      try {
        await self.registration.showNotification(reminder.title, {
          body: reminder.body,
          icon: '/pwa-icons/icon-192.png',
          badge: '/pwa-icons/icon-192.png',
          tag: 'session-reminder-' + reminder.sessionId,
          requireInteraction: false,
          data: { sessionId: reminder.sessionId }
        })
        
        reminder.fired = true
      } catch (error) {
        console.error('[SW] Failed to show notification:', error)
      }
    }
  }
  
  // Clean up old reminders
  activeReminders = activeReminders.filter(r => {
    const fireAt = new Date(r.fireAt).getTime()
    const diff = now - fireAt
    return diff < 3600000 // Keep for 1 hour after fire time
  })
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.openWindow('/')
  )
})
