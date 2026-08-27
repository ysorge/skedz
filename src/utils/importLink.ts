const IMPORT_LINK_PARAM_NAMES = [
  'url',
  'title',
  'start',
  'startdate',
  'end',
  'enddate',
  'timezone',
] as const

/**
 * Removes a completed or dismissed direct-import request while preserving
 * unrelated query parameters and the URL fragment.
 */
export function removeImportLinkParams(rawUrl: string): string {
  const url = new URL(rawUrl)
  for (const name of IMPORT_LINK_PARAM_NAMES) {
    url.searchParams.delete(name)
  }

  return `${url.pathname}${url.search}${url.hash}`
}
