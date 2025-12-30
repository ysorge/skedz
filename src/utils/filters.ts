import type { Session } from '../data/normalizeSchedule'
import { MAX_SEARCH_QUERY_LENGTH } from './constants'

export type Filters = {
  track: string | 'ALL'
  day: string | 'ALL'
  room: string | 'ALL'
  type: string | 'ALL'
  language: string | 'ALL'
  q: string
}

export const DEFAULT_FILTERS: Filters = {
  track: 'ALL',
  day: 'ALL',
  room: 'ALL',
  type: 'ALL',
  language: 'ALL',
  q: '',
}

export function applyFilters(sessions: Session[], f: Filters): Session[] {
  // Sanitize and limit search query to prevent performance issues
  const q = f.q.trim().toLowerCase().slice(0, MAX_SEARCH_QUERY_LENGTH)

  return sessions.filter(s => {
    if (f.track !== 'ALL' && (s.track ?? '') !== f.track) return false
    if (f.day !== 'ALL' && s.dayKey !== f.day) return false
    if (f.room !== 'ALL' && (s.room ?? '') !== f.room) return false
    if (f.type !== 'ALL' && (s.type ?? '') !== f.type) return false
    if (f.language !== 'ALL' && (s.language ?? '') !== f.language) return false

    if (q) {
      const hay = [
        s.title,
        s.room,
        s.track,
        s.type,
        s.language,
        s.abstract,
        s.description,
        ...(s.speakers ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }

    return true
  })
}

export function uniqSorted(values: Array<string | undefined | null>): string[] {
  const set = new Set(values.filter(v => v && v.trim()).map(v => v!.trim()))
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}
