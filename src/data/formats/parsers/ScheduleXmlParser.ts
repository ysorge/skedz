import type {
  ScheduleParser,
  CanonicalSchedule,
  CanonicalSession,
  FormatMetadata,
  ScheduleParseOptions,
  ScheduleImportIssue,
} from '../types'
import { parseScheduleDateTime, scheduleDateTimeHasExplicitOffset } from '../parseDateTime'
import { canonicalizeTimeZone } from '../../../utils/importParams'

/**
 * XML (frab-compatible / schedule.xml) format
 * used by Frab, Pretalx, Pentabarf, and others
 */
export class ScheduleXmlParser implements ScheduleParser {
  readonly format: FormatMetadata = {
    id: 'schedule-xml',
    label: 'XML (Frab / Pentabarf / Pretalx)',
    extensions: ['xml'],
    mimeTypes: ['application/xml', 'text/xml'],
    description: 'schedule.xml format used by Frab, Pretalx, and Pentabarf'
  }

  canParse(content: string): boolean {
    const trimmed = content.trim()
    return trimmed.startsWith('<?xml') && /<\s*schedule\b/i.test(trimmed)
  }

  parse(content: string, options?: ScheduleParseOptions): CanonicalSchedule {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'application/xml')

    // Check for parse errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      throw new Error('XML parsing failed: ' + parseError.textContent)
    }

    const scheduleEl = doc.querySelector('schedule')
    if (!scheduleEl) {
      throw new Error('No <schedule> element found in XML')
    }

    const conferenceEl = scheduleEl.querySelector('conference')
    const sessions: CanonicalSession[] = []
    const importIssues: ScheduleImportIssue[] = []
    const parseState = { requiresTimeZone: false }

    // Parse conference metadata
    const conferenceTitle = conferenceEl?.querySelector('title')?.textContent || undefined
    const conferenceTimeZoneName = canonicalizeTimeZone(options?.timeZone)
      ?? canonicalizeTimeZone(conferenceEl?.querySelector('time_zone_name')?.textContent)
    const conferenceStartStr = conferenceEl?.querySelector('start')?.textContent || undefined
    const conferenceEndStr = conferenceEl?.querySelector('end')?.textContent || undefined
    const conferenceStart = parseScheduleDateTime(conferenceStartStr, conferenceTimeZoneName)
    const conferenceEnd = parseScheduleDateTime(conferenceEndStr, conferenceTimeZoneName)

    // Parse days
    const days = scheduleEl.querySelectorAll('day')
    for (const day of Array.from(days)) {
      const dayDate = day.getAttribute('date') || undefined

      // Parse rooms
      const rooms = day.querySelectorAll('room')
      for (const room of Array.from(rooms)) {
        const roomName = room.getAttribute('name') || undefined

        // Parse events
        const events = room.querySelectorAll('event')
        for (const event of Array.from(events)) {
          const session = this.parseEvent(
            event,
            roomName,
            dayDate,
            conferenceTimeZoneName,
            importIssues,
            parseState
          )
          if (session) {
            sessions.push(session)
          }
        }
      }
    }

    sessions.sort((a, b) => a.start.getTime() - b.start.getTime())

    return {
      sessions,
      conferenceTitle,
      conferenceTimeZoneName,
      conferenceStart,
      conferenceEnd,
      requiresTimeZoneForParsing: parseState.requiresTimeZone,
      importIssues,
    }
  }

  private parseEvent(
    event: Element,
    roomName: string | undefined,
    dayDate: string | undefined,
    timeZone: string | undefined,
    importIssues: ScheduleImportIssue[],
    parseState: { requiresTimeZone: boolean }
  ): CanonicalSession | null {
    const title = event.querySelector('title')?.textContent?.trim()
    if (!title) return null

    const dateStr = event.querySelector('date')?.textContent?.trim()
    const startStr = event.querySelector('start')?.textContent?.trim()

    let start: Date | null = null
    let rawStart: string | undefined
    if (dateStr) {
      rawStart = dateStr
      if (!timeZone && !scheduleDateTimeHasExplicitOffset(rawStart)) parseState.requiresTimeZone = true
      start = parseScheduleDateTime(dateStr, timeZone) ?? null
    } else if (dayDate && startStr) {
      rawStart = `${dayDate}T${startStr}`
      if (!timeZone && !scheduleDateTimeHasExplicitOffset(rawStart)) parseState.requiresTimeZone = true
      start = parseScheduleDateTime(rawStart, timeZone) ?? null
    }

    if (!start) {
      if (importIssues.length < 50) {
        importIssues.push({
          code: 'invalid-start',
          message: 'The start time could not be interpreted; this session was skipped.',
          sessionTitle: title,
          rawValue: rawStart?.slice(0, 200),
        })
      }
      return null
    }

    const id = event.getAttribute('id') || event.getAttribute('guid') || `${title}|${start.toISOString()}|${roomName || ''}`
    const durationStr = event.querySelector('duration')?.textContent?.trim()
    const durationMinutes = this.parseDuration(durationStr)
    const end = durationMinutes ? new Date(start.getTime() + durationMinutes * 60000) : undefined

    const speakers: string[] = []
    const persons = event.querySelectorAll('persons person')
    for (const person of Array.from(persons)) {
      const name = person.textContent?.trim()
      if (name) speakers.push(name)
    }

    return {
      id,
      title,
      start,
      end,
      dayKey: dayDate || this.localDayKey(start),
      room: roomName,
      track: event.querySelector('track')?.textContent?.trim() || undefined,
      type: event.querySelector('type')?.textContent?.trim() || undefined,
      language: event.querySelector('language')?.textContent?.trim() || undefined,
      durationMinutes,
      abstract: event.querySelector('abstract')?.textContent?.trim() || undefined,
      description: event.querySelector('description')?.textContent?.trim() || undefined,
      subtitle: event.querySelector('subtitle')?.textContent?.trim() || undefined,
      url: event.querySelector('url')?.textContent?.trim() || undefined,
      speakers: speakers.length ? speakers : undefined,
    }
  }

  private parseDuration(s: string | null | undefined): number | undefined {
    if (!s) return undefined
    const m = s.trim()
    const hhmm = m.match(/^(\d+):(\d{2})$/)
    if (hhmm) {
      const hh = Number(hhmm[1])
      const mm = Number(hhmm[2])
      if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm
    }
    const asNum = Number(m)
    if (Number.isFinite(asNum)) return asNum
    return undefined
  }

  private localDayKey(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${da}`
  }
}
