import React, { useMemo, useState, useRef, useEffect } from 'react'
import type { Session } from '../data/normalizeSchedule'
import { fetchAndParseSchedule } from '../data/fetchSchedule'
import { parseSchedule, formatRegistry } from '../data/formats/registry'
import type { ScheduleFormat } from '../data/formats/types'
import { canonicalScheduleToAppFormat } from '../data/formatConverter'
import { loadSchedule } from '../data/storage'
import ScheduleLibrary from './ScheduleLibrary'
import { showNotification } from '../utils/showNotification'
import { generateTitle, getBestTitle } from '../utils/titleGenerator'

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
  const [format, setFormat] = useState<ScheduleFormat | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [showFileModal, setShowFileModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileFormat, setFileFormat] = useState<ScheduleFormat | ''>('')
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const fileDialogRef = useRef<HTMLDialogElement | null>(null)

  const allFormats = useMemo(() => formatRegistry.getAllFormats(), [])

  // Auto-detect format from URL
  useEffect(() => {
    if (!url.trim()) {
      setFormat('')
      return
    }
    
    const detected = formatRegistry.detectFormatFromUrl(url)
    if (detected) {
      setFormat(detected)
    } else {
      setFormat('')
    }
  }, [url])

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

  useEffect(() => {
    const dlg = fileDialogRef.current
    if (!dlg) return
    if (showFileModal) {
      if (!dlg.open) dlg.showModal()
    } else {
      if (dlg.open) dlg.close()
    }

    const onCancel = (e: Event) => {
      e.preventDefault()
      setShowFileModal(false)
      setSelectedFile(null)
      setFileFormat('')
      setError(null)
    }
    dlg.addEventListener('cancel', onCancel)
    return () => dlg.removeEventListener('cancel', onCancel)
  }, [showFileModal])

  const hint = useMemo(() => {
    if (!url.trim()) return 'Please enter a schedule URL.'
    try { new URL(url); return null } catch { return 'Please enter a valid URL.' }
  }, [url])

  async function loadFromUrl() {
    setShowUrlModal(false)
    setBusy(true)
    setError(null)
    try {
      const out = await fetchAndParseSchedule(url.trim(), format || undefined)
      
      // Generate a nice title from the URL
      const generatedTitle = generateTitle(url.trim())
      
      // Use the best title: prefer conference title from file unless it's generic
      const bestTitle = getBestTitle(out.conferenceTitle, generatedTitle)
      
      const fetchedAt = new Date().toISOString()
      props.onLoaded({
        endpointUrl: url.trim(),
        conferenceTitle: bestTitle,
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
          `Please download the file and use "Import file" instead.`
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
    setShowFileModal(false)
    setBusy(true)
    setError(null)
    try {
      const text = await readFileAsText(file)
      
      // Use selected format or auto-detect
      const formatToUse = fileFormat || formatRegistry.detectFormatFromExtension(file.name) || undefined
      
      const canonical = await parseSchedule(text, formatToUse)
      const out = canonicalScheduleToAppFormat(canonical)
      
      // Generate a nice title from the filename
      const generatedTitle = generateTitle(file.name)
      
      // Use the best title: prefer conference title from file unless it's generic
      const bestTitle = getBestTitle(out.conferenceTitle, generatedTitle)
      
      const fetchedAt = new Date().toISOString()
      props.onLoaded({
        sourceLabel: generatedTitle,
        conferenceTitle: bestTitle,
        conferenceTimeZoneName: out.conferenceTimeZoneName,
        sessions: out.sessions,
        fetchedAt,
      })
    } catch (e: any) {
      const errorMsg = String(e?.message ?? e)
      setError(errorMsg)
      setShowFileModal(true) // Show modal again with error
    } finally {
      setBusy(false)
    }
  }

  function handleFileSelect(file: File) {
    setSelectedFile(file)
    // Auto-detect format from filename
    const detected = formatRegistry.detectFormatFromExtension(file.name)
    setFileFormat(detected || '')
    setError(null)
    setShowFileModal(true)
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

      <div className="container">

        <div className="card">
          <div className="cardHeader">
            <h2>Add Schedule</h2>
            <p className="muted">
              Load a schedule from a URL (with auto-refresh support) or import a downloaded file. Supports multiple formats: JSON, XML, XCal, and iCal.
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
                accept=".json,.xml,.xcal,.xcs,.ical,.ics"
                style={{ display: 'none' }}
                disabled={busy}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleFileSelect(f)
                  e.currentTarget.value = ''
                }}
              />
            </label>
          </div>
        </div>

        <ScheduleLibrary onSelectSchedule={loadFromLibrary} />

              
        {props.showInstallButton && (
          <div className="card" style={{ marginTop: '16px' }}>
            <div className="cardBody" style={{ textAlign: 'center' }}>
              <button className="btn btnInstallApp" onClick={props.onInstall}>
                Install App
              </button>
            </div>
          </div>
        )}


        <div style={{ textAlign: 'center', marginTop: '24px', paddingBottom: '20px' }}>
          <div className="muted" style={{ fontSize: '12px' }}>
            Version {import.meta.env.VITE_APP_VERSION || '0.1.0'}
          </div>
        </div>
      </div>

      <dialog ref={dialogRef}>
        <div className="modalHeader">
          <h3>Load from URL</h3>
          <button className="btn btnClose" onClick={() => { setShowUrlModal(false); setError(null); }}>×</button>
        </div>
        <div className="modalBody">
          <div className="field">
            <label>URL</label>
            <input 
              className="inputModal"
              value={url} 
              onChange={e => setUrl(e.target.value)} 
              placeholder="https://..."
              autoFocus
            />
            {hint ? <div className="muted">{hint}</div> : null}
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Format</label>
            <select
              value={format}
              onChange={e => setFormat(e.target.value as ScheduleFormat | '')}
              style={{ width: '100%' }}
            >
              <option value="">Auto-detect</option>
              {allFormats.map(fmt => (
                <option key={fmt.id} value={fmt.id}>
                  {fmt.label}
                </option>
              ))}
            </select>
            <div className="muted" style={{ marginTop: 4, fontSize: '12px' }}>
              Format is auto-detected from URL. Select manually if detection fails.
            </div>
          </div>

          <div className="muted" style={{ marginTop: 12 }}>
            Paste a schedule URL. The app stores the schedule and your choices locally for offline use. When using a URL, you can also enable auto-refresh.
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            Examples:{' '}
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
              JSON
            </span>
            {' · '}
            <span 
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={async () => {
                const exampleUrl = 'https://fosdem.org/2026/schedule/xml'
                try {
                  await navigator.clipboard.writeText(exampleUrl)
                  setUrl(exampleUrl)
                } catch {
                  setUrl(exampleUrl)
                }
              }}
            >
              XML
            </span>
            {' · '}
            <span 
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={async () => {
                const exampleUrl = 'https://pretalx.com/juliacon-2025/schedule/export/schedule.xcal'
                try {
                  await navigator.clipboard.writeText(exampleUrl)
                  setUrl(exampleUrl)
                } catch {
                  setUrl(exampleUrl)
                }
              }}
            >
              XCal
            </span>
          </div>

          {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
        </div>
        <div className="modalFooter" style={{ padding: '1rem', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => { setShowUrlModal(false); setError(null); setUrl(''); setFormat(''); }}>
            Cancel
          </button>
          <button className="btn btnPrimary" onClick={loadFromUrl} disabled={busy || Boolean(hint)}>
            {busy ? 'Loading…' : 'Load schedule'}
          </button>
        </div>
      </dialog>

      <dialog ref={fileDialogRef}>
        <div className="modalHeader">
          <h3>Import File</h3>
          <button className="btn btnClose" onClick={() => { setShowFileModal(false); setSelectedFile(null); setFileFormat(''); setError(null); }}>×</button>
        </div>
        <div className="modalBody">
          <div className="field">
            <label>Selected File</label>
            <div style={{ 
              padding: '8px 12px', 
              background: 'var(--color-bg-secondary)', 
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '14px'
            }}>
              {selectedFile?.name || 'No file selected'}
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Format</label>
            <select
              value={fileFormat}
              onChange={e => setFileFormat(e.target.value as ScheduleFormat | '')}
              style={{ width: '100%' }}
            >
              <option value="">Auto-detect</option>
              {allFormats.map(fmt => (
                <option key={fmt.id} value={fmt.id}>
                  {fmt.label}
                </option>
              ))}
            </select>
            <div className="muted" style={{ marginTop: 4, fontSize: '12px' }}>
              Format is auto-detected from file extension. Select manually if detection fails or is incorrect.
            </div>
          </div>

          {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
        </div>
        <div className="modalFooter" style={{ padding: '1rem', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => { setShowFileModal(false); setSelectedFile(null); setFileFormat(''); setError(null); }}>
            Cancel
          </button>
          <button 
            className="btn btnPrimary" 
            onClick={() => selectedFile && loadFromFile(selectedFile)} 
            disabled={busy || !selectedFile}
          >
            {busy ? 'Loading…' : 'Load schedule'}
          </button>
        </div>
      </dialog>
    </>
  )
}
