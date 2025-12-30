import { useState, useCallback, useEffect } from 'react'
import { loadUserPreferences, updateLikedSessions } from '../data/userPreferences'
import type { ScheduleKey } from '../data/storage'
import type { Session } from '../data/normalizeSchedule'

/**
 * Custom hook for managing liked/favorited sessions.
 * Persists independently from schedule data to prevent loss on refresh.
 */
export function useLikedSessions(scheduleKey: ScheduleKey | undefined, sessions: Session[] | null) {
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [showMyChoicesOnly, setShowMyChoicesOnly] = useState(false)

  // Load liked sessions when schedule key changes
  useEffect(() => {
    console.log('[useLikedSessions] scheduleKey changed:', scheduleKey)
    if (!scheduleKey) {
      console.log('[useLikedSessions] Clearing liked sessions (no schedule key)')
      setLikedIds(new Set())
      setShowMyChoicesOnly(false)
      return
    }

    let cancelled = false

    loadUserPreferences(scheduleKey).then(prefs => {
      if (!cancelled) {
        console.log('[useLikedSessions] Loaded preferences for key:', scheduleKey, 'liked count:', prefs.likedSessionIds.length)
        setLikedIds(new Set(prefs.likedSessionIds))
      }
    })

    return () => {
      cancelled = true
    }
  }, [scheduleKey])

  const toggleLike = useCallback(
    async (sessionId: string) => {
      if (!scheduleKey) return

      const nextLiked = new Set(likedIds)
      if (nextLiked.has(sessionId)) {
        nextLiked.delete(sessionId)
      } else {
        nextLiked.add(sessionId)
      }

      setLikedIds(nextLiked)

      // Auto-disable "My Choices" filter if no liked sessions remain
      if (nextLiked.size === 0 && showMyChoicesOnly) {
        setShowMyChoicesOnly(false)
      }

      try {
        await updateLikedSessions(scheduleKey, Array.from(nextLiked))
      } catch (error) {
        console.error('Failed to save liked sessions:', error)
        // Revert on failure
        setLikedIds(likedIds)
      }
    },
    [scheduleKey, likedIds, showMyChoicesOnly]
  )

  const likedSessions = useCallback(() => {
    if (!sessions) return []
    return sessions.filter(s => likedIds.has(s.id)).sort((a, b) => a.start.getTime() - b.start.getTime())
  }, [sessions, likedIds])

  const toggleMyChoicesFilter = useCallback(() => {
    setShowMyChoicesOnly(prev => !prev)
  }, [])

  return {
    likedIds,
    likedSessions: likedSessions(),
    showMyChoicesOnly,
    toggleLike,
    toggleMyChoicesFilter,
  }
}
