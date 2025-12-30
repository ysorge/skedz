import type { ScheduleJson, RawEvent } from './schema'

export type Session = {
  id: string
  title: string
  start: Date
  dayKey: string // YYYY-MM-DD (from schedule day date when available; otherwise device-local from start)
  room?: string
  track?: string
  type?: string
  language?: string
  durationMinutes?: number
  abstract?: string
  description?: string
  speakers?: string[]
}

export type NormalizeResult = {
  sessions: Session[]
  conferenceTitle?: string
  conferenceTimeZoneName?: string
}

function parseDurationToMinutes(s: string | null | undefined): number | undefined {
  if (!s) return undefined
  // expected formats: "00:45" or "45" or "0:30"
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

function makeId(ev: RawEvent, fallbackKey: string): string {
  if (typeof ev.guid === 'string' && ev.guid.trim()) return ev.guid.trim()
  if (typeof ev.id === 'string' && ev.id.trim()) return ev.id.trim()
  if (typeof ev.id === 'number' && Number.isFinite(ev.id)) return String(ev.id)
  return fallbackKey
}

function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

export function normalizeSchedule(json: ScheduleJson): NormalizeResult {
  const sessions: Session[] = []

  const conf = json.schedule?.conference
  const days = conf?.days ?? []

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
          // Build an ISO-like string without timezone; browser will interpret as local. This is only a fallback.
          const guess = new Date(`${dayDate}T${ev.start}`)
          if (!Number.isNaN(guess.getTime())) start = guess
        }

        if (!start) continue

        const durationMinutes = parseDurationToMinutes(ev.duration ?? null)

        const speakers = ev.persons
          ?.map((p: any) => {
            if (typeof p === 'string') return p
            if (p && typeof p === 'object') return p.public_name ?? p.name ?? null
            return null
          })
          .filter(Boolean) as string[] | undefined

        const fallbackKey = `${ev.title}|${start.toISOString()}|${roomName}`
        const id = makeId(ev, fallbackKey)

        sessions.push({
          id,
          title: ev.title,
          start,
          dayKey: dayDate ?? localDayKey(start),
          room: roomName || (typeof ev.room === 'string' ? ev.room : undefined) || undefined,
          track: typeof ev.track === 'string' ? ev.track : undefined,
          type: typeof ev.type === 'string' ? ev.type : undefined,
          language: typeof ev.language === 'string' ? ev.language : undefined,
          durationMinutes,
          abstract: typeof ev.abstract === 'string' ? ev.abstract : undefined,
          description: typeof ev.description === 'string' ? ev.description : undefined,
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
  }
}
