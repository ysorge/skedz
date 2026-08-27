/**
 * Validation & sanitization for optional schedule-import parameters
 * supplied via the `?url=` query string (title, start, end, timezone).
 *
 * Security notes:
 * - `title` is restricted to a safe Unicode allowlist and length cap.
 *   It is only ever rendered as plain React text (never HTML), but we
 *   still strip control characters and disallow line breaks so it can't
 *   break UI layout, localStorage/IndexedDB records, or exported files
 *   (.ics/.json/.csv).
 * - `start`/`end` are parsed with a strict pattern before being handed to
 *   `Date`, and are only ever used as comparison boundaries — never
 *   interpolated into HTML, URLs, or queries.
 */

import type { Session } from '../data/normalizeSchedule'

export const MAX_IMPORT_TITLE_LENGTH = 120

/**
 * Allowed Unicode ranges for imported titles: Basic Latin, Latin-1
 * Supplement, Latin Extended A/B (covers accented/umlaut characters like
 * "å" and "’"), general punctuation, and common symbols. Explicitly
 * excludes control characters, private-use areas, and other ranges that
 * have no legitimate use in a schedule title.
 */
// eslint-disable-next-line no-control-regex
const ALLOWED_TITLE_CHARS = /[^\u0020-\u007E\u00A0-\u024F\u2000-\u206F]/gu

export type ImportFilter = {
  /** ISO 8601 timestamp (inclusive lower bound) */
  start?: string
  /** ISO 8601 timestamp (inclusive upper bound) */
  end?: string
  /** IANA time zone used to resolve boundaries without an offset. */
  timeZone?: string
}

/** Raw date options, kept unchanged until the schedule time zone is known. */
export type ImportDateOptions = {
  start?: string
  end?: string
  timeZone?: string
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const COMPACT_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i
const EXPLICIT_OFFSET_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i

/**
 * Sanitize a user/URL-supplied title: strip disallowed characters,
 * collapse whitespace, and cap length.
 */
export function sanitizeImportTitle(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  const cleaned = raw
    .replace(ALLOWED_TITLE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_IMPORT_TITLE_LENGTH)
  return cleaned || undefined
}

/** Validate and canonicalize an IANA time-zone identifier. */
export function canonicalizeTimeZone(raw: string | null | undefined): string | undefined {
  const value = raw?.trim()
  if (!value || value.length > 100) return undefined

  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

export function isImportDateSyntaxValid(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return true
  const value = raw.trim()
  return DATE_ONLY_PATTERN.test(value) || COMPACT_DATE_TIME_PATTERN.test(value) || ISO_DATE_TIME_PATTERN.test(value)
}

export function importDateHasExplicitOffset(raw: string | null | undefined): boolean {
  return Boolean(raw?.trim() && ISO_DATE_TIME_PATTERN.test(raw.trim()) && EXPLICIT_OFFSET_PATTERN.test(raw.trim()))
}

/** Whether at least one supplied boundary needs an external time zone. */
export function importRangeNeedsTimeZone(
  rawStart: string | null | undefined,
  rawEnd: string | null | undefined
): boolean {
  return [rawStart, rawEnd].some(raw =>
    Boolean(raw?.trim()) && isImportDateSyntaxValid(raw) && !importDateHasExplicitOffset(raw)
  )
}

type WallClock = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

function wallClockAsUtcMilliseconds(parts: WallClock): number {
  const date = new Date(0)
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond)
  return date.getTime()
}

function isValidWallClock(parts: WallClock): boolean {
  const date = new Date(wallClockAsUtcMilliseconds(parts))
  return date.getUTCFullYear() === parts.year
    && date.getUTCMonth() + 1 === parts.month
    && date.getUTCDate() === parts.day
    && date.getUTCHours() === parts.hour
    && date.getUTCMinutes() === parts.minute
    && date.getUTCSeconds() === parts.second
}

function parseWallClock(value: string): WallClock | undefined {
  const normalized = DATE_ONLY_PATTERN.test(value)
    ? `${value}T00:00:00`
    : value.includes('_')
      ? value.replace('_', 'T').replace(/-(\d{2})$/, ':$1')
      : value
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/
  )
  if (!match) return undefined

  const parts: WallClock = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
    millisecond: Number((match[7] ?? '').padEnd(3, '0').slice(0, 3) || 0),
  }
  return isValidWallClock(parts) ? parts : undefined
}

function wallClockInTimeZone(date: Date, timeZone: string): Omit<WallClock, 'millisecond'> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const values = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  )
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

function timeZoneOffsetAt(epochMs: number, timeZone: string): number {
  const instantWithoutMilliseconds = Math.trunc(epochMs / 1000) * 1000
  const wall = wallClockInTimeZone(new Date(instantWithoutMilliseconds), timeZone)
  return wallClockAsUtcMilliseconds({ ...wall, millisecond: 0 }) - instantWithoutMilliseconds
}

function sameWallClock(actual: Omit<WallClock, 'millisecond'>, expected: WallClock): boolean {
  return actual.year === expected.year
    && actual.month === expected.month
    && actual.day === expected.day
    && actual.hour === expected.hour
    && actual.minute === expected.minute
    && actual.second === expected.second
}

/**
 * Resolve a wall-clock value in an IANA time zone with the same compatible
 * disambiguation used by RFC 5545 and Temporal: choose the earlier instant
 * when a clock time repeats and move forward by the gap when it does not
 * exist.
 */
function dateInTimeZone(parts: WallClock, timeZone: string): Date | undefined {
  const wallClockMs = wallClockAsUtcMilliseconds(parts)
  const probeDistanceMs = 36 * 60 * 60 * 1000
  const offsetBefore = timeZoneOffsetAt(wallClockMs - probeDistanceMs, timeZone)
  const offsets = new Set([
    offsetBefore,
    timeZoneOffsetAt(wallClockMs, timeZone),
    timeZoneOffsetAt(wallClockMs + probeDistanceMs, timeZone),
  ])
  const candidates = [...offsets]
    .map(offset => new Date(wallClockMs - offset))
    .filter(candidate => sameWallClock(wallClockInTimeZone(candidate, timeZone), parts))
  const uniqueCandidates = new Map(candidates.map(candidate => [candidate.getTime(), candidate]))
  if (uniqueCandidates.size > 0) {
    return [...uniqueCandidates.values()].sort((a, b) => a.getTime() - b.getTime())[0]
  }

  // During a forward transition the requested wall time does not exist.
  // Applying the pre-transition offset moves it forward by exactly the gap.
  return new Date(wallClockMs - offsetBefore)
}

function nextLocalDayEnd(value: string, timeZone: string): Date | undefined {
  const parts = parseWallClock(value)
  if (!parts) return undefined
  const nextDay = new Date(wallClockAsUtcMilliseconds(parts))
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const nextMidnight = dateInTimeZone({
    year: nextDay.getUTCFullYear(),
    month: nextDay.getUTCMonth() + 1,
    day: nextDay.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  }, timeZone)
  return nextMidnight ? new Date(nextMidnight.getTime() - 1) : undefined
}

/**
 * Strictly parse a date/time string in one of the supported formats:
 * - `YYYY-MM-DD`
 * - `YYYY-MM-DD_HH-mm`
 * - full ISO 8601 (`YYYY-MM-DDTHH:mm:ss(.sss)?(Z|±HH:mm)?`)
 * Returns undefined for anything malformed or invalid.
 */
export function parseImportDate(
  raw: string | null | undefined,
  timeZone?: string
): Date | undefined {
  if (!raw) return undefined
  const value = raw.trim()
  if (!isImportDateSyntaxValid(value)) return undefined

  if (importDateHasExplicitOffset(value)) {
    const normalized = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  const parts = parseWallClock(value)
  if (!parts) return undefined
  const canonicalTimeZone = canonicalizeTimeZone(timeZone)
  if (canonicalTimeZone) return dateInTimeZone(parts, canonicalTimeZone)

  // Standalone parser fallback for callers without schedule context. The
  // import flow itself requires a resolved time zone before reaching here.
  const localDate = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  )
  return Number.isNaN(localDate.getTime()) ? undefined : localDate
}

/**
 * Build a validated ImportFilter from raw start/end strings. Handles
 * either bound being optional and rejects invalid or inverted ranges.
 */
export function buildImportFilter(
  rawStart: string | null | undefined,
  rawEnd: string | null | undefined,
  timeZone?: string
): ImportFilter | undefined {
  const hasStart = Boolean(rawStart?.trim())
  const hasEnd = Boolean(rawEnd?.trim())
  if (!hasStart && !hasEnd) return undefined
  if (hasStart && !isImportDateSyntaxValid(rawStart)) {
    throw new Error('Invalid start date/time. Use YYYY-MM-DD or ISO 8601.')
  }
  if (hasEnd && !isImportDateSyntaxValid(rawEnd)) {
    throw new Error('Invalid end date/time. Use YYYY-MM-DD or ISO 8601.')
  }

  const canonicalTimeZone = canonicalizeTimeZone(timeZone)
  if (timeZone?.trim() && !canonicalTimeZone) {
    throw new Error(`Unknown time zone: ${timeZone.trim()}`)
  }
  if (importRangeNeedsTimeZone(rawStart, rawEnd) && !canonicalTimeZone) {
    throw new Error('A time zone is required for date/time values without an explicit offset.')
  }

  const start = parseImportDate(rawStart, canonicalTimeZone)
  const rawEndValue = rawEnd?.trim()
  const end = rawEndValue && DATE_ONLY_PATTERN.test(rawEndValue) && canonicalTimeZone
    ? nextLocalDayEnd(rawEndValue, canonicalTimeZone)
    : parseImportDate(rawEnd, canonicalTimeZone)
  if (hasStart && !start) {
    throw new Error(canonicalTimeZone ? `The start date/time is invalid in ${canonicalTimeZone}.` : 'The start date/time is invalid.')
  }
  if (hasEnd && !end) {
    throw new Error(`The end date/time is invalid in ${canonicalTimeZone}.`)
  }

  if (start && end && end.getTime() < start.getTime()) {
    throw new Error('End date/time must not be before start date/time.')
  }

  return {
    start: start?.toISOString(),
    end: end?.toISOString(),
    timeZone: canonicalTimeZone,
  }
}

/**
 * Permanently cut sessions outside the import date range. This is applied
 * once at import time (and again on every reload/auto-refresh of the same
 * endpoint) so that out-of-range sessions are never persisted.
 */
export function applyImportFilter(sessions: Session[], filter: ImportFilter | null | undefined): Session[] {
  if (!filter || (!filter.start && !filter.end)) return sessions

  const startMs = filter.start ? new Date(filter.start).getTime() : undefined
  const endMs = filter.end ? new Date(filter.end).getTime() : undefined

  return sessions.filter(s => {
    const t = s.start.getTime()
    if (startMs !== undefined && t < startMs) return false
    if (endMs !== undefined && t > endMs) return false
    return true
  })
}
