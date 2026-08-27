import type {
  ScheduleParser,
  CanonicalSchedule,
  CanonicalSession,
  FormatMetadata,
  ScheduleParseOptions,
  ScheduleImportIssue,
} from '../types'
import {
  normalizeScheduleDateTime,
  parseScheduleDateTime,
  scheduleDateTimeHasExplicitOffset,
} from '../parseDateTime'
import { canonicalizeTimeZone } from '../../../utils/importParams'
import { getDayKeyInTimeZone } from '../../../utils/date'

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
    return normalized.includes('<icalendar') || normalized.includes('<vcalendar')
  }

  parse(content: string, options?: ScheduleParseOptions): CanonicalSchedule {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'application/xml')

    const parseError = this.firstByLocalName(doc, 'parsererror')
    if (parseError) {
      throw new Error('XML parsing failed: ' + parseError.textContent)
    }

    const sessions: CanonicalSession[] = []
    const importIssues: ScheduleImportIssue[] = []
    let conferenceTitle: string | undefined
    let conferenceTimeZoneName: string | undefined
    const parseState = { requiresTimeZone: false }

    // Parse VCALENDAR properties
    const vcalendar = this.firstByLocalName(doc, 'vcalendar')
    if (!vcalendar) {
      throw new Error('No vcalendar element found in XCal')
    }

    // Get conference name from X-WR-CALNAME if available
    const calNameEl = this.firstByLocalName(vcalendar, 'x-wr-calname')
    if (calNameEl) {
      conferenceTitle = this.getPropertyValue(calNameEl)
    }

    // Get timezone from X-WR-TIMEZONE if available
    // Parse VEVENT components
    const events = this.allByLocalName(vcalendar, 'vevent')
    const tzEl = this.firstByLocalName(vcalendar, 'x-wr-timezone')
    const sourceTimeZone = canonicalizeTimeZone(this.getPropertyValue(tzEl))
    const eventTimeZones = new Set(
      events
        .map(event => this.getPropertyTimeZone(this.firstByLocalName(event, 'dtstart')))
        .filter((value): value is string => Boolean(value))
    )
    const consistentEventTimeZone = eventTimeZones.size === 1 ? [...eventTimeZones][0] : undefined
    conferenceTimeZoneName = canonicalizeTimeZone(options?.timeZone)
      ?? sourceTimeZone
      ?? consistentEventTimeZone

    for (const event of events) {
      const session = this.parseEvent(event, conferenceTimeZoneName, importIssues, parseState)
      if (session) {
        sessions.push(session)
      }
    }

    sessions.sort((a, b) => a.start.getTime() - b.start.getTime())

    return {
      sessions,
      conferenceTitle,
      conferenceTimeZoneName,
      requiresTimeZoneForParsing: parseState.requiresTimeZone,
      importIssues,
    }
  }

  private parseEvent(
    event: Element,
    defaultTz: string | undefined,
    importIssues: ScheduleImportIssue[],
    parseState: { requiresTimeZone: boolean }
  ): CanonicalSession | null {
    // Get SUMMARY (title)
    const summary = this.getPropertyValue(this.firstByLocalName(event, 'summary'))
    if (!summary) return null

    // Get DTSTART (start date/time)
    const dtstartElement = this.firstByLocalName(event, 'dtstart')
    const dtstart = this.getPropertyValue(dtstartElement)
    if (!dtstart) return null
    const rawStartTimeZone = this.getPropertyTimeZoneId(dtstartElement)
    const startTimeZone = canonicalizeTimeZone(rawStartTimeZone)
    const pentabarfStart = normalizeScheduleDateTime(this.getPentabarfValue(event, 'start'))
    const exactPentabarfStart = scheduleDateTimeHasExplicitOffset(pentabarfStart) ? pentabarfStart : undefined
    if (!rawStartTimeZone
      && !scheduleDateTimeHasExplicitOffset(dtstart)
      && !exactPentabarfStart
      && !defaultTz) {
      parseState.requiresTimeZone = true
    }

    if (rawStartTimeZone && !startTimeZone && !exactPentabarfStart) {
      this.addIssue(importIssues, {
        code: 'unsupported-time-zone',
        message: `Unsupported TZID "${rawStartTimeZone}"; this session was skipped.`,
        sessionTitle: summary,
        rawValue: dtstart,
      })
      return null
    }
    if (rawStartTimeZone && !startTimeZone && exactPentabarfStart) {
      this.addIssue(importIssues, {
        code: 'unsupported-time-zone',
        message: `Unsupported TZID "${rawStartTimeZone}"; the exact Pentabarf offset was used instead.`,
        sessionTitle: summary,
        rawValue: dtstart,
      })
    }

    const startSource = startTimeZone || scheduleDateTimeHasExplicitOffset(dtstart)
      ? dtstart
      : exactPentabarfStart ?? dtstart
    const start = parseScheduleDateTime(startSource, startTimeZone ?? defaultTz)
    if (!start || Number.isNaN(start.getTime())) {
      this.addIssue(importIssues, {
        code: 'invalid-start',
        message: 'The start time could not be interpreted; this session was skipped.',
        sessionTitle: summary,
        rawValue: startSource,
      })
      return null
    }

    // Get UID (unique identifier)
    const uid = this.getPropertyValue(this.firstByLocalName(event, 'uid')) || `${summary}|${start.toISOString()}`

    // Get DTEND or DURATION
    let end: Date | undefined
    let durationMinutes: number | undefined

    const dtendElement = this.firstByLocalName(event, 'dtend')
    const dtend = this.getPropertyValue(dtendElement)
    if (dtend) {
      const rawEndTimeZone = this.getPropertyTimeZoneId(dtendElement)
      const endTimeZone = canonicalizeTimeZone(rawEndTimeZone)
      const pentabarfEnd = normalizeScheduleDateTime(this.getPentabarfValue(event, 'end'))
      const exactPentabarfEnd = scheduleDateTimeHasExplicitOffset(pentabarfEnd) ? pentabarfEnd : undefined
      const endSource = endTimeZone || scheduleDateTimeHasExplicitOffset(dtend)
        ? dtend
        : exactPentabarfEnd ?? dtend
      const endDate = rawEndTimeZone && !endTimeZone && !exactPentabarfEnd
        ? undefined
        : parseScheduleDateTime(endSource, endTimeZone ?? defaultTz)
      if (endDate && !Number.isNaN(endDate.getTime())) {
        end = endDate
        durationMinutes = Math.round((endDate.getTime() - start.getTime()) / 60000)
      } else {
        this.addIssue(importIssues, {
          code: rawEndTimeZone && !endTimeZone ? 'unsupported-time-zone' : 'invalid-end',
          message: rawEndTimeZone && !endTimeZone
            ? `Unsupported DTEND TZID "${rawEndTimeZone}"; the session was imported without an end time.`
            : 'The end time could not be interpreted; the session was imported without an end time.',
          sessionTitle: summary,
          rawValue: endSource,
        })
      }
    } else {
      const duration = this.getPropertyValue(this.firstByLocalName(event, 'duration'))
      if (duration) {
        durationMinutes = this.parseDuration(duration)
        if (durationMinutes) {
          end = new Date(start.getTime() + durationMinutes * 60000)
        }
      }
    }

    // Get LOCATION (room)
    const location = this.getPropertyValue(this.firstByLocalName(event, 'location'))

    // Get DESCRIPTION
    const description = this.getPropertyValue(this.firstByLocalName(event, 'description'))

    // Get URL
    const url = this.getPropertyValue(this.firstByLocalName(event, 'url'))

    // Get LANGUAGE (pentabarf:language or pentabarf:language-code)
    let language = this.getPentabarfValue(event, 'language')
    if (!language) {
      language = this.getPentabarfValue(event, 'language-code')
    }

    // Get ATTENDEES (speakers)
    const speakers: string[] = []
    const attendeeEls = this.allByLocalName(event, 'attendee')
    for (const attendee of attendeeEls) {
      const name = this.getPropertyValue(attendee)
      if (name) speakers.push(name)
    }

    // Get CATEGORY (type of session)
    const category = this.getPropertyValue(this.firstByLocalName(event, 'category'))

    // Get CATEGORIES (track - usually from categories element)
    const categories: string[] = []
    const categoryEls = this.allByLocalName(event, 'categories')
    for (const cat of categoryEls) {
      const val = this.getPropertyValue(cat)
      if (val) categories.push(val)
    }

    return {
      id: uid,
      title: summary,
      start,
      end,
      dayKey: startTimeZone || defaultTz
        ? getDayKeyInTimeZone(start, startTimeZone ?? defaultTz)
        : this.dayKeyFromRaw(startSource) ?? getDayKeyInTimeZone(start),
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

  private allByLocalName(root: Document | Element, name: string): Element[] {
    const target = name.toLowerCase()
    return Array.from(root.getElementsByTagName('*'))
      .filter(element => (element.localName || element.nodeName).toLowerCase() === target)
  }

  private firstByLocalName(root: Document | Element, name: string): Element | undefined {
    return this.allByLocalName(root, name)[0]
  }

  private getPropertyValue(element: Element | null | undefined): string | undefined {
    if (!element) return undefined
    for (const valueName of ['date-time', 'date', 'duration', 'text', 'uri', 'cal-address']) {
      const value = this.firstByLocalName(element, valueName)?.textContent?.trim()
      if (value) return value
    }
    return element.textContent?.trim() || undefined
  }

  private getPropertyTimeZoneId(element: Element | null | undefined): string | undefined {
    if (!element) return undefined
    const parameters = this.firstByLocalName(element, 'parameters')
    const tzid = parameters ? this.firstByLocalName(parameters, 'tzid') : undefined
    return this.getPropertyValue(tzid)
  }

  private getPropertyTimeZone(element: Element | null | undefined): string | undefined {
    return canonicalizeTimeZone(this.getPropertyTimeZoneId(element))
  }

  private getPentabarfValue(event: Element, name: string): string | undefined {
    const elements = Array.from(event.getElementsByTagNameNS('http://pentabarf.org', name))
    return elements[0]?.textContent?.trim() || undefined
  }

  private dayKeyFromRaw(raw: string): string | undefined {
    const match = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})/)
    return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined
  }

  private addIssue(issues: ScheduleImportIssue[], issue: ScheduleImportIssue) {
    if (issues.length >= 50) return
    issues.push({ ...issue, rawValue: issue.rawValue?.slice(0, 200) })
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

}
