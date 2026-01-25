/**
 * Heuristics for generating nice schedule titles from file names and URLs
 */

// Generic keywords that should be handled specially
const GENERIC_KEYWORDS = new Set([
  'schedule',
  'fahrplan',
  'export',
  'calendar',
  'events',
  'sessions',
  'timetable',
  'agenda',
])

// Format identifiers that appear as URL path segments
const FORMAT_IDENTIFIERS = new Set([
  'xml',
  'json',
  'ical',
  'ics',
  'xcal',
  'xcs',
])

// Generic or non-informative titles that should be replaced
const GENERIC_TITLES = new Set([
  'schedule',
  'fahrplan',
  'calendar',
  'events',
  'timetable',
  'agenda',
  'ical',
  'xcal',
  'json',
  'xml',
])

// File extensions to strip
const FILE_EXTENSIONS = [
  '.xcal.xml',
  '.pentabarf.xml',
  '.json',
  '.xml',
  '.xcal',
  '.xcs',
  '.ical',
  '.ics',
]

/**
 * Capitalize first letter of each word, handling special cases
 */
function capitalizeWords(text: string): string {
  return text
    .split(/[\s-_]+/)
    .map(word => {
      // Keep numbers as-is
      if (/^\d+$/.test(word)) {
        return word
      }
      // Keep special patterns like "39c3" as-is but capitalize
      if (/^\d+[a-z]\d+$/i.test(word)) {
        return word.toUpperCase()
      }
      // Keep acronyms (all uppercase words) as-is
      if (word.length >= 2 && word === word.toUpperCase()) {
        return word
      }
      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Strip file extension from filename
 */
function stripExtension(filename: string): string {
  const lower = filename.toLowerCase()
  
  // Check multi-part extensions first
  for (const ext of FILE_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return filename.slice(0, -ext.length)
    }
  }
  
  return filename
}

/**
 * Check if a word/segment is generic
 */
function isGeneric(segment: string): boolean {
  const lower = segment.toLowerCase()
  return GENERIC_KEYWORDS.has(lower) || FORMAT_IDENTIFIERS.has(lower)
}

/**
 * Generate title from filename
 * Examples:
 * - "juliacon-2025.xml" --> "Juliacon 2025"
 * - "fahrplan-congress-39c3.json" --> "Fahrplan Congress 39C3"
 * - "FOSDEM_2025.xcal.xml" --> "FOSDEM 2025"
 * - "schedule.json" --> "Schedule.json" (keep original for generic names)
 */
export function generateTitleFromFilename(filename: string): string {
  // Strip path if present
  const basename = filename.split('/').pop() || filename
  
  // Strip extension
  const withoutExt = stripExtension(basename)
  
  // If the name without extension is generic (single word), keep original
  const normalized = withoutExt.toLowerCase().replace(/[-_]/g, '')
  if (isGeneric(normalized)) {
    return basename // Return original with extension
  }
  
  // Replace underscores and dashes with spaces, then capitalize
  return capitalizeWords(withoutExt)
}

/**
 * Extract domain name without TLD for title generation
 * Handles subdomains intelligently:
 * - "eventname.com" --> "eventname"
 * - "eventname.organization.org" --> "eventname"
 * - "www.eventname.com" --> "eventname"
 * - "schedule.eventname.org" --> "eventname" (removes generic subdomain)
 */
function extractDomainName(hostname: string): string {
  const parts = hostname.split('.')
  
  // Common TLDs - remove from the end
  const tlds = new Set(['com', 'org', 'net', 'io', 'dev', 'co', 'de', 'uk', 'edu'])
  
  // Remove TLD (last part if it's a known TLD)
  let domainParts = parts
  if (parts.length > 1 && tlds.has(parts[parts.length - 1].toLowerCase())) {
    domainParts = parts.slice(0, -1)
  }
  
  // Remove generic subdomains from the start (www, schedule, calendar, etc.)
  const genericSubdomains = new Set(['www', 'schedule', 'calendar', 'events', 'event', 'timetable', 'agenda'])
  while (domainParts.length > 1 && genericSubdomains.has(domainParts[0].toLowerCase())) {
    domainParts = domainParts.slice(1)
  }
  
  return domainParts.join(' ')
}

/**
 * Generate title from URL with smart heuristics
 * Examples:
 * - "https://pretalx.com/juliacon-2025/schedule/export/juliacon-2025.xcal"
 *   --> "Juliacon 2025"
 * - "https://pretalx.com/juliacon-2025/schedule/export/schedule.xcal"
 *   --> "Juliacon 2025 Schedule"
 * - "https://eventname.com/schedule.xcal"
 *   --> "Eventname Schedule"
 * - "https://eventname.organization.org/schedule/xml"
 *   --> "Eventname Schedule"
 * - "https://schedule.eventname.org/xml"
 *   --> "Eventname Schedule"
 */
export function generateTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const hostname = urlObj.hostname
    
    // Extract path segments (non-empty)
    const pathSegments = pathname
      .split('/')
      .filter(s => s.length > 0)
      .map(s => stripExtension(s))
    
    // Get last segment (filename or path component)
    const lastSegment = pathSegments[pathSegments.length - 1] || ''
    
    // Case 1: Last segment is non-generic and meaningful (not just a standalone year)
    // e.g., "juliacon-2025.xcal" --> "Juliacon 2025"
    if (lastSegment && !isGeneric(lastSegment) && !/^\d+$/.test(lastSegment)) {
      return capitalizeWords(lastSegment)
    }
    
    // Case 2: Last segment is generic, look backwards in path for meaningful parts
    // e.g., /juliacon-2025/schedule/export/schedule.xcal --> find "juliacon-2025"
    // Keep years in range 2000-2100 as they're likely event years
    const meaningfulSegments: string[] = []
    const genericSegments: string[] = []
    const yearSegments: string[] = []
    
    for (let i = pathSegments.length - 1; i >= 0; i--) {
      const segment = pathSegments[i]
      // Check if it's a year (2000-2100)
      if (/^\d+$/.test(segment)) {
        const year = parseInt(segment, 10)
        if (year >= 2000 && year <= 2100) {
          yearSegments.unshift(segment)
          continue
        }
        // Skip other pure numeric segments
        continue
      }
      if (isGeneric(segment)) {
        genericSegments.unshift(segment)
      } else {
        meaningfulSegments.unshift(segment)
      }
    }
    
    // If we found meaningful path segments, use those + years + generic keywords
    if (meaningfulSegments.length > 0) {
      const parts = [...meaningfulSegments, ...yearSegments, ...genericSegments.slice(0, 1)]
      return parts.map(capitalizeWords).join(' ')
    }
    
    // If we only have years but no meaningful segments, fall through to use domain name
    
    // Case 3: Only generic path segments, extract from domain
    // Check hostname for subdomains
    const hostParts = hostname.split('.')
    
    // If we have 3+ parts, use subdomain logic (always use first part + generic)
    // Examples:
    // - congress.ccc.de --> "Congress Schedule"
    // - eventname.organization.org --> "Eventname Schedule" 
    // - schedule.eventname.org --> "Eventname Schedule" (generic subdomain falls through)
    if (hostParts.length >= 3) {
      const firstPart = hostParts[0]
      
      // If first part is non-generic, use it as the main identifier
      if (!isGeneric(firstPart) && firstPart !== 'www') {
        const parts = yearSegments.length > 0 
          ? [firstPart, ...yearSegments]
          : [firstPart]
        const genericPart = genericSegments.find(s => !FORMAT_IDENTIFIERS.has(s.toLowerCase())) || 'schedule'
        return `${parts.map(capitalizeWords).join(' ')} ${capitalizeWords(genericPart)}`
      }
    }
    
    // Case 4: Use domain name + years + generic keyword
    const domainName = extractDomainName(hostname)
    const parts = yearSegments.length > 0
      ? [domainName, ...yearSegments]
      : [domainName]
    const genericPart = genericSegments.find(s => !FORMAT_IDENTIFIERS.has(s.toLowerCase())) || 'schedule'
    
    return `${parts.map(capitalizeWords).join(' ')} ${capitalizeWords(genericPart)}`
  } catch {
    // If URL parsing fails, return a generic title
    return 'Schedule'
  }
}

/**
 * Generate a title from either a filename or URL
 * Automatically detects which one it is
 */
export function generateTitle(filenameOrUrl: string): string {
  // Check if it looks like a URL
  if (filenameOrUrl.startsWith('http://') || filenameOrUrl.startsWith('https://')) {
    return generateTitleFromUrl(filenameOrUrl)
  }
  
  // Otherwise treat as filename
  return generateTitleFromFilename(filenameOrUrl)
}

/**
 * Check if a title is generic/non-informative and should be replaced
 * with a generated title
 * 
 * Examples of generic titles: "iCal", "Schedule", "Calendar", etc.
 */
export function isGenericTitle(title: string | undefined): boolean {
  if (!title || title.trim() === '') {
    return true
  }
  
  const normalized = title.toLowerCase().trim()
  
  // Check if it's exactly a generic keyword
  if (GENERIC_TITLES.has(normalized)) {
    return true
  }
  
  // Check if it's a format identifier
  if (FORMAT_IDENTIFIERS.has(normalized)) {
    return true
  }
  
  return false
}

/**
 * Get the best title: use provided title if meaningful, otherwise use fallback
 */
export function getBestTitle(providedTitle: string | undefined, fallbackTitle: string): string {
  if (isGenericTitle(providedTitle)) {
    return fallbackTitle
  }
  return providedTitle!
}
