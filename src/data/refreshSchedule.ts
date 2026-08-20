/**
 * Keep the schedule's established display title when refreshing its source.
 *
 * The stored title may have been chosen during import or changed later by the
 * user. A refresh updates source data, but must not undo either choice. The
 * refreshed source title is only used for schedules that do not have a title.
 */
export function resolveRefreshedConferenceTitle(
  storedTitle: string | undefined,
  sourceTitle: string | undefined
): string | undefined {
  return storedTitle ?? sourceTitle
}
