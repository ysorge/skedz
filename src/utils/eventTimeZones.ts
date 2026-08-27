export type EventCountryTimeZones = {
  code: string
  name: string
  timeZones: string[]
}

type LocaleWithTimeZones = Intl.Locale & {
  getTimeZones?: () => string[] | undefined
  readonly timeZones?: string[]
}

let cachedEventCountries: EventCountryTimeZones[] | undefined

/**
 * Resolve a country to the IANA zones supplied by the browser's ECMA-402 /
 * CLDR data. Older engines exposed the same data as a `timeZones` accessor.
 */
export function getTimeZonesForRegion(region: string): string[] {
  if (!/^[A-Z]{2}$/i.test(region)) return []
  try {
    const locale = new Intl.Locale(`und-${region.toUpperCase()}`) as LocaleWithTimeZones
    const values = typeof locale.getTimeZones === 'function'
      ? locale.getTimeZones()
      : locale.timeZones
    return [...new Set(values ?? [])].sort()
  } catch {
    return []
  }
}

/**
 * Build the country selector entirely from browser locale data. There is no
 * country-to-time-zone table in Skedz: two-letter candidates without zones
 * are discarded by the ECMA-402 implementation.
 */
export function getEventCountries(): EventCountryTimeZones[] {
  if (cachedEventCountries) return cachedEventCountries
  if (typeof Intl.Locale !== 'function' || typeof Intl.DisplayNames !== 'function') return []

  let displayNames: Intl.DisplayNames
  try {
    displayNames = new Intl.DisplayNames(undefined, { type: 'region' })
  } catch {
    return []
  }

  const countries: EventCountryTimeZones[] = []
  for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
      const code = String.fromCharCode(first, second)
      // Intl canonicalizes retired aliases (for example DD -> DE). Keeping
      // only canonical regions prevents duplicate, outdated country entries.
      try {
        if (new Intl.Locale(`und-${code}`).region !== code) continue
      } catch {
        continue
      }
      const timeZones = getTimeZonesForRegion(code)
      if (timeZones.length === 0) continue
      const name = displayNames.of(code)
      if (!name || name === code) continue
      countries.push({ code, name, timeZones })
    }
  }

  cachedEventCountries = countries.sort((a, b) => a.name.localeCompare(b.name))
  return cachedEventCountries
}
