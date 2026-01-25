import type { ScheduleParser, CanonicalSchedule, CanonicalSession, FormatMetadata } from '../types'

/**
 * Parser for XCal (XML iCalendar) format
 */
export class XCalParser implements ScheduleParser {
  readonly format: FormatMetadata = {
    id: 'xcal-frab',
    label: 'XCal (frab compatible)',
    extensions: ['xcal', 'xcs'],
    mimeTypes: ['application/calendar+xml'],
    description: 'XCal (XML-based iCalendar) format'
  }

  canParse(content: string): boolean {
    const normalized = content.toLowerCase()
    return content.trim().startsWith('<?xml') && (normalized.includes('<icalendar') || normalized.includes('<vcalendar'))
  }

  parse(content: string): CanonicalSchedule {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'application/xml')

    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      throw new Error('XML parsing failed: ' + parseError.textContent)
    }

    const sessions: CanonicalSession[] = []
    let conferenceTitle: string | undefined
    let conferenceTimeZoneName: string | undefined

    // Parse VCALENDAR properties
    const vcalendar = doc.querySelector('vcalendar')
    if (!vcalendar) {
      throw new Error('No vcalendar element found in XCal')
    }

    // Get conference name from X-WR-CALNAME if available
    const calNameEl = vcalendar.querySelector('x-wr-calname')
    if (calNameEl) {
      conferenceTitle = calNameEl.textContent?.trim() || undefined
    }

    // Get timezone from X-WR-TIMEZONE if available
    const tzEl = vcalendar.querySelector('x-wr-timezone')
    if (tzEl) {
      conferenceTimeZoneName = tzEl.textContent?.trim() || undefined
    }

    // Parse VEVENT components
    const events = vcalendar.querySelectorAll('vevent')
    for (const event of Array.from(events)) {
      const session = this.parseEvent(event, conferenceTimeZoneName)
      if (session) {
        sessions.push(session)
      }
    }

    sessions.sort((a, b) => a.start.getTime() - b.start.getTime())

    return {
      sessions,
      conferenceTitle,
      conferenceTimeZoneName,
    }
  }

  private parseEvent(event: Element, defaultTz?: string): CanonicalSession | null {
    // Get SUMMARY (title)
    const summary = event.querySelector('summary')?.textContent?.trim()
    if (!summary) return null

    // Get DTSTART (start date/time)
    const dtstart = event.querySelector('dtstart')?.textContent?.trim()
    if (!dtstart) return null

    const start = this.parseDateTime(dtstart)
    if (!start || Number.isNaN(start.getTime())) return null

    // Get UID (unique identifier)
    const uid = event.querySelector('uid')?.textContent?.trim() || `${summary}|${start.toISOString()}`

    // Get DTEND or DURATION
    let end: Date | undefined
    let durationMinutes: number | undefined

    const dtend = event.querySelector('dtend')?.textContent?.trim()
    if (dtend) {
      const endDate = this.parseDateTime(dtend)
      if (endDate && !Number.isNaN(endDate.getTime())) {
        end = endDate
        durationMinutes = Math.round((endDate.getTime() - start.getTime()) / 60000)
      }
    } else {
      const duration = event.querySelector('duration')?.textContent?.trim()
      if (duration) {
        durationMinutes = this.parseDuration(duration)
        if (durationMinutes) {
          end = new Date(start.getTime() + durationMinutes * 60000)
        }
      }
    }

    // Get LOCATION (room)
    const location = event.querySelector('location')?.textContent?.trim() || undefined

    // Get DESCRIPTION
    const description = event.querySelector('description')?.textContent?.trim() || undefined

    // Get URL
    const url = event.querySelector('url')?.textContent?.trim() || undefined

    // Get LANGUAGE (pentabarf:language or pentabarf:language-code)
    let language = event.querySelector('pentabarf\\:language')?.textContent?.trim()
    if (!language) {
      language = event.querySelector('pentabarf\\:language-code')?.textContent?.trim()
    }

    // Get ATTENDEES (speakers)
    const speakers: string[] = []
    const attendeeEls = event.querySelectorAll('attendee')
    for (const attendee of Array.from(attendeeEls)) {
      const name = attendee.textContent?.trim()
      if (name) speakers.push(name)
    }

    // Get CATEGORY (type of session)
    const category = event.querySelector('category')?.textContent?.trim() || undefined

    // Get CATEGORIES (track - usually from categories element)
    const categories: string[] = []
    const categoryEls = event.querySelectorAll('categories')
    for (const cat of Array.from(categoryEls)) {
      const val = cat.textContent?.trim()
      if (val) categories.push(val)
    }

    return {
      id: uid,
      title: summary,
      start,
      end,
      dayKey: this.localDayKey(start),
      room: location,
      track: categories[0], // Use first category as track
      type: category,
      language,
      speakers: speakers.length > 0 ? speakers : undefined,
      tags: categories.length > 1 ? categories : undefined,
      durationMinutes,
      description,
      url,
    }
  }

  private parseDuration(duration: string): number | undefined {
    // Parse ISO 8601 duration format (e.g., PT1H30M, PT45M)
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return undefined

    const hours = parseInt(match[1] || '0', 10)
    const minutes = parseInt(match[2] || '0', 10)
    const seconds = parseInt(match[3] || '0', 10)

    return hours * 60 + minutes + Math.round(seconds / 60)
  }

  private localDayKey(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${da}`
  }

  /**
   * Parse iCal datetime format: 20260201T090000 or 20260201T090000Z
   */
  private parseDateTime(dtString: string): Date | null {
    // Try standard Date parsing first
    const standardDate = new Date(dtString)
    if (!Number.isNaN(standardDate.getTime())) {
      return standardDate
    }

    // Parse iCal format: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
    const match = dtString.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
    if (!match) return null

    const [, year, month, day, hour, minute, second, isUTC] = match
    
    if (isUTC) {
      return new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      ))
    } else {
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      )
    }
  }
}
