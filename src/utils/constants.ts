/**
 * Application-wide constants
 */

// Time constants
export const MILLISECONDS_PER_MINUTE = 60_000
export const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE
export const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR

// Storage constants
export const MAX_SEARCH_QUERY_LENGTH = 500

// Reminder constants
export const REMINDER_OFFSET_OPTIONS = [0, 10] as const
export const MAX_REMINDER_ADVANCE_HOURS = 24

// Auto-reload defaults
export const DEFAULT_AUTO_RELOAD_MINUTES = 10
export const MIN_AUTO_RELOAD_MINUTES = 1
