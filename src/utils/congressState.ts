import type { Session } from '../data/normalizeSchedule'

/**
 * Determine if a congress is currently running.
 * Congress is running if there's at least one session that hasn't ended yet.
 */
export function isCongressRunning(sessions: Session[]): boolean {
  if (!sessions.length) return false
  const now = Date.now()
  return sessions.some(s => getSessionEndTime(s) > now)
}

/**
 * Determine if a congress is completely over.
 * Congress is over when all sessions have ended.
 */
export function isCongressOver(sessions: Session[]): boolean {
  if (!sessions.length) return true
  const now = Date.now()
  return sessions.every(s => getSessionEndTime(s) <= now)
}

/**
 * Check if a session is currently running.
 * A session is current if now is between start time and end time.
 */
export function isSessionCurrent(session: Session): boolean {
  const now = Date.now()
  const start = session.start.getTime()
  const end = getSessionEndTime(session)
  return now >= start && now < end
}

/**
 * Check if a session is in the past (already ended).
 */
export function isSessionPast(session: Session): boolean {
  const now = Date.now()
  const end = getSessionEndTime(session)
  return end <= now
}

/**
 * Check if a session is upcoming (hasn't started yet).
 */
export function isSessionUpcoming(session: Session): boolean {
  const now = Date.now()
  const start = session.start.getTime()
  return start > now
}

/**
 * Get the end time of a session in milliseconds.
 * Uses duration if available, otherwise assumes 30 minutes.
 */
function getSessionEndTime(session: Session): number {
  const durationMs = (session.durationMinutes ?? 30) * 60 * 1000
  return session.start.getTime() + durationMs
}

/**
 * Count how many sessions are in the past.
 */
export function countPastSessions(sessions: Session[]): number {
  return sessions.filter(isSessionPast).length
}
