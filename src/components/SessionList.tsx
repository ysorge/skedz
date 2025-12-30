import React from 'react'
import type { Session } from '../data/normalizeSchedule'
import type { ViewMode, TimezoneMode } from '../hooks/useViewParams'
import { formatDayLabel } from '../utils/date'
import { formatAge, formatRange } from '../utils/relativeTime'
import { isSessionCurrent, isSessionPast, countPastSessions } from '../utils/congressState'
import HeartIcon from './HeartIcon'

function groupByDay(sessions: Session[]): Array<{ dayKey: string; sessions: Session[] }> {
  const map = new Map<string, Session[]>()
  for (const s of sessions) {
    const arr = map.get(s.dayKey) ?? []
    arr.push(s)
    map.set(s.dayKey, arr)
  }
  const out = Array.from(map.entries()).map(([dayKey, sess]) => ({
    dayKey,
    sessions: sess.sort((a, b) => a.start.getTime() - b.start.getTime()),
  }))
  out.sort((a, b) => (a.sessions[0]?.start.getTime() ?? 0) - (b.sessions[0]?.start.getTime() ?? 0))
  return out
}

function formatTimeInZone(date: Date, timeZone?: string): string {
  if (!timeZone) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone }).format(date)
  } catch {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}

function formatRangeInZone(start: Date, durationMinutes?: number, timeZone?: string): { from: string; to: string | null } {
  const from = formatTimeInZone(start, timeZone)
  if (typeof durationMinutes !== 'number') return { from, to: null }
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const to = formatTimeInZone(end, timeZone)
  return { from, to }
}

function TimeBlock(props: {
  s: Session
  showTimeRange: boolean
  showDuration: boolean
  timezoneMode: TimezoneMode
  scheduleTimeZoneName?: string
}) {
  const zone = props.timezoneMode === 'schedule' ? props.scheduleTimeZoneName : undefined
  const { from, to } =
    props.timezoneMode === 'schedule'
      ? formatRangeInZone(props.s.start, props.s.durationMinutes, zone)
      : formatRange(props.s.start, props.s.durationMinutes)

  if (!props.showTimeRange) {
    return (
      <>
        {from}
        {props.showDuration && typeof props.s.durationMinutes === 'number' ? (
          <div className="mono" style={{ marginTop: 6 }}>{props.s.durationMinutes}m</div>
        ) : null}
      </>
    )
  }

  return (
    <>
      {to ? `${from} - ${to}` : from}
      {props.showDuration && typeof props.s.durationMinutes === 'number' ? (
        <div className="mono" style={{ marginTop: 6 }}>{props.s.durationMinutes}m</div>
      ) : null}
    </>
  )
}

export default function SessionList(props: {
  sessions: Session[]
  fetchedAt?: string
  onSelect: (s: Session) => void

  viewMode: ViewMode
  showTimeRange: boolean
  showDuration: boolean
  timezoneMode: TimezoneMode
  scheduleTimeZoneName?: string

  likedIds: Set<string>
  onToggleLike: (id: string) => void

  congressRunning: boolean
  congressOver: boolean
  showPastSessions: boolean
  onTogglePastSessions: () => void
}) {
  // Don't filter sessions - let CSS handle visibility with transitions
  // Just determine which sessions should be considered "past"
  const shouldHidePastSessions = props.congressRunning && !props.congressOver && !props.showPastSessions

  const pastSessionCount = props.congressRunning && !props.congressOver ? countPastSessions(props.sessions) : 0
  const grouped = groupByDay(props.sessions)
  const age = props.fetchedAt ? formatAge(props.fetchedAt) : null
  const tzLabel =
    props.timezoneMode === 'device'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Device timezone'
      : (props.scheduleTimeZoneName ?? 'Schedule timezone')

  // Find the first active (non-past) day group for "Show past sessions" button
  let firstActiveDayKey: string | null = null
  for (const g of grouped) {
    if (!g.sessions.every(s => isSessionPast(s))) {
      firstActiveDayKey = g.dayKey
      break
    }
  }
  // If all days are past, use the last day as the location for the button
  if (!firstActiveDayKey && grouped.length > 0) {
    firstActiveDayKey = grouped[grouped.length - 1].dayKey
  }

  // First day header is always the first group (for "Hide past sessions" button)
  const firstDayKey = grouped.length > 0 ? grouped[0].dayKey : null

  return (
    <div className="card">
      <div className="cardHeader" style={{ display: 'none' }}>
        <div className="titleRow">
          <span className="pill">{props.viewMode === 'table' ? 'Table' : 'Cards'}</span>
        </div>
      </div>

      <div className="cardBody" style={{ padding: 0 }}>
        {grouped.length === 0 ? (
          <div style={{ padding: 14 }} className="muted">No sessions match your filters.</div>
        ) : null}

        {grouped.map(g => {
          // Check if all sessions in this day are past
          const allSessionsPast = shouldHidePastSessions && g.sessions.every(s => isSessionPast(s))
          
          // Skip rendering this day header if all sessions are past and we're hiding past sessions
          if (allSessionsPast) {
            return null
          }
          
          return (
          <div key={g.dayKey}>
            <div className="dayHeader">
              <div className="dayHeaderTitle">{formatDayLabel(g.dayKey)} &ndash; {g.sessions.length} sessions</div>
            </div>
            
            {/* Show metadata and button below appropriate day header */}
            {/* When showing past sessions: render under first day. When hiding: render under first active day */}
            {g.dayKey === (props.showPastSessions ? firstDayKey : firstActiveDayKey) && (
              <>
                <div className="muted" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '8px 14px' }}>
                  {age ? <>Last download: <span className="mono">{age}</span></> : null}
                  <span className="mono">Timezone: {tzLabel}</span>
                </div>
                {pastSessionCount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 14px 14px' }}>
                    <button className="btn" onClick={props.onTogglePastSessions}>
                      {props.showPastSessions ? 'Hide' : 'Show'} past sessions ({pastSessionCount})
                    </button>
                  </div>
                )}
              </>
            )}

            {g.sessions.map(s => {
              const liked = props.likedIds.has(s.id)
              const isCurrent = isSessionCurrent(s)
              const isPast = isSessionPast(s)
              
              // Determine class names for session state
              const isHidden = shouldHidePastSessions && isPast
              const baseClass = props.viewMode === 'table' ? 'sessionRowTable' : 'sessionRowCard'
              const sessionClasses = [
                baseClass,
                isPast && props.showPastSessions ? 'sessionPast' : '',
                isHidden ? 'sessionHidden' : ''
              ].filter(Boolean).join(' ')

              if (props.viewMode === 'table') {
                const zone = props.timezoneMode === 'schedule' ? props.scheduleTimeZoneName : undefined
                const { from, to } =
                  props.timezoneMode === 'schedule'
                    ? formatRangeInZone(s.start, s.durationMinutes, zone)
                    : formatRange(s.start, s.durationMinutes)

                return (
                  <div
                    key={s.id}
                    className={sessionClasses}
                    onClick={() => props.onSelect(s)}
                    role="button"
                    tabIndex={0}
                    title="Open details"
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {props.congressRunning && (
                        <div className="liveIndicatorColumn">
                          {isCurrent && <div className="liveIndicator" title="Session is live now" />}
                        </div>
                      )}
                      <div className="mono">
                        {from}
                        {to && (
                          <>
                            <span className="timeRangeSeparator"> - </span>
                            <span className="timeRangeEnd">{to}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="sessionMain">
                      <div className="sessionTitle">{s.title}</div>
                    </div>
                    <div className="sessionRight">
                      <button
                        className={`iconBtn${liked ? ' iconBtnActive' : ''}`}
                        onClick={(e) => { e.stopPropagation(); props.onToggleLike(s.id) }}
                        aria-label={liked ? 'Unlike session' : 'Like session'}
                        title={liked ? 'Unlike' : 'Like'}
                      >
                        <HeartIcon filled={liked} />
                      </button>
                    </div>
                  </div>
                )
              }

              // card view 
              return (
                <div
                  key={s.id}
                  className={sessionClasses}
                  onClick={() => props.onSelect(s)}
                  role="button"
                  tabIndex={0}
                  title="Open details"
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    {props.congressRunning && (
                      <div className="liveIndicatorColumn">
                        {isCurrent && <div className="liveIndicator" title="Session is live now" />}
                      </div>
                    )}
                    <div className="mono">
                      <TimeBlock
                        s={s}
                        showTimeRange={props.showTimeRange}
                        showDuration={props.showDuration}
                        timezoneMode={props.timezoneMode}
                        scheduleTimeZoneName={props.scheduleTimeZoneName}
                      />
                    </div>
                  </div>

                  <div className="sessionMain">
                    <div className="sessionTitle">{s.title}</div>
                    <div className="sessionMeta">
                      {s.track ? <span className="pill">{s.track}</span> : null}
                      {s.room ? <span className="pill">{s.room}</span> : null}
                      {s.type ? <span className="pill">{s.type}</span> : null}
                      {s.language ? <span className="pill">{s.language}</span> : null}
                    </div>
                    {s.speakers?.length ? (
                      <div className="muted" style={{ marginTop: 8 }}>
                        <strong>Speakers:</strong> {s.speakers.join(', ')}
                      </div>
                    ) : null}
                  </div>

                  <div className="sessionRight">
                    <button
                      className={`iconBtn${liked ? ' iconBtnActive' : ''}`}
                      onClick={(e) => { e.stopPropagation(); props.onToggleLike(s.id) }}
                      aria-label={liked ? 'Unlike session' : 'Like session'}
                      title={liked ? 'Unlike' : 'Like'}
                    >
                      <HeartIcon filled={liked} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          )
        })}
      </div>
    </div>
  )
}
