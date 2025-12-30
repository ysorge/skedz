import { ScheduleSchema } from './schema'
import { normalizeSchedule, type Session } from './normalizeSchedule'

export async function fetchAndParseSchedule(
  url: string,
): Promise<{ sessions: Session[]; conferenceTitle?: string; conferenceTimeZoneName?: string }> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching schedule`)

  const json = await res.json()
  const parsed = ScheduleSchema.safeParse(json)

  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' | ')
    throw new Error('Schema validation failed: ' + msg)
  }

  const out = normalizeSchedule(parsed.data)
  if (out.sessions.length === 0) {
    throw new Error('Schedule loaded, but no sessions were found (unexpected format or empty schedule).')
  }

  return { sessions: out.sessions, conferenceTitle: out.conferenceTitle, conferenceTimeZoneName: out.conferenceTimeZoneName }
}
