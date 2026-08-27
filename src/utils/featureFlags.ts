/**
 * Feature flags for optional/sensitive functionality, configurable via
 * `.env` (see `.env.example`). Flags default to enabled unless explicitly
 * set to `"false"`, so no `.env` file is required for normal operation.
 */

function isEnabled(value: string | undefined, defaultValue = true): boolean {
  if (value === undefined) return defaultValue
  return value !== 'false'
}

/** Allow `?url=...&title=...` to override the imported schedule title. */
export const IMPORT_TITLE_PARAM_ENABLED = isEnabled(import.meta.env.VITE_ENABLE_IMPORT_TITLE_PARAM)

/** Allow `start`, `end`, and optional `timezone` parameters for a permanent import date range. */
export const IMPORT_DATERANGE_PARAM_ENABLED = isEnabled(import.meta.env.VITE_ENABLE_IMPORT_DATERANGE_PARAM)
