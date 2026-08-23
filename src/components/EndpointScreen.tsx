import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import type { Session } from '../data/normalizeSchedule'
import { fetchAndParseSchedule } from '../data/fetchSchedule'
import { parseSchedule, formatRegistry } from '../data/formats/registry'
import type { ScheduleFormat } from '../data/formats/types'
import { canonicalScheduleToAppFormat } from '../data/formatConverter'
import { loadSchedule } from '../data/storage'
import ScheduleLibrary from './ScheduleLibrary'
import { showNotification } from '../utils/showNotification'
import { generateTitle, getBestTitle } from '../utils/titleGenerator'
import { sanitizeImportTitle, buildImportFilter, MAX_IMPORT_TITLE_LENGTH, type ImportFilter } from '../utils/importParams'
import { IMPORT_TITLE_PARAM_ENABLED, IMPORT_DATERANGE_PARAM_ENABLED } from '../utils/featureFlags'

async function readFileAsText(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

const URL_DIALOG_EXIT_DURATION_MS = 140

/** Convert an ISO timestamp to a value usable by <input type="datetime-local">. */
function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}


export default function EndpointScreen(props: {
  initialUrl?: string
  prefillUrl?: string | null
  prefillTitle?: string
  prefillImportFilter?: ImportFilter
  showInstallButton?: boolean
  onInstall?: () => void
  onLoaded: (data: {
    endpointUrl?: string
    sourceLabel?: string
    conferenceTitle?: string
    conferenceTimeZoneName?: string
    sessions: Session[]
    fetchedAt: string
    importFilter?: ImportFilter
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
  const [prefillHandled, setPrefillHandled] = useState(false)
  const [titleOverride, setTitleOverride] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const importOptionsEnabled = IMPORT_TITLE_PARAM_ENABLED || IMPORT_DATERANGE_PARAM_ENABLED

  const closeUrlModal = useCallback(() => {
    setShowUrlModal(false)
    setError(null)
  }, [])

  // Handle prefillUrl (and optional title/date-range) from URL parameters
  useEffect(() => {
    if (props.prefillUrl && !prefillHandled) {
      setUrl(props.prefillUrl)
      if (props.prefillTitle) setTitleOverride(props.prefillTitle)
      if (props.prefillImportFilter?.start) setStartDate(toDateTimeLocalValue(props.prefillImportFilter.start))
      if (props.prefillImportFilter?.end) setEndDate(toDateTimeLocalValue(props.prefillImportFilter.end))
      setShowUrlModal(true)
      setPrefillHandled(true)
    }
  }, [props.prefillUrl, props.prefillTitle, props.prefillImportFilter, prefillHandled])

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

    let openAnimationFrame: number | undefined
    let closeTimer: number | undefined

    if (showUrlModal) {
      if (!dlg.open) dlg.showModal()
      dlg.classList.remove('is-closing')
      openAnimationFrame = window.requestAnimationFrame(() => {
        dlg.classList.add('is-visible')
      })
    } else if (dlg.open) {
      dlg.classList.remove('is-visible')
      dlg.classList.add('is-closing')

      const closeDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : URL_DIALOG_EXIT_DURATION_MS

      closeTimer = window.setTimeout(() => {
        if (dlg.open) dlg.close()
        dlg.classList.remove('is-closing')
      }, closeDelay)
    }

    const onCancel = (e: Event) => {
      e.preventDefault()
      closeUrlModal()
    }
    dlg.addEventListener('cancel', onCancel)
    return () => {
      if (openAnimationFrame !== undefined) window.cancelAnimationFrame(openAnimationFrame)
      if (closeTimer !== undefined) window.clearTimeout(closeTimer)
      dlg.removeEventListener('cancel', onCancel)
    }
  }, [showUrlModal, closeUrlModal])

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
    if (!url.trim()) return ''
    try { new URL(url); return null } catch { return 'Please enter a valid URL.' }
  }, [url])

  function handleUrlDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickedOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom

    if (clickedOutside) closeUrlModal()
  }

  async function loadFromUrl() {
    setShowUrlModal(false)
    setBusy(true)
    setError(null)
    try {
      const out = await fetchAndParseSchedule(url.trim(), format || undefined)
      
      // Generate a nice title from the URL
      const generatedTitle = generateTitle(url.trim())
      
      // Use the best title: an explicit override wins, otherwise prefer the
      // conference title from the file unless it's generic.
      const sanitizedOverride = IMPORT_TITLE_PARAM_ENABLED ? sanitizeImportTitle(titleOverride) : undefined
      const bestTitle = sanitizedOverride ?? getBestTitle(out.conferenceTitle, generatedTitle)

      const importFilter = IMPORT_DATERANGE_PARAM_ENABLED
        ? buildImportFilter(startDate || undefined, endDate || undefined)
        : undefined
      
      const fetchedAt = new Date().toISOString()
      props.onLoaded({
        endpointUrl: url.trim(),
        conferenceTitle: bestTitle,
        conferenceTimeZoneName: out.conferenceTimeZoneName,
        sessions: out.sessions,
        fetchedAt,
        importFilter,
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

      <dialog
        ref={dialogRef}
        className="urlImportDialog"
        onClick={handleUrlDialogClick}
        aria-labelledby="url-import-dialog-title"
        aria-modal="true"
      >
        <div className="modalHeader">
          <h3 id="url-import-dialog-title">Load from URL</h3>
          <button style={{ border: 'none', fontSize: '20px', paddingTop: '2px', paddingRight: '2px', fontWeight: 'bold' }} className="btn btnClose" onClick={closeUrlModal}>×</button>
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
          </div>


          {importOptionsEnabled && (
            <details
              className="field"
              style={{ marginTop: 22, marginBottom: 22 }}
              open={Boolean(titleOverride || startDate || endDate)}
            >
              <summary style={{ cursor: 'pointer', fontSize: '14px' }}>Advanced import options</summary>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {IMPORT_TITLE_PARAM_ENABLED && (
                  <div>
                    <label>Schedule title &ndash; overrides the detected</label>
                    <input
                      className="inputModal"
                      value={titleOverride}
                      onChange={e => setTitleOverride(e.target.value)}
                      placeholder=""
                      maxLength={MAX_IMPORT_TITLE_LENGTH}
                    />
                  </div>
                )}
                {IMPORT_DATERANGE_PARAM_ENABLED && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 160px' }}>
                      <label>Start date/time</label>
                      <input
                        className="inputModal"
                        type="datetime-local"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ flex: '1 1 160px' }}>
                      <label>End date/time</label>
                      <input
                        className="inputModal"
                        type="datetime-local"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div className="muted" style={{ fontSize: '12px', flexBasis: '100%' }}>
                      Sessions outside this date range are excluded during data import.
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}

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
          <button className="btn" onClick={() => { setShowUrlModal(false); setError(null); setUrl(''); setFormat(''); setTitleOverride(''); setStartDate(''); setEndDate('') }}>
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
