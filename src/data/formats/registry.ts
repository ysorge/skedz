import type { ScheduleParser, ScheduleFormat, FormatMetadata } from './types'
import { ScheduleJsonParser } from './parsers/ScheduleJsonParser'
import { ScheduleXmlParser } from './parsers/ScheduleXmlParser'
import { XCalParser } from './parsers/XCalParser'
import { ICalParser } from './parsers/ICalParser'

/**
 * Central registry for all supported schedule formats
 * Makes it easy to add new parsers in the future
 */
class FormatRegistry {
  private parsers: Map<ScheduleFormat, ScheduleParser> = new Map()

  constructor() {
    // Register all built-in parsers
    this.register(new ScheduleJsonParser())
    this.register(new ScheduleXmlParser())
    this.register(new XCalParser())
    this.register(new ICalParser())
  }

  /**
   * Register a new parser
   */
  register(parser: ScheduleParser): void {
    this.parsers.set(parser.format.id, parser)
  }

  /**
   * Get a parser by format ID
   */
  getParser(format: ScheduleFormat): ScheduleParser | undefined {
    return this.parsers.get(format)
  }

  /**
   * Get all registered parsers
   */
  getAllParsers(): ScheduleParser[] {
    return Array.from(this.parsers.values())
  }

  /**
   * Get all format metadata for UI display
   */
  getAllFormats(): FormatMetadata[] {
    return this.getAllParsers().map(p => p.format)
  }

  /**
   * Detect format from file extension
   */
  detectFormatFromExtension(filename: string): ScheduleFormat | null {
    const lowerFilename = filename.toLowerCase()
    
    // Check for special multi-extension patterns first (most specific first)
    if (lowerFilename.endsWith('.xcal.xml')) {
      return 'xcal-frab'
    }
    if (lowerFilename.endsWith('.xcs')) {
      return 'xcal-frab'
    }
    if (lowerFilename.endsWith('.pentabarf.xml')) {
      return 'schedule-xml' // Pentabarf uses same structure as XML frab
    }
    
    // Standard single extension check
    const ext = filename.split('.').pop()?.toLowerCase()
    if (!ext) return null

    for (const parser of this.parsers.values()) {
      if (parser.format.extensions.includes(ext)) {
        return parser.format.id
      }
    }

    return null
  }

  /**
   * Detect format from URL
   */
  detectFormatFromUrl(url: string): ScheduleFormat | null {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname.toLowerCase()
      
      // Check for special multi-extension patterns first (most specific first)
      if (pathname.includes('.xcal.xml')) {
        return 'xcal-frab'
      }
      if (pathname.endsWith('.xcs')) {
        return 'xcal-frab'
      }
      if (pathname.includes('.pentabarf.xml')) {
        return 'schedule-xml'
      }
      
      // Check for format identifiers in URL path (without dot)
      // Examples: /schedule/xml, /schedule/xcal, /export/ical
      const pathSegments = pathname.split('/').filter(s => s.length > 0)
      const lastSegment = pathSegments[pathSegments.length - 1]
      
      if (lastSegment) {
        // Map URL path segments to formats
        if (lastSegment === 'xcal') {
          return 'xcal-frab'
        }
        if (lastSegment === 'xml') {
          return 'schedule-xml'
        }
        if (lastSegment === 'ical' || lastSegment === 'ics') {
          return 'ical'
        }
        if (lastSegment === 'json') {
          return 'schedule-json'
        }
      }
      
      // Check for file extensions in URL
      // For URLs, we can make better assumptions than for files
      // since conference schedule URLs typically follow naming conventions
      if (pathname.endsWith('.xml')) {
        return 'schedule-xml'
      }
      if (pathname.endsWith('.xcal')) {
        return 'xcal-frab'
      }
      if (pathname.endsWith('.json')) {
        return 'schedule-json'
      }
      if (pathname.endsWith('.ics') || pathname.endsWith('.ical')) {
        return 'ical'
      }
      
      return null
    } catch {
      return null
    }
  }

  /**
   * Auto-detect format from content
   * Tries all parsers' canParse methods
   */
  detectFormatFromContent(content: string): ScheduleFormat | null {
    // Try specific detection first for better accuracy
    const trimmed = content.trim()

    // Check for iCal
    if (trimmed.startsWith('BEGIN:VCALENDAR')) {
      return 'ical'
    }

    // Check for XCal
    if (trimmed.startsWith('<?xml') && (trimmed.includes('<icalendar') || trimmed.includes('<vcalendar'))) {
      return 'xcal-frab'
    }

    // Check for frab/Pentabarf XML (both use same structure)
    if (trimmed.startsWith('<?xml') && trimmed.includes('<schedule')) {
      return 'schedule-xml'
    }

    // Check for JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const data = JSON.parse(content)
        if (data && typeof data === 'object' && 'schedule' in data) {
          return 'schedule-json'
        }
      } catch {
        // Not JSON
      }
    }

    // Fallback to canParse methods
    for (const parser of this.parsers.values()) {
      if (parser.canParse && parser.canParse(content)) {
        return parser.format.id
      }
    }

    return null
  }
}

// Singleton instance
export const formatRegistry = new FormatRegistry()

/**
 * Convenience function to parse schedule with automatic format detection
 */
export async function parseSchedule(
  content: string,
  format?: ScheduleFormat
) {
  // If format is specified, use it
  if (format) {
    const parser = formatRegistry.getParser(format)
    if (!parser) {
      throw new Error(`Unknown format: ${format}`)
    }
    return await parser.parse(content)
  }

  // Auto-detect format
  const detectedFormat = formatRegistry.detectFormatFromContent(content)
  if (!detectedFormat) {
    throw new Error('Could not detect schedule format. Please specify format explicitly.')
  }

  const parser = formatRegistry.getParser(detectedFormat)
  if (!parser) {
    throw new Error(`Parser not found for format: ${detectedFormat}`)
  }

  return await parser.parse(content)
}
