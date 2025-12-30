import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchAndParseSchedule } from '../data/fetchSchedule'
import { MILLISECONDS_PER_MINUTE, MIN_AUTO_RELOAD_MINUTES } from '../utils/constants'

export type RefreshState = {
  busy: boolean
  error: string | null
  lastAttemptAt?: string
}

/**
 * Custom hook for managing schedule auto-refresh functionality.
 */
export function useAutoRefresh(
  endpointUrl: string | undefined,
  autoReloadMinutes: number | null,
  onRefreshSuccess: (data: {
    conferenceTitle?: string
    conferenceTimeZoneName?: string
    sessions: any[]
    fetchedAt: string
  }) => Promise<void>
) {
  const [refreshState, setRefreshState] = useState<RefreshState>({
    busy: false,
    error: null,
  })

  const timerRef = useRef<number | null>(null)

  const refreshNow = useCallback(
    async (reason: 'manual' | 'auto') => {
      if (!endpointUrl) {
        setRefreshState({
          busy: false,
          error: 'No endpoint URL available',
        })
        return
      }

      if (refreshState.busy) return

      setRefreshState({ busy: true, error: null, lastAttemptAt: new Date().toISOString() })

      try {
        const result = await fetchAndParseSchedule(endpointUrl)
        const timestamp = new Date().toISOString()

        await onRefreshSuccess({
          conferenceTitle: result.conferenceTitle,
          conferenceTimeZoneName: result.conferenceTimeZoneName,
          sessions: result.sessions,
          fetchedAt: timestamp,
        })

        setRefreshState({
          busy: false,
          error: null,
          lastAttemptAt: new Date().toISOString(),
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        setRefreshState({
          busy: false,
          error: `${reason === 'auto' ? 'Auto refresh' : 'Refresh'} failed: ${errorMessage}`,
          lastAttemptAt: new Date().toISOString(),
        })
      }
    },
    [endpointUrl, refreshState.busy, onRefreshSuccess]
  )

  // Set up auto-refresh timer
  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (!endpointUrl || autoReloadMinutes === null) return

    const ms = Math.max(MIN_AUTO_RELOAD_MINUTES, autoReloadMinutes) * MILLISECONDS_PER_MINUTE
    timerRef.current = window.setInterval(() => refreshNow('auto'), ms)

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [endpointUrl, autoReloadMinutes, refreshNow])

  const manualRefresh = useCallback(() => {
    refreshNow('manual')
  }, [refreshNow])

  const clearError = useCallback(() => {
    setRefreshState(prev => ({ ...prev, error: null }))
  }, [])

  return {
    refreshState,
    canRefresh: Boolean(endpointUrl),
    refreshNow: manualRefresh,
    clearError,
  }
}
