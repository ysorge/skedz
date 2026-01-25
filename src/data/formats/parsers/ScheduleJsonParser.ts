import type { ScheduleParser, CanonicalSchedule, CanonicalSession, FormatMetadata } from '../types'
import { ScheduleSchema } from '../../schema'

/**
 * Parser for JSON (frab-compatible / schedule.json) format
 * used by Pretalx, Frab and others
 */
export class ScheduleJsonParser implements ScheduleParser {
  readonly format: FormatMetadata = {
    id: 'schedule-json',
    label: 'JSON (frab compatible)',
    extensions: ['json'],
    mimeTypes: ['application/json', 'text/json'],
    description: 'schedule.json format used by Pretalx, Frab and many conference systems'
  }

  canParse(content: string): boolean {
    try {
      const data = JSON.parse(content)
      return data && typeof data === 'object' && 'schedule' in data
    } catch {
      return false
    }
  }

  parse(content: string): CanonicalSchedule {
    const json = JSON.parse(content)
    const parsed = ScheduleSchema.safeParse(json)

    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' | ')
      throw new Error('JSON validation failed: ' + msg)
    }

    const data = parsed.data
    const conf = data.schedule?.conference
    const days = conf?.days ?? []
    const sessions: CanonicalSession[] = []

    for (const day of days) {
      const dayDate = typeof day?.date === 'string' ? day.date : undefined
      const rooms = day?.rooms ?? {}

      for (const [roomName, events] of Object.entries(rooms)) {
        for (const ev of events ?? []) {
          if (!ev || typeof ev.title !== 'string') continue

          const iso = typeof ev.date === 'string' ? ev.date : undefined
          let start: Date | null = null

          if (iso) {
            const d = new Date(iso)
            if (!Number.isNaN(d.getTime())) start = d
          } else if (dayDate && typeof ev.start === 'string') {
            const guess = new Date(`${dayDate}T${ev.start}`)
            if (!Number.isNaN(guess.getTime())) start = guess
          }

          if (!start) continue

          const durationMinutes = this.parseDuration(ev.duration)
          const end = durationMinutes ? new Date(start.getTime() + durationMinutes * 60000) : undefined

          const speakers = ev.persons
            ?.map((p: any) => {
              if (typeof p === 'string') return p
              if (p && typeof p === 'object') return p.public_name ?? p.name ?? null
              return null
            })
            .filter(Boolean) as string[] | undefined

          const id = this.makeId(ev, `${ev.title}|${start.toISOString()}|${roomName}`)

          sessions.push({
            id,
            title: ev.title,
            start,
            end,
            dayKey: dayDate ?? this.localDayKey(start),
            room: roomName || (typeof ev.room === 'string' ? ev.room : undefined) || undefined,
            track: typeof ev.track === 'string' ? ev.track : undefined,
            type: typeof ev.type === 'string' ? ev.type : undefined,
            language: typeof ev.language === 'string' ? ev.language : undefined,
            durationMinutes,
            abstract: typeof ev.abstract === 'string' ? ev.abstract : undefined,
            description: typeof ev.description === 'string' ? ev.description : undefined,
            subtitle: typeof ev.subtitle === 'string' ? ev.subtitle : undefined,
            url: typeof ev.url === 'string' ? ev.url : undefined,
            speakers: speakers?.length ? speakers : undefined,
          })
        }
      }
    }

    sessions.sort((a, b) => a.start.getTime() - b.start.getTime())

    return {
      sessions,
      conferenceTitle: conf?.title,
      conferenceTimeZoneName: typeof conf?.time_zone_name === 'string' ? conf.time_zone_name : undefined,
      conferenceStart: typeof conf?.start === 'string' ? new Date(conf.start) : undefined,
      conferenceEnd: typeof conf?.end === 'string' ? new Date(conf.end) : undefined,
    }
  }

  private parseDuration(s: string | null | undefined): number | undefined {
    if (!s) return undefined
    const m = String(s).trim()
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

  private makeId(ev: any, fallback: string): string {
    if (typeof ev.guid === 'string' && ev.guid.trim()) return ev.guid.trim()
    if (typeof ev.id === 'string' && ev.id.trim()) return ev.id.trim()
    if (typeof ev.id === 'number' && Number.isFinite(ev.id)) return String(ev.id)
    return fallback
  }

  private localDayKey(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${da}`
  }
}
