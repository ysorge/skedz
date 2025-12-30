import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import FiltersSidebar from '../components/FiltersSidebar'
import SessionList from '../components/SessionList'
import { DEFAULT_FILTERS, applyFilters, uniqSorted, type Filters } from '../utils/filters'
import { downloadTextFile, sessionsToCsv, sessionsToIcs, sessionsToJson } from '../utils/export'
import { useScheduleManager } from '../hooks/useScheduleManager'
import { useLikedSessions } from '../hooks/useLikedSessions'
import { useReminders } from '../hooks/useReminders'
import { useViewParams } from '../hooks/useViewParams'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import { isCongressRunning, isCongressOver } from '../utils/congressState'
import type { Session } from '../data/normalizeSchedule'

// Lazy load components that aren't needed on initial render
const EndpointScreen = lazy(() => import('../components/EndpointScreen'))
const SessionModal = lazy(() => import('../components/SessionModal'))

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function App() {
  // Custom hooks for separated concerns
  const { scheduleData, loading, loadSchedule, saveNewSchedule, updateSchedule, clearSchedule } = useScheduleManager()
  const { viewParams, updateViewParams } = useViewParams()

  const sessions = scheduleData?.sessions ?? null
  const scheduleKey = scheduleData?.scheduleKey

  const { likedIds, likedSessions, showMyChoicesOnly, toggleLike, toggleMyChoicesFilter } = useLikedSessions(
    scheduleKey,
    sessions
  )

  const {
    reminderSettings,
    reminderStatusText,
    notificationSupport,
    updateSettings: updateReminderSettings,
    requestPermission,
  } = useReminders(scheduleKey, likedSessions, sessions)

  const { refreshState, canRefresh, refreshNow } = useAutoRefresh(
    scheduleData?.endpointUrl,
    viewParams.autoReloadMinutes,
    async data => {
      await updateSchedule({
        conferenceTitle: data.conferenceTitle,
        conferenceTimeZoneName: data.conferenceTimeZoneName,
        sessions: data.sessions,
        fetchedAt: data.fetchedAt,
      })
    }
  )

  // Local UI state
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<Session | null>(null)
  const [showPastSessions, setShowPastSessions] = useState(() => {
    const stored = localStorage.getItem('showPastSessions')
    return stored === 'true'
  })

  // PWA install prompt
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)

  // Toggle past sessions visibility and persist to localStorage
  const togglePastSessions = () => {
    setShowPastSessions(prev => {
      const next = !prev
      localStorage.setItem('showPastSessions', String(next))
      return next
    })
  }

  // Force re-render every minute to update live indicators and session states
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!sessions) return
    
    // Update every 30 seconds during congress
    const interval = setInterval(() => {
      setTick(tick => tick + 1)
    }, 30000) // 30 seconds
    
    return () => clearInterval(interval)
  }, [sessions])

  // Determine congress state
  const congressRunning = useMemo(() => sessions ? isCongressRunning(sessions) : false, [sessions])
  const congressOver = useMemo(() => sessions ? isCongressOver(sessions) : false, [sessions])

  // Load schedule on mount
  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  // Capture PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      console.log('beforeinstallprompt event fired')
      e.preventDefault()
      const promptEvent = e as BeforeInstallPromptEvent
      setDeferredPrompt(promptEvent)
      setShowInstallPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    
    // Debug: Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('App is already installed')
    } else {
      console.log('App is not installed, waiting for beforeinstallprompt event')
    }
    
    // Fallback: Show install button after 3 seconds if event hasn't fired
    // This helps on browsers that delay the event
    const fallbackTimer = setTimeout(() => {
      console.log('Fallback: checking if app is installable after 3s')
      // If we still don't have the prompt, check if standalone mode
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        console.log('App not in standalone mode, may be installable')
      }
    }, 3000)
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(fallbackTimer)
    }
  }, [])

  // Handle install prompt
  async function handleInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstallPrompt(false)
  }

  function dismissInstall() {
    setShowInstallPrompt(false)
  }

  // Compute facets for filters
  const facets = useMemo(() => {
    const s = sessions ?? []
    return {
      tracks: uniqSorted(s.map(x => x.track)),
      days: uniqSorted(s.map(x => x.dayKey)),
      rooms: uniqSorted(s.map(x => x.room)),
      types: uniqSorted(s.map(x => x.type)),
      languages: uniqSorted(s.map(x => x.language)),
    }
  }, [sessions])

  // Apply filters
  const filtered = useMemo(() => {
    if (!sessions) return []
    let result = applyFilters(sessions, filters)
    if (showMyChoicesOnly) {
      result = result.filter(s => likedIds.has(s.id))
    }
    return result
  }, [sessions, filters, showMyChoicesOnly, likedIds])

  // Handle new schedule loaded from endpoint or file
  async function onLoaded(data: {
    endpointUrl?: string
    sourceLabel?: string
    conferenceTitle?: string
    conferenceTimeZoneName?: string
    sessions: Session[]
    fetchedAt: string
  }) {
    await saveNewSchedule({
      endpointUrl: data.endpointUrl,
      sourceLabel: data.sourceLabel,
      conferenceTitle: data.conferenceTitle,
      conferenceTimeZoneName: data.conferenceTimeZoneName,
      sessions: data.sessions,
      fetchedAt: data.fetchedAt,
    })
    setFilters(DEFAULT_FILTERS)
    setSelected(null)
  }

  // Change source handler
  async function changeSource() {
    await clearSchedule()
    setFilters(DEFAULT_FILTERS)
    setSelected(null)
  }

  // Export functions
  function exportIcs() {
    const calName = `My Choices — ${scheduleData?.conferenceTitle ?? 'Schedule'}`
    const uidSalt = scheduleData?.endpointUrl
      ? encodeURIComponent(scheduleData.endpointUrl).slice(0, 24)
      : scheduleData?.sourceLabel ?? 'offline'
    const ics = sessionsToIcs({ sessions: likedSessions, calendarName: calName, uidSalt })
    downloadTextFile('my-choices.ics', ics, 'text/calendar;charset=utf-8')
  }

  function exportJson() {
    const meta = {
      exportedAt: new Date().toISOString(),
      sourceUrl: scheduleData?.endpointUrl ?? null,
      sourceLabel: scheduleData?.sourceLabel ?? null,
      conferenceTitle: scheduleData?.conferenceTitle ?? null,
      scheduleTimeZoneName: scheduleData?.conferenceTimeZoneName ?? null,
      fetchedAt: scheduleData?.fetchedAt ?? null,
    }
    const txt = sessionsToJson({ sessions: likedSessions, meta })
    downloadTextFile('my-choices.json', txt, 'application/json;charset=utf-8')
  }

  function exportCsv() {
    const txt = sessionsToCsv(likedSessions)
    downloadTextFile('my-choices.csv', txt, 'text/csv;charset=utf-8')
  }

  // Loading state
  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="cardBody">Loading…</div>
        </div>
      </div>
    )
  }

  // No schedule loaded - show endpoint screen
  if (!sessions) {
    return (
      <Suspense fallback={<div className="container"><div className="card"><div className="cardBody">Loading…</div></div></div>}>
        <EndpointScreen 
          initialUrl={scheduleData?.endpointUrl} 
          onLoaded={onLoaded}
          showInstallButton={!!deferredPrompt}
          onInstall={handleInstall}
        />
      </Suspense>
    )
  }

  const liked = selected ? likedIds.has(selected.id) : false

  return (
    <>
      <div className="navBar" onClick={changeSource}>
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>Home</span>
      </div>

      <div className="container">
        {showInstallPrompt && (
          <div className="installPrompt">
            <div className="installPromptContent">
              <p>Install this app for offline access?</p>
              <div className="installPromptButtons">
                <button onClick={handleInstall} className="btnInstall">Install</button>
                <button onClick={dismissInstall} className="btnDismiss">Not now</button>
              </div>
            </div>
          </div>
        )}

        {scheduleData?.conferenceTitle && (
          <h1 className="conferenceTitle">{scheduleData.conferenceTitle}</h1>
        )}
      
        <div className="appShell">
        <SessionList
          sessions={filtered}
          fetchedAt={scheduleData?.fetchedAt}
          onSelect={s => setSelected(s)}
          viewMode={viewParams.viewMode}
          showTimeRange={viewParams.showTimeRange}
          showDuration={viewParams.showDuration}
          timezoneMode={viewParams.timezoneMode}
          scheduleTimeZoneName={scheduleData?.conferenceTimeZoneName}
          likedIds={likedIds}
          onToggleLike={toggleLike}
          congressRunning={congressRunning}
          congressOver={congressOver}
          showPastSessions={showPastSessions}
          onTogglePastSessions={togglePastSessions}
        />

        <FiltersSidebar
          filters={filters}
          onChange={setFilters}
          facets={facets}
          onReset={() => setFilters(DEFAULT_FILTERS)}
          onChangeSource={changeSource}
          viewParams={viewParams}
          onChangeViewParams={updateViewParams}
          canRefresh={canRefresh}
          onRefresh={refreshNow}
          refreshState={refreshState}
          likedCount={likedIds.size}
          showMyChoicesOnly={showMyChoicesOnly}
          onToggleMyChoices={toggleMyChoicesFilter}
          onExportIcs={exportIcs}
          onExportJson={exportJson}
          onExportCsv={exportCsv}
          reminderSettings={reminderSettings}
          onChangeReminderSettings={updateReminderSettings}
          onRequestNotificationPermission={requestPermission}
          notificationSupport={notificationSupport}
          reminderStatusText={reminderStatusText}
        />
      </div>

      <Suspense fallback={null}>
        <SessionModal
          session={selected}
          onClose={() => setSelected(null)}
          liked={liked}
          onToggleLike={() => {
            if (selected) toggleLike(selected.id)
          }}
          timezoneMode={viewParams.timezoneMode}
          scheduleTimeZoneName={scheduleData?.conferenceTimeZoneName}
        />
      </Suspense>

      <div style={{ marginTop: 14 }} className="muted">
        Offline-first: schedule data and your favorites are saved independently on this device. Your liked sessions
        persist even when schedule data is refreshed. Exports are generated locally. Local reminders work without a
        server, but require the app to be running.
        {scheduleData?.endpointUrl ? (
          <>
            {' '}
            Source: <span>{scheduleData.endpointUrl}</span>
          </>
        ) : (
          <>
            {' '}
            Source: <span>{scheduleData?.sourceLabel ?? 'imported file'}</span>
          </>
        )}
      </div>
    </div>
    </>
  )
}
