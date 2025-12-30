export function formatAge(iso: string | undefined): string {
  if (!iso) return 'unknown'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'unknown'
  const diffMs = Date.now() - t
  if (diffMs < 0) return 'just now'
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  return `${d}d ago`
}

export function formatRange(start: Date, durationMinutes?: number): { from: string; to: string | null } {
  const from = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (typeof durationMinutes !== 'number') return { from, to: null }
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const to = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return { from, to }
}
