import type { ScheduleParser, CanonicalSchedule, CanonicalSession, FormatMetadata } from '../types'

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
    return content.trim().startsWith('BEGIN:VCALENDAR')
  }

  parse(content: string): CanonicalSchedule {
    const sessions: CanonicalSession[] = []
    let conferenceTitle: string | undefined
    let conferenceTimeZoneName: string | undefined

    // Parse iCal line by line
    const lines = this.unfoldLines(content)
    
    let currentEvent: Partial<CanonicalSession> | null = null
    let inEvent = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      // Parse VCALENDAR properties
      if (line.startsWith('X-WR-CALNAME')) {
        conferenceTitle = this.getValue(line)
      } else if (line.startsWith('X-WR-TIMEZONE')) {
        conferenceTimeZoneName = this.getValue(line)
      }

      // Event boundaries
      if (line === 'BEGIN:VEVENT') {
        inEvent = true
        currentEvent = {}
      } else if (line === 'END:VEVENT' && currentEvent) {
        if (currentEvent.title && currentEvent.start) {
          sessions.push(currentEvent as CanonicalSession)
        }
        currentEvent = null
        inEvent = false
      }

      // Parse event properties
      if (inEvent && currentEvent) {
        if (line.startsWith('UID:')) {
          currentEvent.id = this.getValue(line)
        } else if (line.startsWith('SUMMARY:')) {
          currentEvent.title = this.getValue(line)
        } else if (line.startsWith('DTSTART')) {
          const start = this.parseDate(line)
          if (start) {
            currentEvent.start = start
            currentEvent.dayKey = this.localDayKey(start)
          }
        } else if (line.startsWith('DTEND')) {
          const end = this.parseDate(line)
          if (end && currentEvent.start) {
            currentEvent.end = end
            currentEvent.durationMinutes = Math.round((end.getTime() - currentEvent.start.getTime()) / 60000)
          }
        } else if (line.startsWith('DURATION:')) {
          const duration = this.parseDuration(this.getValue(line))
          if (duration && currentEvent.start) {
            currentEvent.durationMinutes = duration
            currentEvent.end = new Date(currentEvent.start.getTime() + duration * 60000)
          }
        } else if (line.startsWith('LOCATION:')) {
          currentEvent.room = this.getValue(line)
        } else if (line.startsWith('DESCRIPTION:')) {
          currentEvent.description = this.getValue(line)
        } else if (line.startsWith('URL:')) {
          currentEvent.url = this.getValue(line)
        } else if (line.startsWith('CATEGORIES:')) {
          const categories = this.getValue(line).split(',').map(c => c.trim()).filter(Boolean)
          if (categories.length) {
            currentEvent.track = categories[0]
            if (categories.length > 1) {
              currentEvent.tags = categories
            }
          }
        } else if (line.startsWith('ATTENDEE')) {
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

  private parseDate(line: string): Date | null {
    // Extract date value
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) return null
    
    const dateStr = line.substring(colonIndex + 1)
    
    // Check for TZID parameter (currently ignored; dates are parsed as UTC or local based on "Z" suffix)
    
    // Parse different iCal date formats
    // Format: 20250625T140000Z (UTC)
    // Format: 20250625T140000 (local or with TZID)
    // Format: 20250625 (date only)
    
    if (dateStr.includes('T')) {
      const isUTC = dateStr.endsWith('Z')
      const cleanDate = dateStr.replace('Z', '')
      
      const year = parseInt(cleanDate.substring(0, 4), 10)
      const month = parseInt(cleanDate.substring(4, 6), 10) - 1
      const day = parseInt(cleanDate.substring(6, 8), 10)
      const hour = parseInt(cleanDate.substring(9, 11), 10) || 0
      const minute = parseInt(cleanDate.substring(11, 13), 10) || 0
      const second = parseInt(cleanDate.substring(13, 15), 10) || 0
      
      if (isUTC) {
        return new Date(Date.UTC(year, month, day, hour, minute, second))
      } else {
        return new Date(year, month, day, hour, minute, second)
      }
    } else {
      // Date only
      const year = parseInt(dateStr.substring(0, 4), 10)
      const month = parseInt(dateStr.substring(4, 6), 10) - 1
      const day = parseInt(dateStr.substring(6, 8), 10)
      
      return new Date(year, month, day)
    }
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

  private localDayKey(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${da}`
  }
}
