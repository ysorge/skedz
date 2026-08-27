import { parseImportDate } from '../../utils/importParams'

/** Whether a supported schedule timestamp already identifies an instant. */
export function scheduleDateTimeHasExplicitOffset(raw: string | null | undefined): boolean {
  const value = raw?.trim()
  if (!value) return false
  return /Z$/i.test(value) || /[+-]\d{2}:?\d{2}$/.test(value)
}

/** Normalize the offset-bearing date format used by Pentabarf XCal fields. */
export function normalizeScheduleDateTime(raw: string | null | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  return value.replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2}:?\d{2})$/,
    '$1T$2$3'
  )
}

/** Parse compact iCalendar or regular ISO values in an optional event time zone. */
export function parseScheduleDateTime(
  raw: string | null | undefined,
  timeZone?: string
): Date | undefined {
  const value = normalizeScheduleDateTime(raw)
  if (!value) return undefined

  const compactDateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i)
  if (compactDateTime) {
    const [, year, month, day, hour, minute, second, utc] = compactDateTime
    return parseImportDate(
      `${year}-${month}-${day}T${hour}:${minute}:${second}${utc ? 'Z' : ''}`,
      timeZone
    )
  }

  const compactDate = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compactDate) {
    const [, year, month, day] = compactDate
    return parseImportDate(`${year}-${month}-${day}`, timeZone)
  }

  return parseImportDate(value, timeZone)
}
