import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_AUTO_RELOAD_MINUTES } from '../utils/constants'

export type ViewMode = 'card' | 'table'
export type TimezoneMode = 'device' | 'schedule'

export type ViewParams = {
  viewMode: ViewMode
  showTimeRange: boolean
  showDuration: boolean
  timezoneMode: TimezoneMode
  autoReloadMinutes: number | null
}

const STORAGE_KEY = 'viewParams:v2'

/**
 * Custom hook for managing view parameters with localStorage persistence.
 */
export function useViewParams() {
  const [viewParams, setViewParams] = useState<ViewParams>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) throw new Error('No stored view params')
      
      const obj = JSON.parse(raw)
      return {
        viewMode: obj.viewMode === 'table' ? 'table' : 'card',
        showTimeRange: obj.showTimeRange !== false,
        showDuration: obj.showDuration === true, 
        timezoneMode: obj.timezoneMode === 'device' ? 'device' : 'schedule',
        autoReloadMinutes:
          obj.autoReloadMinutes === null ? null : Number(obj.autoReloadMinutes) || DEFAULT_AUTO_RELOAD_MINUTES,
      }
    } catch {
      return {
        viewMode: 'table', 
        showTimeRange: true,
        showDuration: false, 
        timezoneMode: 'schedule',
        autoReloadMinutes: DEFAULT_AUTO_RELOAD_MINUTES,
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
