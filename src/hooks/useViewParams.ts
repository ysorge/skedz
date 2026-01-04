import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_AUTO_RELOAD_MINUTES, AUTO_RELOAD_BEFORE_CONGRESS } from '../utils/constants'
import type { Session } from '../data/normalizeSchedule'
import { isCongressOverForAtLeastOneDay, isCongressAtLeastFiveDaysAway } from '../utils/congressState'

export type ViewMode = 'card' | 'table'
export type TimezoneMode = 'device' | 'schedule'

export type ViewParams = {
  viewMode: ViewMode
  showTimeRange: boolean
  showDuration: boolean
  timezoneMode: TimezoneMode
}

const STORAGE_KEY = 'viewParams:v2'

/**
 * Calculate the default auto-reload interval based on congress timing.
 */
export function getDefaultAutoReload(sessions: Session[] | null): number | null {
  if (!sessions || sessions.length === 0) {
    return DEFAULT_AUTO_RELOAD_MINUTES
  }
  
  // If congress ended at least 1 day ago, set to Never
  if (isCongressOverForAtLeastOneDay(sessions)) {
    return null
  }
  
  // If congress is at least 5 days in the future, set to 12 hours
  if (isCongressAtLeastFiveDaysAway(sessions)) {
    return AUTO_RELOAD_BEFORE_CONGRESS
  }
  
  // Otherwise use default (60 minutes)
  return DEFAULT_AUTO_RELOAD_MINUTES
}

/**
 * Custom hook for managing view parameters with localStorage persistence.
 */
export function useViewParams(sessions: Session[] | null = null) {
  const [viewParams, setViewParams] = useState<ViewParams>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) throw new Error('No stored view params')
      
      const obj = JSON.parse(raw)
      return {
        viewMode: obj.viewMode === 'table' ? 'table' : 'card',
        showTimeRange: true,
        showDuration: false, 
        timezoneMode: obj.timezoneMode === 'device' ? 'device' : 'schedule',
      }
    } catch {
      return {
        viewMode: 'table', 
        showTimeRange: true,
        showDuration: false, 
        timezoneMode: 'schedule',
      }
    }
  })

  // Persist to localStorage whenever view params change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(viewParams))
    } catch (error) {
      console.error('Failed to save view params:', error)
    }
  }, [viewParams])

  const updateViewParams = useCallback((updates: Partial<ViewParams>) => {
    setViewParams(prev => ({ ...prev, ...updates }))
  }, [])

  return {
    viewParams,
    updateViewParams,
  }
}
