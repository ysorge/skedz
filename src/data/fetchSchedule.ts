import type { Session } from './normalizeSchedule'
import type { ScheduleFormat, ScheduleParseOptions } from './formats/types'
import type { ScheduleImportIssue } from './formats/types'
import { parseSchedule, formatRegistry } from './formats/registry'
import { canonicalScheduleToAppFormat } from './formatConverter'

export async function fetchAndParseSchedule(
  url: string,
  format?: ScheduleFormat,
  options?: ScheduleParseOptions
): Promise<{
  sessions: Session[]
  conferenceTitle?: string
  conferenceTimeZoneName?: string
  requiresTimeZoneForParsing: boolean
  importIssues: ScheduleImportIssue[]
  sourceContent: string
  format: ScheduleFormat
}> {
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

  if (!detectedFormat) {
    throw new Error('Could not detect schedule format. Please specify format explicitly.')
  }

  // Parse using the format system
  const canonical = await parseSchedule(content, detectedFormat, options)
  
  if (canonical.sessions.length === 0) {
    const firstIssue = canonical.importIssues?.[0]
    const issueCount = canonical.importIssues?.length ?? 0
    const detail = firstIssue
      ? ` ${issueCount} source ${issueCount === 1 ? 'entry' : 'entries'} could not be imported. First issue: ${firstIssue.message}`
      : ''
    throw new Error(`Schedule loaded, but no sessions could be imported.${detail}`)
  }

  return {
    ...canonicalScheduleToAppFormat(canonical),
    sourceContent: content,
    format: detectedFormat,
  }
}
