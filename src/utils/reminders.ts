import type { Session } from '../data/normalizeSchedule'
import { showNotification } from './showNotification'

export type ReminderOffset = 0 | 10

export type ReminderSettings = {
  enabled: boolean
  offsetMinutes: ReminderOffset
}

export type ScheduledHandle = { id: string; timeoutId: number }

export async function ensureNotificationPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  const res = await Notification.requestPermission()
  return res
}

export async function showReminderNotification(title: string, body: string, sessionId: string) {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  
  try {
    // Use better notification options for installed PWAs
    await showNotification(title, { 
      body,
      icon: '/pwa-icons/icon-192.png',
      badge: '/pwa-icons/icon-192.png',
      tag: 'session-reminder-' + sessionId,
      requireInteraction: false,
      data: { sessionId, url: window.location.origin }
    })
  } catch (error) {
    console.error('[Reminders] Failed to show notification:', error)
  }
}

export function computeFireTime(session: Session, offsetMinutes: number): number {
  return session.start.getTime() - offsetMinutes * 60_000
}

export function scheduleReminders(opts: {
  likedSessions: Session[]
  settings: ReminderSettings
}): { handles: ScheduledHandle[]; skipped: number } {
  const handles: ScheduledHandle[] = []
  let skipped = 0
  if (!opts.settings.enabled) {
    console.log('[Reminders] Not enabled, skipping')
    return { handles, skipped }
  }

  console.log(`[Reminders] Scheduling for ${opts.likedSessions.length} sessions, offset: ${opts.settings.offsetMinutes}min`)
  
  // Send reminders to Service Worker for background notifications
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const reminders = opts.likedSessions.map(s => {
      const fireAt = computeFireTime(s, opts.settings.offsetMinutes)
      const when = s.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const prefix = opts.settings.offsetMinutes === 0 ? 'Starting now' : `Starts in ${opts.settings.offsetMinutes} minutes`
      const where = s.room ? ` • ${s.room}` : ''
      
      return {
        sessionId: s.id,
        title: `${prefix}: ${s.title}`,
        body: `${when}${where}`,
        fireAt: new Date(fireAt).toISOString()
      }
    }).filter(r => {
      const fireAt = new Date(r.fireAt).getTime()
      const delay = fireAt - Date.now()
      return delay > 0 && delay <= 24 * 60 * 60_000
    })
    
    console.log(`[Reminders] Sending ${reminders.length} reminders to Service Worker`)
    navigator.serviceWorker.controller.postMessage({
      type: 'SCHEDULE_REMINDERS',
      reminders
    })
  }
  
  // Also keep setTimeout as fallback for when app is in foreground
  const now = Date.now()
  for (const s of opts.likedSessions) {
    const fireAt = computeFireTime(s, opts.settings.offsetMinutes)
    const delay = fireAt - now
    console.log(`[Reminders] Session "${s.title}": fireAt=${new Date(fireAt).toISOString()}, delay=${Math.round(delay/1000)}s`)
    if (delay <= 0) { 
      console.log(`[Reminders] Skipped (already passed)`)
      skipped++
      continue 
    }
    if (delay > 24 * 60 * 60_000) { 
      console.log(`[Reminders] Skipped (>24h away)`)
      skipped++
      continue 
    }
    const timeoutId = window.setTimeout(() => {
      console.log(`[Reminders] Firing notification for "${s.title}"`)
      const when = s.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const prefix = opts.settings.offsetMinutes === 0 ? 'Starting now' : `Starts in ${opts.settings.offsetMinutes} minutes`
      const where = s.room ? ` • ${s.room}` : ''
      showReminderNotification(`${prefix}: ${s.title}`, `${when}${where}`, s.id)
    }, delay)
    handles.push({ id: s.id, timeoutId })
    console.log(`[Reminders] Scheduled with timeoutId=${timeoutId}`)
  }
  console.log(`[Reminders] Total: ${handles.length} scheduled, ${skipped} skipped`)
  return { handles, skipped }
}

export function cancelScheduled(handles: ScheduledHandle[]) {
  for (const h of handles) window.clearTimeout(h.timeoutId)
}
