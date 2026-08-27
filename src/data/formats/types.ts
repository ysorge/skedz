/**
 * Canonical internal format for schedule data
 * This format is extensible - new fields can be added without breaking existing parsers
 */
export type CanonicalSession = {
  // Core required fields
  id: string
  title: string
  start: Date
  dayKey: string // YYYY-MM-DD

  // Optional core fields
  end?: Date
  durationMinutes?: number
  
  // Location information
  room?: string
  building?: string
  floor?: string
  
  // Categorization
  track?: string
  type?: string
  language?: string
  tags?: string[]
  
  // Content
  abstract?: string
  description?: string
  subtitle?: string
  
  // People
  speakers?: string[]
  moderators?: string[]
  
  // Links and resources
  url?: string
  videoUrl?: string
  slidesUrl?: string
  attachments?: Array<{
    title: string
    url: string
    type?: string
  }>
  
  // Metadata (extensible)
  metadata?: Record<string, unknown>
}

export type ScheduleImportIssue = {
  /** Stable machine-readable category for tests and future UI changes. */
  code: 'invalid-start' | 'invalid-end' | 'unsupported-time-zone'
  /** Plain-text explanation safe to show in the import details UI. */
  message: string
  sessionTitle?: string
  rawValue?: string
}

export type CanonicalSchedule = {
  sessions: CanonicalSession[]

  /**
   * True when at least one timestamp has no offset/TZID and therefore needs
   * an externally selected event time zone before it can be interpreted.
   */
  requiresTimeZoneForParsing?: boolean

  /** Entries that were skipped or only partially parsed. */
  importIssues?: ScheduleImportIssue[]
  
  // Conference/Event metadata
  conferenceTitle?: string
  conferenceSubtitle?: string
  conferenceTimeZoneName?: string
  conferenceStart?: Date
  conferenceEnd?: Date
  conferenceUrl?: string
  conferenceVenue?: string
  
  // Additional metadata (extensible)
  metadata?: Record<string, unknown>
}

/**
 * Format type identifier
 */
export type ScheduleFormat = 
  | 'schedule-json'
  | 'schedule-xml'
  | 'xcal-frab'
  | 'ical'

/**
 * Format metadata for UI display
 */
export type FormatMetadata = {
  id: ScheduleFormat
  label: string
  extensions: string[] // file extensions, e.g. ['json']
  mimeTypes: string[] // MIME types
  description?: string
}

export type ScheduleParseOptions = {
  /** IANA time zone used for schedule timestamps that do not carry an offset. */
  timeZone?: string
}

/**
 * Parser interface - all format parsers must implement this
 */
export interface ScheduleParser {
  /**
   * Format metadata
   */
  readonly format: FormatMetadata
  
  /**
   * Parse raw text content into canonical format
   * @param content - Raw text content (JSON, XML, etc.)
   * @returns Canonical schedule data
   * @throws Error if parsing fails
   */
  parse(content: string, options?: ScheduleParseOptions): Promise<CanonicalSchedule> | CanonicalSchedule
  
  /**
   * Validate if the content appears to be this format
   * Quick check before attempting full parse
   */
  canParse?(content: string): boolean
}
