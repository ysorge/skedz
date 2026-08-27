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
import { getDayKeyInTimeZone } from '../../../utils/date'

/**
 * Parser for iCalendar (.ics / .ical) format
 */
export class ICalParser implements ScheduleParser {
  readonly format: FormatMetadata = {
    id: 'ical',
    label: 'iCal',
    extensions: ['ical', 'ics'],
    mimeTypes: ['text/calendar'],
    description: 'iCalendar format (.ics)'
  }

  canParse(content: string): boolean {
    return content.trim().toUpperCase().startsWith('BEGIN:VCALENDAR')
  }

  parse(content: string, options?: ScheduleParseOptions): CanonicalSchedule {
    const sessions: CanonicalSession[] = []
    const importIssues: ScheduleImportIssue[] = []
    let conferenceTitle: string | undefined
    let conferenceTimeZoneName: string | undefined
    let requiresTimeZoneForParsing = false

    // Parse iCal line by line
    const lines = this.unfoldLines(content)
    const declaredTimeZone = canonicalizeTimeZone(
      lines.find(line => line.trim().toUpperCase().startsWith('X-WR-TIMEZONE'))?.split(':').slice(1).join(':')
    )
    const eventTimeZones = new Set(
      lines
        .filter(line => line.trim().toUpperCase().startsWith('DTSTART'))
        .map(line => this.getPropertyTimeZone(line))
        .filter((value): value is string => Boolean(value))
    )
    const consistentEventTimeZone = eventTimeZones.size === 1 ? [...eventTimeZones][0] : undefined
    conferenceTimeZoneName = canonicalizeTimeZone(options?.timeZone)
      ?? declaredTimeZone
      ?? consistentEventTimeZone
    
    let currentEvent: Partial<CanonicalSession> | null = null
    let currentStartIssue: ScheduleImportIssue | null = null
    let currentEndIssue: ScheduleImportIssue | null = null
    let inEvent = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const upperLine = line.toUpperCase()

      // Parse VCALENDAR properties
      if (upperLine.startsWith('X-WR-CALNAME')) {
        conferenceTitle = this.getValue(line)
      }

      // Event boundaries
      if (upperLine === 'BEGIN:VEVENT') {
        inEvent = true
        currentEvent = {}
        currentStartIssue = null
        currentEndIssue = null
      } else if (upperLine === 'END:VEVENT' && currentEvent) {
        if (currentEvent.title && currentEvent.start) {
          sessions.push(currentEvent as CanonicalSession)
        } else if (currentEvent.title && !currentEvent.start) {
          this.addIssue(importIssues, currentStartIssue ?? {
            code: 'invalid-start',
            message: 'Session has no usable DTSTART value and was skipped.',
          }, currentEvent.title)
        }
        if (currentEndIssue) this.addIssue(importIssues, currentEndIssue, currentEvent.title)
        currentEvent = null
        currentStartIssue = null
        currentEndIssue = null
        inEvent = false
      }

      // Parse event properties
      if (inEvent && currentEvent) {
        if (upperLine.startsWith('UID:')) {
          currentEvent.id = this.getValue(line)
        } else if (upperLine.startsWith('SUMMARY:')) {
          currentEvent.title = this.getValue(line)
        } else if (upperLine.startsWith('DTSTART')) {
          const rawValue = this.getValue(line)
          const rawTimeZone = this.getPropertyTimeZoneId(line)
          const propertyTimeZone = canonicalizeTimeZone(rawTimeZone)
          if (!rawTimeZone && !scheduleDateTimeHasExplicitOffset(rawValue) && !conferenceTimeZoneName) {
            requiresTimeZoneForParsing = true
          }
          if (rawTimeZone && !propertyTimeZone) {
            currentStartIssue = {
              code: 'unsupported-time-zone',
              message: `Unsupported TZID "${rawTimeZone}"; this session was skipped.`,
              rawValue,
            }
            continue
          }
          const start = parseScheduleDateTime(rawValue, propertyTimeZone ?? conferenceTimeZoneName)
          if (start) {
            currentEvent.start = start
            currentEvent.dayKey = getDayKeyInTimeZone(
              start,
              propertyTimeZone ?? conferenceTimeZoneName
            )
          } else {
            currentStartIssue = {
              code: 'invalid-start',
              message: 'The DTSTART value could not be interpreted; this session was skipped.',
              rawValue,
            }
          }
        } else if (upperLine.startsWith('DTEND')) {
          const rawValue = this.getValue(line)
          const rawTimeZone = this.getPropertyTimeZoneId(line)
          const propertyTimeZone = canonicalizeTimeZone(rawTimeZone)
          const end = rawTimeZone && !propertyTimeZone
            ? undefined
            : parseScheduleDateTime(rawValue, propertyTimeZone ?? conferenceTimeZoneName)
          if (end && currentEvent.start) {
            currentEvent.end = end
            currentEvent.durationMinutes = Math.round((end.getTime() - currentEvent.start.getTime()) / 60000)
          } else if (!end) {
            currentEndIssue = {
              code: rawTimeZone && !propertyTimeZone ? 'unsupported-time-zone' : 'invalid-end',
              message: rawTimeZone && !propertyTimeZone
                ? `Unsupported DTEND TZID "${rawTimeZone}"; the session was imported without an end time.`
                : 'The DTEND value could not be interpreted; the session was imported without an end time.',
              rawValue,
            }
          }
        } else if (upperLine.startsWith('DURATION:')) {
          const duration = this.parseDuration(this.getValue(line))
          if (duration && currentEvent.start) {
            currentEvent.durationMinutes = duration
            currentEvent.end = new Date(currentEvent.start.getTime() + duration * 60000)
          }
        } else if (upperLine.startsWith('LOCATION:')) {
          currentEvent.room = this.getValue(line)
        } else if (upperLine.startsWith('DESCRIPTION:')) {
          currentEvent.description = this.getValue(line)
        } else if (upperLine.startsWith('URL:')) {
          currentEvent.url = this.getValue(line)
        } else if (upperLine.startsWith('CATEGORIES:')) {
          const categories = this.getValue(line).split(',').map(c => c.trim()).filter(Boolean)
          if (categories.length) {
            currentEvent.track = categories[0]
            if (categories.length > 1) {
              currentEvent.tags = categories
            }
          }
        } else if (upperLine.startsWith('ATTENDEE')) {
          // Extract speaker name from ATTENDEE;...;CN="Name":...
          const speaker = this.extractAttendee(line)
          if (speaker) {
            if (!currentEvent.speakers) {
              currentEvent.speakers = []
            }
            currentEvent.speakers.push(speaker)
          }
        }
      }
    }

    // Ensure all sessions have required fields
    const validSessions = sessions.filter(s => s.id && s.title && s.start && s.dayKey)
    validSessions.sort((a, b) => a.start.getTime() - b.start.getTime())

    return {
      sessions: validSessions,
      conferenceTitle,
      conferenceTimeZoneName,
      requiresTimeZoneForParsing,
      importIssues,
    }
  }

  private unfoldLines(content: string): string[] {
    // iCal lines can be folded (continued on next line with space)
    const lines = content.split(/\r?\n/)
    const unfolded: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]
      
      // Check if next line is a continuation (starts with space or tab)
      while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1])) {
        i++
        line += lines[i].substring(1) // Remove leading space
      }
      
      unfolded.push(line)
    }
    
    return unfolded
  }

  private getValue(line: string): string {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) return ''
    
    let value = line.substring(colonIndex + 1)
    
    // Unescape iCal text
    value = value.replace(/\\n/g, '\n')
    value = value.replace(/\\,/g, ',')
    value = value.replace(/\\;/g, ';')
    value = value.replace(/\\\\/g, '\\')
    
    return value.trim()
  }

  /**
   * Extract attendee name from ATTENDEE field
   * Format: ATTENDEE;ROLE=...;CN="Name":...
   */
  private extractAttendee(line: string): string | null {
    // Look for CN= parameter which contains the common name
    const cnMatch = line.match(/;CN="?([^":;]+)"?/i)
    if (cnMatch) {
      return cnMatch[1].trim()
    }
    return null
  }

  private getPropertyTimeZoneId(line: string): string | undefined {
    const property = line.slice(0, line.indexOf(':') === -1 ? line.length : line.indexOf(':'))
    const match = property.match(/(?:^|;)TZID=(?:"([^"]+)"|([^;:]+))/i)
    return (match?.[1] ?? match?.[2])?.trim() || undefined
  }

  private getPropertyTimeZone(line: string): string | undefined {
    return canonicalizeTimeZone(this.getPropertyTimeZoneId(line))
  }

  private addIssue(
    issues: ScheduleImportIssue[],
    issue: ScheduleImportIssue,
    sessionTitle?: string
  ) {
    if (issues.length >= 50) return
    issues.push({
      ...issue,
      sessionTitle: sessionTitle || issue.sessionTitle,
      rawValue: issue.rawValue?.slice(0, 200),
    })
  }

  private parseDuration(duration: string): number | undefined {
    // Parse ISO 8601 duration format (e.g., PT1H30M, PT45M, P1D)
    const match = duration.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return undefined

    const days = parseInt(match[1] || '0', 10)
    const hours = parseInt(match[2] || '0', 10)
    const minutes = parseInt(match[3] || '0', 10)
    const seconds = parseInt(match[4] || '0', 10)

    return days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60)
  }

}
