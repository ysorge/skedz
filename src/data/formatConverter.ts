import type { CanonicalSession, CanonicalSchedule, ScheduleImportIssue } from './formats/types'
import type { Session } from './normalizeSchedule'

/**
 * Convert canonical format to the Session format used by the app
 * This allows us to maintain backward compatibility while using the new format system
 */
export function canonicalToSession(canonical: CanonicalSession): Session {
  return {
    id: canonical.id,
    title: canonical.title,
    start: canonical.start,
    dayKey: canonical.dayKey,
    room: canonical.room,
    track: canonical.track,
    type: canonical.type,
    language: canonical.language,
    durationMinutes: canonical.durationMinutes,
    abstract: canonical.abstract,
    description: canonical.description,
    speakers: canonical.speakers,
  }
}

/**
 * Convert canonical schedule to the format expected by the app
 */
export function canonicalScheduleToAppFormat(canonical: CanonicalSchedule): {
  sessions: Session[]
  conferenceTitle?: string
  conferenceTimeZoneName?: string
  requiresTimeZoneForParsing: boolean
  importIssues: ScheduleImportIssue[]
} {
  return {
    sessions: canonical.sessions.map(canonicalToSession),
    conferenceTitle: canonical.conferenceTitle,
    conferenceTimeZoneName: canonical.conferenceTimeZoneName,
    requiresTimeZoneForParsing: canonical.requiresTimeZoneForParsing ?? false,
    importIssues: canonical.importIssues ?? [],
  }
}
