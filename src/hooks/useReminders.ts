import { useState, useEffect, useCallback, useRef } from 'react'
import { loadUserPreferences, updateReminderSettings } from '../data/userPreferences'
import {
  cancelScheduled,
  ensureNotificationPermission,
  scheduleReminders,
  type ScheduledHandle,
} from '../utils/reminders'
import type { ScheduleKey } from '../data/storage'
import type { Session } from '../data/normalizeSchedule'

export type ReminderSettings = {
  enabled: boolean
  offsetMinutes: 0 | 10
}

/**
 * Custom hook for managing session reminders.
 * Handles notification permissions, scheduling, and persistence.
 */
export function useReminders(
  scheduleKey: ScheduleKey | undefined,
  likedSessions: Session[],
  sessions: Session[] | null
) {
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({
    enabled: true, 
    offsetMinutes: 10, 
  })
  const [reminderStatusText, setReminderStatusText] = useState<string | undefined>(undefined)
  const reminderHandlesRef = useRef<ScheduledHandle[]>([])

  const notificationSupport = {
    supported: typeof window !== 'undefined' && 'Notification' in window,
    permission:
      typeof window !== 'undefined' && 'Notification' in window
        ? Notification.permission
        : ('unsupported' as const),
  }

  // Load reminder settings when schedule key changes
  useEffect(() => {
    if (!scheduleKey) {
      setReminderSettings({ enabled: true, offsetMinutes: 10 }) 
      setReminderStatusText(undefined)
      return
    }

    let cancelled = false

    loadUserPreferences(scheduleKey).then(prefs => {
      if (!cancelled) {
        setReminderSettings(prefs.reminderSettings)
      }
    })

    return () => {
      cancelled = true
    }
  }, [scheduleKey])

  // Clean up reminders on unmount
  useEffect(() => {
    return () => {
      cancelScheduled(reminderHandlesRef.current)
      reminderHandlesRef.current = []
    }
  }, [])

  // Schedule reminders when settings or liked sessions change
  useEffect(() => {
    cancelScheduled(reminderHandlesRef.current)
    reminderHandlesRef.current = []
    setReminderStatusText(undefined)

    if (!sessions) return
    if (!notificationSupport.supported) return
    if (Notification.permission !== 'granted') return
    if (!reminderSettings.enabled) return
    if (likedSessions.length === 0) return

    console.log('[useReminders] Scheduling reminders effect triggered')
    const { handles, skipped } = scheduleReminders({
      likedSessions,
      settings: reminderSettings,
    })

    reminderHandlesRef.current = handles
    setReminderStatusText(
      `Scheduled ${handles.length} reminder(s).${
        skipped ? ` (${skipped} skipped: already started or >24h away.)` : ''
      } Keep app running in background.`
    )

    return () => cancelScheduled(handles)
  }, [likedSessions, reminderSettings.enabled, reminderSettings.offsetMinutes, notificationSupport.supported])

  // Persist reminder settings when they change
  useEffect(() => {
    if (!scheduleKey || !sessions) return

    updateReminderSettings(scheduleKey, reminderSettings).catch(error => {
      console.error('Failed to save reminder settings:', error)
    })
  }, [scheduleKey, sessions, reminderSettings])

  const requestPermission = useCallback(async () => {
    const result = await ensureNotificationPermission()
    if (result !== 'granted') {
      setReminderSettings(prev => ({ ...prev, enabled: false }))
      setReminderStatusText('Notifications are not enabled.')
    } else {
      setReminderStatusText('Notifications enabled. Keep the app open for reminders to fire.')
    }
  }, [])

  const updateSettings = useCallback((updates: Partial<ReminderSettings>) => {
    setReminderSettings(prev => ({ ...prev, ...updates }))
  }, [])

  return {
    reminderSettings,
    reminderStatusText,
    notificationSupport,
    updateSettings,
    requestPermission,
  }
}
