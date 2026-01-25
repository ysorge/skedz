import type { Session } from './normalizeSchedule'
import type { ScheduleFormat } from './formats/types'
import { parseSchedule, formatRegistry } from './formats/registry'
import { canonicalScheduleToAppFormat } from './formatConverter'

export async function fetchAndParseSchedule(
  url: string,
  format?: ScheduleFormat
): Promise<{ sessions: Session[]; conferenceTitle?: string; conferenceTimeZoneName?: string }> {
  const res = await fetch(url, { 
    headers: { 
      Accept: 'application/json, application/xml, text/xml, text/calendar, */*' 
    } 
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching schedule`)

  const content = await res.text()
  
  // Auto-detect format if not specified
  let detectedFormat = format
  if (!detectedFormat) {
    // Try to detect from URL first
    detectedFormat = formatRegistry.detectFormatFromUrl(url) || undefined
    
    // If that fails, detect from content
    if (!detectedFormat) {
      const contentFormat = formatRegistry.detectFormatFromContent(content)
      if (contentFormat) {
        detectedFormat = contentFormat
      }
    }
  }

  // Parse using the format system
  const canonical = await parseSchedule(content, detectedFormat)
  
  if (canonical.sessions.length === 0) {
    throw new Error('Schedule loaded, but no sessions were found (unexpected format or empty schedule).')
  }

  return canonicalScheduleToAppFormat(canonical)
}
