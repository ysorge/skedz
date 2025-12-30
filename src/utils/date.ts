export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatTimeInTimeZone(d: Date, timeZone?: string): string {
  if (!timeZone) return formatTime(d)
  try {
    return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', timeZone }).format(d)
  } catch {
    return formatTime(d)
  }
}

export function getDayKeyInTimeZone(d: Date, timeZone?: string): string {
  const tz = timeZone
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    // en-CA yields YYYY-MM-DD in most engines, but we still use parts to be safe.
    const parts = fmt.formatToParts(d)
    const y = parts.find(p => p.type === 'year')?.value ?? ''
    const m = parts.find(p => p.type === 'month')?.value ?? ''
    const da = parts.find(p => p.type === 'day')?.value ?? ''
    if (y && m && da) return `${y}-${m}-${da}`
  } catch {
    // fallthrough
  }
  // device-local fallback
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

export function formatDayLabel(dayKey: string): string {
  // dayKey is YYYY-MM-DD
  const d = new Date(dayKey + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dayKey
  return d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'short', day: '2-digit' })
}
