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
  getLastActiveScheduleMetadata, 
  clearLastActiveSchedule,
  type ScheduleMetadata 
} from '../data/scheduleLibrary'

export type ScheduleData = {
  scheduleKey: ScheduleKey
  endpointUrl?: string
  sourceLabel?: string
  conferenceTitle?: string
  conferenceTimeZoneName?: string
  fetchedAt: string
  sessions: Session[]
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
        setState({
          data: {
            scheduleKey: stored.key,
            endpointUrl: stored.endpointUrl,
            sourceLabel: stored.sourceLabel,
            conferenceTitle: stored.conferenceTitle,
            conferenceTimeZoneName: stored.conferenceTimeZoneName,
            fetchedAt: stored.fetchedAt,
            sessions: stored.sessions.map(s => ({ ...s, start: new Date(s.start) })),
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
    }) => {
      try {
        const key = params.endpointUrl
          ? makeKeyFromUrl(params.endpointUrl)
          : makeKeyFromFile(params.sourceLabel ?? 'imported-schedule')

        console.log('[useScheduleManager] Saving new schedule with key:', key)
        // Load existing user preferences for this schedule key
        const userPrefs = await loadUserPreferences(key)
        console.log('[useScheduleManager] Existing preferences found:', userPrefs.likedSessionIds.length, 'liked sessions')

        await saveSchedule({
          key,
          endpointUrl: params.endpointUrl,
          sourceLabel: params.sourceLabel,
          conferenceTitle: params.conferenceTitle,
          conferenceTimeZoneName: params.conferenceTimeZoneName,
          fetchedAt: params.fetchedAt,
          sessions: params.sessions.map(s => ({ ...s, start: s.start.toISOString() })),
        })

        setState({
          data: {
            scheduleKey: key,
            endpointUrl: params.endpointUrl,
            sourceLabel: params.sourceLabel,
            conferenceTitle: params.conferenceTitle,
            conferenceTimeZoneName: params.conferenceTimeZoneName,
            fetchedAt: params.fetchedAt,
            sessions: params.sessions,
          },
          loading: false,
          error: null,
        })

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
        await saveSchedule({
          key: state.data.scheduleKey,
          endpointUrl: state.data.endpointUrl,
          sourceLabel: state.data.sourceLabel,
          conferenceTitle: params.conferenceTitle,
          conferenceTimeZoneName: params.conferenceTimeZoneName,
          fetchedAt: params.fetchedAt,
          sessions: params.sessions.map(s => ({ ...s, start: s.start.toISOString() })),
        })

        setState({
          data: {
            ...state.data,
            conferenceTitle: params.conferenceTitle,
            conferenceTimeZoneName: params.conferenceTimeZoneName,
            fetchedAt: params.fetchedAt,
            sessions: params.sessions,
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

  return {
    scheduleData: state.data,
    loading: state.loading,
    error: state.error,
    loadSchedule,
    saveNewSchedule,
    updateSchedule,
    clearSchedule,
  }
}
