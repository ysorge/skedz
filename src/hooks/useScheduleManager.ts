import { useState, useCallback } from 'react'
import type { Session } from '../data/normalizeSchedule'
import {
  clearActiveKey,
  loadActiveSchedule,
  loadSchedule as loadScheduleFromStorage,
  saveSchedule,
  makeKeyFromUrl,
  makeKeyFromFile,
  type ScheduleKey,
} from '../data/storage'
import { loadUserPreferences } from '../data/userPreferences'
import { 
  loadScheduleLibrary,
  getLastActiveScheduleMetadata, 
  clearLastActiveSchedule,
  type ScheduleMetadata 
} from '../data/scheduleLibrary'
import { getDefaultAutoReload } from './useViewParams'
import { ensureNotificationPermission } from '../utils/reminders'
import { applyImportFilter, type ImportFilter } from '../utils/importParams'
import { resolveRefreshedConferenceTitle } from '../data/refreshSchedule'

export type ScheduleData = {
  scheduleKey: ScheduleKey
  endpointUrl?: string
  sourceLabel?: string
  conferenceTitle?: string
  conferenceTimeZoneName?: string
  fetchedAt: string
  sessions: Session[]
  autoReloadMinutes?: number | null
  importFilter?: ImportFilter
}

type ScheduleState = {
  data: ScheduleData | null
  loading: boolean
  error: string | null
}

/**
 * Custom hook for managing schedule data lifecycle:
 * - Loading from storage
 * - Saving new schedules
 * - Clearing schedules
 */
export function useScheduleManager() {
  const [state, setState] = useState<ScheduleState>({
    data: null,
    loading: true,
    error: null,
  })

  const loadSchedule = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      // First try to load the active schedule
      let stored = await loadActiveSchedule()
      
      // If no active schedule, try to load the last active from library
      if (!stored || !stored.sessions?.length) {
        const lastActive = await getLastActiveScheduleMetadata()
        if (lastActive?.key) {
          console.log('[useScheduleManager] No active schedule, loading last active from library:', lastActive.key)
          stored = await loadScheduleFromStorage(lastActive.key)
        }
      }
      
      if (stored?.sessions?.length) {
        const rawSessions = stored.sessions.map(s => ({ ...s, start: new Date(s.start) }))
        // Re-apply the stored import boundary defensively, in case sessions
        // were ever persisted before this was enforced.
        const sessions = applyImportFilter(rawSessions, stored.importFilter)
        const autoReloadMinutes = stored.autoReloadMinutes !== undefined 
          ? stored.autoReloadMinutes 
          : getDefaultAutoReload(sessions)
        
        setState({
          data: {
            scheduleKey: stored.key,
            endpointUrl: stored.endpointUrl,
            sourceLabel: stored.sourceLabel,
            conferenceTitle: stored.conferenceTitle,
            conferenceTimeZoneName: stored.conferenceTimeZoneName,
            fetchedAt: stored.fetchedAt,
            sessions,
            autoReloadMinutes,
            importFilter: stored.importFilter,
          },
          loading: false,
          error: null,
        })
      } else {
        setState({ data: null, loading: false, error: null })
      }
    } catch (error) {
      console.error('Failed to load schedule:', error)
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load schedule',
      })
    }
  }, [])

  const saveNewSchedule = useCallback(
    async (params: {
      endpointUrl?: string
      sourceLabel?: string
      conferenceTitle?: string
      conferenceTimeZoneName?: string
      sessions: Session[]
      fetchedAt: string
      importFilter?: ImportFilter
    }) => {
      try {
        const key = params.endpointUrl
          ? makeKeyFromUrl(params.endpointUrl)
          : makeKeyFromFile(params.sourceLabel ?? 'imported-schedule')

        console.log('[useScheduleManager] Saving new schedule with key:', key)
        
        // Check if this is the first schedule ever
        const library = await loadScheduleLibrary()
        const isFirstSchedule = library.schedules.length === 0
        
        // Load existing user preferences for this schedule key
        const userPrefs = await loadUserPreferences(key)
        console.log('[useScheduleManager] Existing preferences found:', userPrefs.likedSessionIds.length, 'liked sessions')

        // Sessions outside the import boundary are cut off permanently and
        // never persisted.
        const sessions = applyImportFilter(params.sessions, params.importFilter)
        const autoReloadMinutes = getDefaultAutoReload(sessions)

        await saveSchedule({
          key,
          endpointUrl: params.endpointUrl,
          sourceLabel: params.sourceLabel,
          conferenceTitle: params.conferenceTitle,
          conferenceTimeZoneName: params.conferenceTimeZoneName,
          fetchedAt: params.fetchedAt,
          sessions: sessions.map(s => ({ ...s, start: s.start.toISOString() })),
          autoReloadMinutes,
          importFilter: params.importFilter,
        })

        setState({
          data: {
            scheduleKey: key,
            endpointUrl: params.endpointUrl,
            sourceLabel: params.sourceLabel,
            conferenceTitle: params.conferenceTitle,
            conferenceTimeZoneName: params.conferenceTimeZoneName,
            fetchedAt: params.fetchedAt,
            sessions,
            autoReloadMinutes,
            importFilter: params.importFilter,
          },
          loading: false,
          error: null,
        })

        // Request notification permission for first schedule
        if (isFirstSchedule) {
          console.log('[useScheduleManager] First schedule added, requesting notification permission')
          try {
            await ensureNotificationPermission()
          } catch (error) {
            console.warn('[useScheduleManager] Failed to request notification permission:', error)
          }
        }

        return { key, userPrefs }
      } catch (error) {
        console.error('Failed to save schedule:', error)
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to save schedule',
        }))
        throw error
      }
    },
    []
  )

  const updateSchedule = useCallback(
    async (params: {
      conferenceTitle?: string
      conferenceTimeZoneName?: string
      sessions: Session[]
      fetchedAt: string
    }) => {
      if (!state.data) {
        throw new Error('No active schedule to update')
      }

      try {
        // Re-apply the schedule's stored import boundary on every reload so
        // sessions outside the original range are never re-introduced.
        const sessions = applyImportFilter(params.sessions, state.data.importFilter)
        const conferenceTitle = resolveRefreshedConferenceTitle(
          state.data.conferenceTitle,
          params.conferenceTitle
        )
        const autoReloadMinutes = state.data.autoReloadMinutes !== undefined 
          ? state.data.autoReloadMinutes 
          : getDefaultAutoReload(sessions)

        await saveSchedule({
          key: state.data.scheduleKey,
          endpointUrl: state.data.endpointUrl,
          sourceLabel: state.data.sourceLabel,
          conferenceTitle,
          conferenceTimeZoneName: params.conferenceTimeZoneName,
          fetchedAt: params.fetchedAt,
          sessions: sessions.map(s => ({ ...s, start: s.start.toISOString() })),
          autoReloadMinutes,
          importFilter: state.data.importFilter,
        })

        setState({
          data: {
            ...state.data,
            conferenceTitle,
            conferenceTimeZoneName: params.conferenceTimeZoneName,
            fetchedAt: params.fetchedAt,
            sessions,
            autoReloadMinutes,
          },
          loading: false,
          error: null,
        })
      } catch (error) {
        console.error('Failed to update schedule:', error)
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to update schedule',
        }))
        throw error
      }
    },
    [state.data]
  )

  const clearSchedule = useCallback(async () => {
    try {
      console.log('[useScheduleManager] Clearing schedule')
      await clearActiveKey()
      await clearLastActiveSchedule()
      setState({ data: null, loading: false, error: null })
    } catch (error) {
      console.error('Failed to clear schedule:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to clear schedule',
      }))
    }
  }, [])

  const updateAutoReloadMinutes = useCallback(
    async (autoReloadMinutes: number | null) => {
      if (!state.data) {
        throw new Error('No active schedule to update')
      }

      try {
        await saveSchedule({
          key: state.data.scheduleKey,
          endpointUrl: state.data.endpointUrl,
          sourceLabel: state.data.sourceLabel,
          conferenceTitle: state.data.conferenceTitle,
          conferenceTimeZoneName: state.data.conferenceTimeZoneName,
          fetchedAt: state.data.fetchedAt,
          sessions: state.data.sessions.map(s => ({ ...s, start: s.start.toISOString() })),
          autoReloadMinutes,
          importFilter: state.data.importFilter,
        })

        setState({
          data: {
            ...state.data,
            autoReloadMinutes,
          },
          loading: false,
          error: null,
        })
      } catch (error) {
        console.error('Failed to update auto reload minutes:', error)
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to update auto reload',
        }))
        throw error
      }
    },
    [state.data]
  )

  return {
    scheduleData: state.data,
    loading: state.loading,
    error: state.error,
    loadSchedule,
    saveNewSchedule,
    updateSchedule,
    updateAutoReloadMinutes,
    clearSchedule,
  }
}
