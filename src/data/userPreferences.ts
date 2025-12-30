import { get, set, del } from 'idb-keyval'

/**
 * User preferences stored independently from schedule data.
 * This ensures liked sessions and reminder settings persist even when
 * schedule data is refreshed or deleted.
 */

export type UserPreferences = {
  likedSessionIds: string[]
  reminderSettings: {
    enabled: boolean
    offsetMinutes: 0 | 10
  }
}

export type ScheduleUserPreferences = {
  scheduleKey: string
  preferences: UserPreferences
}

const USER_PREFS_KEY = 'userPreferences:v1:'

function makePreferencesKey(scheduleKey: string): string {
  return USER_PREFS_KEY + scheduleKey
}

/**
 * Load user preferences for a specific schedule.
 * Returns default preferences if none exist.
 */
export async function loadUserPreferences(scheduleKey: string): Promise<UserPreferences> {
  try {
    const stored = (await get(makePreferencesKey(scheduleKey))) as UserPreferences | undefined
    if (stored) {
      return {
        likedSessionIds: Array.isArray(stored.likedSessionIds) ? stored.likedSessionIds : [],
        reminderSettings: {
          enabled: Boolean(stored.reminderSettings?.enabled),
          offsetMinutes: stored.reminderSettings?.offsetMinutes === 0 ? 0 : 10,
        },
      }
    }
  } catch (error) {
    console.error('Failed to load user preferences:', error)
  }

  return {
    likedSessionIds: [],
    reminderSettings: {
      enabled: true, // Changed: default to true
      offsetMinutes: 10, // Already 10, which is correct
    },
  }
}

/**
 * Save user preferences for a specific schedule.
 * This operation is independent of schedule data storage.
 */
export async function saveUserPreferences(scheduleKey: string, preferences: UserPreferences): Promise<void> {
  try {
    await set(makePreferencesKey(scheduleKey), {
      likedSessionIds: preferences.likedSessionIds,
      reminderSettings: {
        enabled: preferences.reminderSettings.enabled,
        offsetMinutes: preferences.reminderSettings.offsetMinutes,
      },
    })
  } catch (error) {
    console.error('Failed to save user preferences:', error)
    // Attempt to recover by clearing corrupted data
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded. Please clear some browser data.')
    }
    throw error
  }
}

/**
 * Delete user preferences for a specific schedule.
 * Useful for cleanup when a schedule is permanently removed.
 */
export async function deleteUserPreferences(scheduleKey: string): Promise<void> {
  try {
    await del(makePreferencesKey(scheduleKey))
  } catch (error) {
    console.error('Failed to delete user preferences:', error)
  }
}

/**
 * Update only the liked sessions without affecting reminder settings.
 */
export async function updateLikedSessions(scheduleKey: string, likedSessionIds: string[]): Promise<void> {
  const prefs = await loadUserPreferences(scheduleKey)
  prefs.likedSessionIds = likedSessionIds
  await saveUserPreferences(scheduleKey, prefs)
}

/**
 * Update only the reminder settings without affecting liked sessions.
 */
export async function updateReminderSettings(
  scheduleKey: string,
  reminderSettings: { enabled: boolean; offsetMinutes: 0 | 10 }
): Promise<void> {
  const prefs = await loadUserPreferences(scheduleKey)
  prefs.reminderSettings = reminderSettings
  await saveUserPreferences(scheduleKey, prefs)
}
