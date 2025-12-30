import type { Session } from '../data/normalizeSchedule'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

// UTC timestamp like 20251227T130000Z
function toIcsDateUtc(d: Date): string {
  return (
    d.getUTCFullYear() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    'T' +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    'Z'
  )
}

// Fold long lines at ~72 chars (simplified).
function foldLine(line: string): string {
  const max = 72
  if (line.length <= max) return line
  let out = ''
  let i = 0
  while (i < line.length) {
    out += (i === 0 ? '' : '\r\n ') + line.slice(i, i + max)
    i += max
  }
  return out
}

function escText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

export function sessionsToIcs(opts: {
  sessions: Session[]
  calendarName: string
  prodId?: string
  uidSalt?: string
}): string {
  const prodId = opts.prodId ?? '-//Congress Schedule PWA//EN'
  const uidSalt = opts.uidSalt ?? 'schedule'
  const dtstamp = toIcsDateUtc(new Date())

  const lines: string[] = []
  lines.push('BEGIN:VCALENDAR')
  lines.push('VERSION:2.0')
  lines.push(foldLine(`PRODID:${prodId}`))
  lines.push('CALSCALE:GREGORIAN')
  lines.push('METHOD:PUBLISH')
  lines.push(foldLine(`X-WR-CALNAME:${escText(opts.calendarName)}`))

  for (const s of opts.sessions) {
    const start = s.start
    const end =
      typeof s.durationMinutes === 'number'
        ? new Date(start.getTime() + s.durationMinutes * 60_000)
        : new Date(start.getTime() + 30 * 60_000)

    const uid = `${uidSalt}-${s.id}@congress-schedule-pwa`
    const descParts: string[] = []
    if (s.speakers?.length) descParts.push(`Speakers: ${s.speakers.join(', ')}`)
    if (s.abstract) descParts.push(s.abstract)
    if (s.description) descParts.push(s.description)
    const description = descParts.join('\n\n')

    lines.push('BEGIN:VEVENT')
    lines.push(foldLine(`UID:${escText(uid)}`))
    lines.push(foldLine(`DTSTAMP:${dtstamp}`))
    lines.push(foldLine(`DTSTART:${toIcsDateUtc(start)}`))
    lines.push(foldLine(`DTEND:${toIcsDateUtc(end)}`))
    lines.push(foldLine(`SUMMARY:${escText(s.title)}`))
    if (s.room) lines.push(foldLine(`LOCATION:${escText(s.room)}`))
    if (description) lines.push(foldLine(`DESCRIPTION:${escText(description)}`))
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

export function sessionsToJson(opts: { sessions: Session[]; meta: any }): string {
  const payload = {
    meta: opts.meta,
    sessions: opts.sessions.map(s => ({
      id: s.id,
      title: s.title,
      dayKey: s.dayKey,
      start: s.start.toISOString(),
      durationMinutes: s.durationMinutes ?? null,
      room: s.room ?? null,
      track: s.track ?? null,
      type: s.type ?? null,
      language: s.language ?? null,
      speakers: s.speakers ?? [],
      abstract: s.abstract ?? null,
      description: s.description ?? null,
    })),
  }
  return JSON.stringify(payload, null, 2)
}

export function sessionsToCsv(sessions: Session[]): string {
  const header = ['id','title','start','end','durationMinutes','day','room','track','type','language','speakers']
  const rows = sessions.map(s => {
    const end =
      typeof s.durationMinutes === 'number'
        ? new Date(s.start.getTime() + s.durationMinutes * 60_000).toISOString()
        : ''
    const speakers = (s.speakers ?? []).join('; ')
    const cols = [
      s.id,
      s.title,
      s.start.toISOString(),
      end,
      typeof s.durationMinutes === 'number' ? String(s.durationMinutes) : '',
      s.dayKey,
      s.room ?? '',
      s.track ?? '',
      s.type ?? '',
      s.language ?? '',
      speakers,
    ].map(v => `"${String(v).replace(/"/g,'""')}"`)
    return cols.join(',')
  })
  return header.join(',') + '\n' + rows.join('\n')
}

export function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
