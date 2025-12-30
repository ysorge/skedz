import React, { useMemo, useState, useRef, useEffect } from 'react'
import type { Session } from '../data/normalizeSchedule'
import { fetchAndParseSchedule } from '../data/fetchSchedule'
import { normalizeSchedule } from '../data/normalizeSchedule'
import { loadSchedule } from '../data/storage'
import ScheduleLibrary from './ScheduleLibrary'
import { showNotification } from '../utils/showNotification'

async function readFileAsText(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

export default function EndpointScreen(props: {
  initialUrl?: string
  showInstallButton?: boolean
  onInstall?: () => void
  onLoaded: (data: {
    endpointUrl?: string
    sourceLabel?: string
    conferenceTitle?: string
    conferenceTimeZoneName?: string
    sessions: Session[]
    fetchedAt: string
  }) => void
}) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dlg = dialogRef.current
    if (!dlg) return
    if (showUrlModal) {
      if (!dlg.open) dlg.showModal()
    } else {
      if (dlg.open) dlg.close()
    }

    const onCancel = (e: Event) => {
      e.preventDefault()
      setShowUrlModal(false)
      setError(null)
    }
    dlg.addEventListener('cancel', onCancel)
    return () => dlg.removeEventListener('cancel', onCancel)
  }, [showUrlModal])

  const hint = useMemo(() => {
    if (!url.trim()) return 'Please enter a schema.json URL.'
    try { new URL(url); return null } catch { return 'Please enter a valid URL.' }
  }, [url])

  async function loadFromUrl() {
    setShowUrlModal(false)
    setBusy(true)
    setError(null)
    try {
      const out = await fetchAndParseSchedule(url.trim())
      const fetchedAt = new Date().toISOString()
      props.onLoaded({
        endpointUrl: url.trim(),
        conferenceTitle: out.conferenceTitle,
        conferenceTimeZoneName: out.conferenceTimeZoneName,
        sessions: out.sessions,
        fetchedAt,
      })
    } catch (e: any) {
      const errorMsg = String(e?.message ?? e)
      // Detect CORS errors and provide helpful guidance
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('CORS') || errorMsg.includes('NetworkError')) {
        setError(
          `Network error: The server may be blocking CORS requests from browsers. ` +
          `Please download the JSON file and use "Import file" instead.`
        )
      } else {
        setError(errorMsg)
      }
      setShowUrlModal(true)
    } finally {
      setBusy(false)
    }
  }

  async function loadFromFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const text = await readFileAsText(file)
      const json = JSON.parse(text)
      const out = normalizeSchedule(json)
      const fetchedAt = new Date().toISOString()
      props.onLoaded({
        sourceLabel: file.name,
        conferenceTitle: out.conferenceTitle,
        conferenceTimeZoneName: out.conferenceTimeZoneName,
        sessions: out.sessions,
        fetchedAt,
      })
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function loadFromLibrary(key: string) {
    setBusy(true)
    setError(null)
    try {
      const stored = await loadSchedule(key)
      if (!stored || !stored.sessions?.length) {
        throw new Error('Schedule not found or empty')
      }
      
      const fetchedAt = stored.fetchedAt
      props.onLoaded({
        endpointUrl: stored.endpointUrl,
        sourceLabel: stored.sourceLabel,
        conferenceTitle: stored.conferenceTitle,
        conferenceTimeZoneName: stored.conferenceTimeZoneName,
        sessions: stored.sessions.map(s => ({ ...s, start: new Date(s.start) })),
        fetchedAt,
      })
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {busy && (
        <div className="loadingOverlay">
          <div className="loadingContent">
            <div className="loadingText">Loading schedule</div>
            <div className="loadingDots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      )}

      <div className="navBar navBarLogo">
        <picture>
          <source srcSet="/pwa-icons/logo-dark.svg" media="(prefers-color-scheme: dark)" />
          <img src="/pwa-icons/logo-bright.svg" alt="Skedz logo" width="32" height="32" />
        </picture>
        <span>Skedz</span>
      </div>

      <div className="container" style={{ marginBottom: '16px' }}>
        {props.showInstallButton && (
          <div className="card">
            <div className="cardBody" style={{ textAlign: 'center' }}>
              <button className="btn btnInstallApp" onClick={props.onInstall}>
                Install App
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <div className="cardHeader">
            <h2>Add Schedule</h2>
            <p className="muted">
              Load a schedule from a URL (with auto-refresh support) or import a downloaded schedule.json file. Both options require JSON format.
            </p>
          </div>

          <div className="cardBody" style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => setShowUrlModal(true)} disabled={busy}>
              Load from URL
            </button>

            <label className="btn" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
              Import file
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                disabled={busy}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) loadFromFile(f)
                  e.currentTarget.value = ''
                }}
              />
            </label>
          </div>
        </div>

        <ScheduleLibrary onSelectSchedule={loadFromLibrary} />
      </div>

      <dialog ref={dialogRef}>
        <div className="modalHeader">
          <h3>Load from URL</h3>
          <button className="btn" onClick={() => { setShowUrlModal(false); setError(null); }}>×</button>
        </div>
        <div className="modalBody">
          <div className="field">
            <input 
              className="inputModal"
              value={url} 
              onChange={e => setUrl(e.target.value)} 
              placeholder=""
              autoFocus
            />
            {hint ? <div className="muted">{hint}</div> : null}
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            Paste a schedule JSON URL. The app stores the schedule and your choices locally for offline use. When using a URL, you can also enable auto-refresh.
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            Example:{' '}
            <span 
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={async () => {
                const exampleUrl = 'https://api.events.ccc.de/congress/2025/schedule.json'
                try {
                  await navigator.clipboard.writeText(exampleUrl)
                  setUrl(exampleUrl)
                } catch {
                  setUrl(exampleUrl)
                }
              }}
            >
              https://api.events.ccc.de/congress/2025/schedule.json
            </span>
            {' '}(tap to copy)
          </div>

          {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
        </div>
        <div className="modalFooter" style={{ padding: '1rem', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => { setShowUrlModal(false); setError(null); setUrl(''); }}>
            Cancel
          </button>
          <button className="btn btnPrimary" onClick={loadFromUrl} disabled={busy || Boolean(hint)}>
            {busy ? 'Loading…' : 'Load schedule'}
          </button>
        </div>
      </dialog>
    </>
  )
}
