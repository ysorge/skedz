import React, { useRef, useEffect } from 'react'
import type { Session } from '../data/normalizeSchedule'
import type { TimezoneMode } from '../hooks/useViewParams'
import { formatRange } from '../utils/relativeTime'
import { MILLISECONDS_PER_MINUTE } from '../utils/constants'
import { parseMarkdown } from '../utils/markdown'
import HeartIcon from './HeartIcon'

function formatTimeInZone(date: Date, timeZone?: string): string {
  if (!timeZone) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone }).format(date)
  } catch {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}

function formatRangeInZone(start: Date, durationMinutes?: number, timeZone?: string): { from: string; to: string | null } {
  const from = formatTimeInZone(start, timeZone)
  if (typeof durationMinutes !== 'number') return { from, to: null }
  const end = new Date(start.getTime() + durationMinutes * MILLISECONDS_PER_MINUTE)
  const to = formatTimeInZone(end, timeZone)
  return { from, to }
}

export default function SessionModal(props: {
  session: Session | null
  onClose: () => void
  liked: boolean
  onToggleLike: () => void
  timezoneMode: TimezoneMode
  scheduleTimeZoneName?: string
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const dlg = dialogRef.current
    if (!dlg) return
    if (props.session) {
      if (!dlg.open) {
        dlg.showModal()
        // Focus the close button when modal opens for accessibility
        setTimeout(() => closeButtonRef.current?.focus(), 0)
      }
    } else {
      if (dlg.open) dlg.close()
    }

    const onCancel = (e: Event) => {
      e.preventDefault()
      props.onClose()
    }
    
    // Trap focus within modal
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        props.onClose()
      }
    }
    
    dlg.addEventListener('cancel', onCancel)
    dlg.addEventListener('keydown', handleKeyDown)
    
    return () => {
      dlg.removeEventListener('cancel', onCancel)
      dlg.removeEventListener('keydown', handleKeyDown)
    }
  }, [props.session, props.onClose])

  const s = props.session
  const tz =
    props.timezoneMode === 'device'
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Device timezone')
      : (props.scheduleTimeZoneName ?? 'Schedule timezone')

  const timeLine = s ? (() => {
    if (props.timezoneMode === 'schedule') {
      const { from, to } = formatRangeInZone(s.start, s.durationMinutes, props.scheduleTimeZoneName)
      return to ? `${from} - ${to}` : from
    }
    const { from, to } = formatRange(s.start, s.durationMinutes)
    return to ? `${from} - ${to}` : from
  })() : ''

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        // click outside closes
        const dlg = dialogRef.current
        if (!dlg) return
        const rect = dlg.getBoundingClientRect()
        const inDialog =
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        if (!inDialog) props.onClose()
      }}
      className="modal"
      aria-labelledby="modal-title"
      aria-modal="true"
    >
      {s ? (
        <div className="modalBody">
          <div className="modalHeader">
            <div style={{ minWidth: 0 }}>
              <h2 id="modal-title" className="modalTitle">{s.title}</h2>
              <div className="muted" style={{ marginTop: 6 }}>
                <span className="mono">{timeLine}</span>
                {typeof s.durationMinutes === 'number' ? <> · <span className="mono">{s.durationMinutes}m</span></> : null}
                {s.room ? <> · <span className="mono">{s.room}</span></> : null}
                <span className="mono"> · {tz}</span>
              </div>
            </div>

            <div className="row" style={{ gap: 10 }}>
              <button
                className="iconBtn"
                onClick={props.onToggleLike}
                aria-label={props.liked ? 'Remove from favorites' : 'Add to favorites'}
                title={props.liked ? 'Unlike' : 'Like'}
              >
                <HeartIcon filled={props.liked} />
              </button>
              <button
                ref={closeButtonRef}
                className="btn"
                onClick={props.onClose}
                aria-label="Close session details"
              >
                Close
              </button>
            </div>
          </div>

          <div className="modalContent stack">
            <div className="sessionMeta">
              {s.track ? <span className="pill">{s.track}</span> : null}
              {s.type ? <span className="pill">{s.type}</span> : null}
              {s.language ? <span className="pill">{s.language}</span> : null}
            </div>

            {s.speakers?.length ? (
              <div>
                <h3>Speakers</h3>
                <div>{s.speakers.join(', ')}</div>
              </div>
            ) : null}

            {s.abstract ? (
              <div>
                <h3>Abstract</h3>
                <div className="prose" dangerouslySetInnerHTML={{ __html: parseMarkdown(s.abstract) }} />
              </div>
            ) : null}

            {s.description ? (
              <div>
                <h3>Description</h3>
                <div className="prose" dangerouslySetInnerHTML={{ __html: parseMarkdown(s.description) }} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
