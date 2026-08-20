/**
 * Validation & sanitization for optional schedule-import parameters
 * supplied via the `?url=` query string (title, start, end).
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
}

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

/**
 * Strictly parse a date/time string in one of the supported formats:
 * - `YYYY-MM-DD`
 * - `YYYY-MM-DD_HH-mm`
 * - full ISO 8601 (`YYYY-MM-DDTHH:mm:ss(.sss)?(Z|±HH:mm)?`)
 * Returns undefined for anything malformed or invalid.
 */
export function parseImportDate(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined
  const value = raw.trim()

  const patterns = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
  ]
  if (!patterns.some(p => p.test(value))) return undefined

  const normalized = value.includes('_')
    ? value.replace('_', 'T').replace(/-(\d{2})$/, ':$1') // YYYY-MM-DD_HH-mm -> YYYY-MM-DDTHH:mm
    : value

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Build a validated ImportFilter from raw start/end strings. Handles
 * either bound being optional, and rejects an inverted range (end before
 * start) by dropping the invalid bound rather than throwing.
 */
export function buildImportFilter(
  rawStart: string | null | undefined,
  rawEnd: string | null | undefined
): ImportFilter | undefined {
  const start = parseImportDate(rawStart)
  const end = parseImportDate(rawEnd)

  if (start && end && end.getTime() < start.getTime()) {
    console.warn('[importParams] Ignoring import date range: end is before start')
    return undefined
  }

  if (!start && !end) return undefined
  return {
    start: start?.toISOString(),
    end: end?.toISOString(),
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
