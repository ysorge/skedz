import { get, set } from 'idb-keyval'
import type { ScheduleKey } from './storage'

/**
 * Schedule metadata stored in the library.
 * This persists even when schedule session data is deleted,
 * allowing users to see their schedule history and reload schedules.
 */
export type ScheduleMetadata = {
  key: ScheduleKey
  endpointUrl?: string
  sourceLabel?: string
  conferenceTitle?: string
  conferenceTimeZoneName?: string
  addedAt: string // ISO timestamp when first added
  lastAccessedAt: string // ISO timestamp when last opened
  lastFetchedAt?: string // ISO timestamp when data was last fetched
  sessionCount?: number // Number of sessions (for display)
}

export type ScheduleLibrary = {
  schedules: ScheduleMetadata[]
  lastActiveKey?: ScheduleKey
}

const LIBRARY_KEY = 'scheduleLibrary:v1'

/**
 * Load the schedule library (history of all schedules)
 */
export async function loadScheduleLibrary(): Promise<ScheduleLibrary> {
  try {
    const library = (await get(LIBRARY_KEY)) as ScheduleLibrary | undefined
    if (library?.schedules) {
      return library
    }
  } catch (error) {
    console.error('Failed to load schedule library:', error)
  }

  return {
    schedules: [],
    lastActiveKey: undefined,
  }
}

/**
 * Save the schedule library
 */
export async function saveScheduleLibrary(library: ScheduleLibrary): Promise<void> {
  try {
    await set(LIBRARY_KEY, library)
  } catch (error) {
    console.error('Failed to save schedule library:', error)
    throw error
  }
}

/**
 * Add or update a schedule in the library
 */
export async function addOrUpdateScheduleInLibrary(metadata: Omit<ScheduleMetadata, 'addedAt' | 'lastAccessedAt'>): Promise<void> {
  const library = await loadScheduleLibrary()
  
  const existingIndex = library.schedules.findIndex(s => s.key === metadata.key)
  const now = new Date().toISOString()
  
  if (existingIndex >= 0) {
    // Update existing
    library.schedules[existingIndex] = {
      ...library.schedules[existingIndex],
      ...metadata,
      lastAccessedAt: now,
    }
  } else {
    // Add new
    library.schedules.push({
      ...metadata,
      addedAt: now,
      lastAccessedAt: now,
    })
  }
  
  // Sort by last accessed (most recent first)
  library.schedules.sort((a, b) => 
    new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
  )
  
  await saveScheduleLibrary(library)
}

/**
 * Remove a schedule from the library
 */
export async function removeScheduleFromLibrary(key: ScheduleKey): Promise<void> {
  const library = await loadScheduleLibrary()
  library.schedules = library.schedules.filter(s => s.key !== key)
  
  // Clear lastActiveKey if it was the removed schedule
  if (library.lastActiveKey === key) {
    library.lastActiveKey = undefined
  }
  
  await saveScheduleLibrary(library)
}

/**
 * Update the last active schedule key
 */
export async function setLastActiveSchedule(key: ScheduleKey): Promise<void> {
  const library = await loadScheduleLibrary()
  library.lastActiveKey = key
  
  // Update lastAccessedAt for this schedule
  const schedule = library.schedules.find(s => s.key === key)
  if (schedule) {
    schedule.lastAccessedAt = new Date().toISOString()
    
    // Re-sort by last accessed
    library.schedules.sort((a, b) => 
      new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
    )
  }
  
  await saveScheduleLibrary(library)
}

/**
 * Clear the last active schedule (when user clicks "Change source")
 */
export async function clearLastActiveSchedule(): Promise<void> {
  const library = await loadScheduleLibrary()
  library.lastActiveKey = undefined
  await saveScheduleLibrary(library)
}

/**
 * Get schedule metadata by key
 */
export async function getScheduleMetadata(key: ScheduleKey): Promise<ScheduleMetadata | undefined> {
  const library = await loadScheduleLibrary()
  return library.schedules.find(s => s.key === key)
}

/**
 * Get the last active schedule metadata
 */
export async function getLastActiveScheduleMetadata(): Promise<ScheduleMetadata | undefined> {
  const library = await loadScheduleLibrary()
  if (!library.lastActiveKey) return undefined
  return library.schedules.find(s => s.key === library.lastActiveKey)
}
