import { get, set, del } from 'idb-keyval'
import type { Session } from './normalizeSchedule'
import { addOrUpdateScheduleInLibrary, setLastActiveSchedule } from './scheduleLibrary'

export type ScheduleKey = string

/**
 * Stored schedule data (without user preferences).
 * User preferences (liked sessions, reminders) are stored separately
 * in userPreferences.ts to prevent data loss on schedule refresh.
 */
export type StoredSchedule = {
  key: ScheduleKey
  endpointUrl?: string
  sourceLabel?: string // e.g. file name
  conferenceTitle?: string
  conferenceTimeZoneName?: string
  fetchedAt: string // ISO
  sessions: Array<Omit<Session, 'start'> & { start: string }>
}

type Index = {
  activeKey?: ScheduleKey
  keys: ScheduleKey[]
}

const INDEX_KEY = 'schedules:index:v2'
const scheduleKeyPrefix = 'schedule:v2:'

function scheduleStorageKey(key: ScheduleKey) {
  return scheduleKeyPrefix + key
}

export function makeKeyFromUrl(url: string): ScheduleKey {
  return 'url:' + url
}

export function makeKeyFromFile(label: string): ScheduleKey {
  return 'file:' + label
}

export async function loadIndex(): Promise<Index> {
  const idx = (await get(INDEX_KEY)) as Index | undefined
  if (!idx?.keys) return { keys: [], activeKey: undefined }
  return idx
}

export async function saveIndex(idx: Index): Promise<void> {
  await set(INDEX_KEY, idx)
}

export async function loadSchedule(key: ScheduleKey): Promise<StoredSchedule | undefined> {
  try {
    return (await get(scheduleStorageKey(key))) as StoredSchedule | undefined
  } catch (error) {
    console.error('Failed to load schedule:', error)
    return undefined
  }
}

export async function saveSchedule(data: StoredSchedule): Promise<void> {
  try {
    const idx = await loadIndex()
    if (!idx.keys.includes(data.key)) idx.keys = [...idx.keys, data.key]
    idx.activeKey = data.key
    
    // Save schedule data
    await set(scheduleStorageKey(data.key), data)
    await saveIndex(idx)
    
    // Add/update in library with metadata
    await addOrUpdateScheduleInLibrary({
      key: data.key,
      endpointUrl: data.endpointUrl,
      sourceLabel: data.sourceLabel,
      conferenceTitle: data.conferenceTitle,
      conferenceTimeZoneName: data.conferenceTimeZoneName,
      lastFetchedAt: data.fetchedAt,
      sessionCount: data.sessions.length,
    })
    
    // Set as last active
    await setLastActiveSchedule(data.key)
  } catch (error) {
    console.error('Failed to save schedule:', error)
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded. Please clear some browser data.')
    }
    throw error
  }
}

/**
 * Delete a schedule from storage.
 * Note: This does NOT delete user preferences (liked sessions, reminders).
 * Use deleteUserPreferences() separately if needed.
 */
export async function deleteSchedule(key: ScheduleKey): Promise<void> {
  try {
    const idx = await loadIndex()
    idx.keys = idx.keys.filter(k => k !== key)
    if (idx.activeKey === key) {
      idx.activeKey = undefined
    }
    await Promise.all([del(scheduleStorageKey(key)), saveIndex(idx)])
  } catch (error) {
    console.error('Failed to delete schedule:', error)
  }
}

export async function setActiveKey(key: ScheduleKey | undefined): Promise<void> {
  const idx = await loadIndex()
  idx.activeKey = key
  if (key && !idx.keys.includes(key)) idx.keys = [...idx.keys, key]
  await saveIndex(idx)
}

export async function clearActiveKey(): Promise<void> {
  await setActiveKey(undefined)
}

export async function loadActiveSchedule(): Promise<StoredSchedule | undefined> {
  const idx = await loadIndex()
  if (!idx.activeKey) return undefined
  return await loadSchedule(idx.activeKey)
}
