import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import type { Session } from '../data/normalizeSchedule'
import { fetchAndParseSchedule } from '../data/fetchSchedule'
import { parseSchedule, formatRegistry } from '../data/formats/registry'
import type { ScheduleFormat, ScheduleImportIssue } from '../data/formats/types'
import { canonicalScheduleToAppFormat } from '../data/formatConverter'
import { loadSchedule } from '../data/storage'
import ScheduleLibrary from './ScheduleLibrary'
import { showNotification } from '../utils/showNotification'
import { generateTitle, getBestTitle } from '../utils/titleGenerator'
import {
  buildImportFilter,
  canonicalizeTimeZone,
  importRangeNeedsTimeZone,
  sanitizeImportTitle,
  MAX_IMPORT_TITLE_LENGTH,
  type ImportDateOptions,
  type ImportFilter,
} from '../utils/importParams'
import { IMPORT_TITLE_PARAM_ENABLED, IMPORT_DATERANGE_PARAM_ENABLED } from '../utils/featureFlags'
import { getEventCountries } from '../utils/eventTimeZones'

async function readFileAsText(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

const ANIMATED_DIALOG_EXIT_DURATION_MS = 140

type PendingScheduleImport = {
  endpointUrl?: string
  sourceLabel?: string
  conferenceTitle?: string
  fetchedAt: string
  sourceContent: string
  sourceFormat: ScheduleFormat
  rawStart?: string
  rawEnd?: string
}

function useAnimatedDialog(
  isOpen: boolean,
  onCancel: () => void,
  initialFocusRef?: { readonly current: HTMLElement | null }
) {
  const ref = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    let openAnimationFrame: number | undefined
    let closeTimer: number | undefined

    if (isOpen) {
      if (!dialog.open) dialog.showModal()
      // showModal() focuses the first focusable child by default. Override that
      // choice when the dialog has a more useful primary input.
      initialFocusRef?.current?.focus({ preventScroll: true })
      dialog.classList.remove('is-closing')
      openAnimationFrame = window.requestAnimationFrame(() => {
        dialog.classList.add('is-visible')
      })
    } else if (dialog.open) {
      dialog.classList.remove('is-visible')
      dialog.classList.add('is-closing')
      const closeDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : ANIMATED_DIALOG_EXIT_DURATION_MS
      closeTimer = window.setTimeout(() => {
        if (dialog.open) dialog.close()
        dialog.classList.remove('is-closing')
      }, closeDelay)
    }

    const handleCancel = (event: Event) => {
      event.preventDefault()
      onCancel()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => {
      if (openAnimationFrame !== undefined) window.cancelAnimationFrame(openAnimationFrame)
      if (closeTimer !== undefined) window.clearTimeout(closeTimer)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [initialFocusRef, isOpen, onCancel])

  return ref
}

function isDialogBackdropClick(event: React.MouseEvent<HTMLDialogElement>): boolean {
  // Firefox may report native <select> popup clicks outside the dialog.
  if (event.target !== event.currentTarget) return false

  const rect = event.currentTarget.getBoundingClientRect()
  return event.clientX < rect.left
    || event.clientX > rect.right
    || event.clientY < rect.top
    || event.clientY > rect.bottom
}

function getSupportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[]
  }
  const values = intl.supportedValuesOf?.('timeZone') ?? []
  return [...new Set(['UTC', ...values])].sort()
}

function formatTimeZoneChoice(timeZone: string): string {
  const parts = timeZone.split('/')
  const location = parts[parts.length - 1]?.replace(/_/g, ' ') ?? timeZone
  return `${location} (${timeZone})`
}


export default function EndpointScreen(props: {
  initialUrl?: string
  prefillUrl?: string | null
  prefillTitle?: string
  prefillImportOptions?: ImportDateOptions
  showInstallButton?: boolean
  onInstall?: () => void
  onImportRequestDismissed?: () => void
  onLoaded: (data: {
    endpointUrl?: string
    sourceLabel?: string
    conferenceTitle?: string
    conferenceTimeZoneName?: string
    sessions: Session[]
    fetchedAt: string
    autoReloadMinutes?: number | null
    importFilter?: ImportFilter
    importIssues?: ScheduleImportIssue[]
  }) => void | Promise<void>
}) {
  const [url, setUrl] = useState('')
  const [format, setFormat] = useState<ScheduleFormat | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [showFileModal, setShowFileModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileFormat, setFileFormat] = useState<ScheduleFormat | ''>('')
  const fileDialogRef = useRef<HTMLDialogElement | null>(null)
  const [prefillHandled, setPrefillHandled] = useState(false)
  const [titleOverride, setTitleOverride] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [timeZone, setTimeZone] = useState('')
  const [advancedImportOptionsOpen, setAdvancedImportOptionsOpen] = useState(false)
  const [showTimeZoneModal, setShowTimeZoneModal] = useState(false)
  const [timeZoneSelection, setTimeZoneSelection] = useState('')
  const [eventCountryCode, setEventCountryCode] = useState('')
  const [timeZoneError, setTimeZoneError] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingScheduleImport | null>(null)
  const importOptionsEnabled = IMPORT_TITLE_PARAM_ENABLED || IMPORT_DATERANGE_PARAM_ENABLED
  const supportedTimeZones = useMemo(getSupportedTimeZones, [])
  const eventCountries = useMemo(
    () => showTimeZoneModal ? getEventCountries() : [],
    [showTimeZoneModal]
  )
  const selectedEventCountry = useMemo(
    () => eventCountries.find(country => country.code === eventCountryCode),
    [eventCountries, eventCountryCode]
  )
  const deviceTimeZone = useMemo(
    () => canonicalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? 'UTC',
    []
  )

  const resetUrlImportFields = useCallback(() => {
    setUrl('')
    setFormat('')
    setTitleOverride('')
    setStartDate('')
    setEndDate('')
    setTimeZone('')
    setAdvancedImportOptionsOpen(false)
    setError(null)
  }, [])

  const closeUrlModal = useCallback(() => {
    setShowUrlModal(false)
    resetUrlImportFields()
    props.onImportRequestDismissed?.()
  }, [props.onImportRequestDismissed, resetUrlImportFields])

  const cancelTimeZoneModal = useCallback(() => {
    setShowTimeZoneModal(false)
    setTimeZoneSelection('')
    setEventCountryCode('')
    setTimeZoneError(null)
    setPendingImport(null)
    setSelectedFile(null)
    setFileFormat('')
    resetUrlImportFields()
    props.onImportRequestDismissed?.()
  }, [props.onImportRequestDismissed, resetUrlImportFields])

  const urlInputRef = useRef<HTMLInputElement | null>(null)
  const dialogRef = useAnimatedDialog(showUrlModal, closeUrlModal, urlInputRef)
  const timeZoneDialogRef = useAnimatedDialog(showTimeZoneModal, cancelTimeZoneModal)

  // Handle prefillUrl (and optional title/date-range) from URL parameters
  useEffect(() => {
    if (props.prefillUrl && !prefillHandled) {
      setUrl(props.prefillUrl)
      if (props.prefillTitle) setTitleOverride(props.prefillTitle)
      if (props.prefillImportOptions?.start) setStartDate(props.prefillImportOptions.start)
      if (props.prefillImportOptions?.end) setEndDate(props.prefillImportOptions.end)
      if (props.prefillImportOptions?.timeZone) setTimeZone(props.prefillImportOptions.timeZone)
      setAdvancedImportOptionsOpen(false)
      setShowUrlModal(true)
      setPrefillHandled(true)
    }
  }, [props.prefillUrl, props.prefillTitle, props.prefillImportOptions, prefillHandled])

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
    if (isDialogBackdropClick(e)) closeUrlModal()
  }

  function handleTimeZoneDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (isDialogBackdropClick(e)) cancelTimeZoneModal()
  }

  function selectEventCountry(code: string) {
    setEventCountryCode(code)
    const country = eventCountries.find(entry => entry.code === code)
    setTimeZoneSelection(country?.timeZones.length === 1 ? country.timeZones[0] : '')
    setTimeZoneError(null)
  }

  async function finishScheduleImport(
    pending: PendingScheduleImport,
    resolvedTimeZone?: string,
    applyDateFilter = true
  ) {
    const canonical = await parseSchedule(
      pending.sourceContent,
      pending.sourceFormat,
      { timeZone: resolvedTimeZone }
    )
    const parsed = canonicalScheduleToAppFormat(canonical)
    if (parsed.sessions.length === 0) {
      const detail = parsed.importIssues[0]?.message
      const count = parsed.importIssues.length
      throw new Error(
        `Schedule loaded, but no sessions could be imported.${detail ? ` ${count} source ${count === 1 ? 'entry' : 'entries'} failed. First issue: ${detail}` : ''}`
      )
    }

    const importFilter = IMPORT_DATERANGE_PARAM_ENABLED && applyDateFilter
      ? buildImportFilter(pending.rawStart, pending.rawEnd, resolvedTimeZone)
      : undefined

    await props.onLoaded({
      endpointUrl: pending.endpointUrl,
      sourceLabel: pending.sourceLabel,
      conferenceTitle: pending.conferenceTitle,
      conferenceTimeZoneName: resolvedTimeZone ?? parsed.conferenceTimeZoneName,
      sessions: parsed.sessions,
      fetchedAt: pending.fetchedAt,
      importFilter,
      importIssues: parsed.importIssues,
    })
    setPendingImport(null)
  }

  async function loadFromUrl() {
    setShowUrlModal(false)
    setBusy(true)
    setError(null)
    try {
      const explicitTimeZone = canonicalizeTimeZone(timeZone)
      if (timeZone.trim() && !explicitTimeZone) {
        throw new Error(`Unknown time zone: ${timeZone.trim()}`)
      }
      const out = await fetchAndParseSchedule(
        url.trim(),
        format || undefined,
        { timeZone: explicitTimeZone }
      )
      
      // Generate a nice title from the URL
      const generatedTitle = generateTitle(url.trim())
      
      // Use the best title: an explicit override wins, otherwise prefer the
      // conference title from the file unless it's generic.
      const sanitizedOverride = IMPORT_TITLE_PARAM_ENABLED ? sanitizeImportTitle(titleOverride) : undefined
      const bestTitle = sanitizedOverride ?? getBestTitle(out.conferenceTitle, generatedTitle)

      const scheduleTimeZone = canonicalizeTimeZone(out.conferenceTimeZoneName)
      const resolvedTimeZone = explicitTimeZone ?? scheduleTimeZone
      const pending: PendingScheduleImport = {
        endpointUrl: url.trim(),
        conferenceTitle: bestTitle,
        fetchedAt: new Date().toISOString(),
        sourceContent: out.sourceContent,
        sourceFormat: out.format,
        rawStart: IMPORT_DATERANGE_PARAM_ENABLED ? startDate.trim() || undefined : undefined,
        rawEnd: IMPORT_DATERANGE_PARAM_ENABLED ? endDate.trim() || undefined : undefined,
      }

      const rangeNeedsTimeZone = IMPORT_DATERANGE_PARAM_ENABLED
        && importRangeNeedsTimeZone(pending.rawStart, pending.rawEnd)
      if (!resolvedTimeZone && (out.requiresTimeZoneForParsing || rangeNeedsTimeZone)) {
        setPendingImport(pending)
        setTimeZoneSelection('')
        setEventCountryCode('')
        setTimeZoneError(null)
        setShowTimeZoneModal(true)
        return
      }

      await finishScheduleImport(pending, resolvedTimeZone)
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

  async function continueWithSelectedTimeZone() {
    if (!pendingImport) return
    const selectedTimeZone = canonicalizeTimeZone(timeZoneSelection)
    if (!selectedTimeZone) {
      setTimeZoneError('Enter a valid IANA time zone, for example Europe/Copenhagen.')
      return
    }

    setBusy(true)
    setTimeZoneError(null)
    try {
      await finishScheduleImport(pendingImport, selectedTimeZone)
      setShowTimeZoneModal(false)
    } catch (e: any) {
      setTimeZoneError(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  async function continueWithDeviceTimeZone() {
    if (!pendingImport) return
    setBusy(true)
    setTimeZoneError(null)
    try {
      await finishScheduleImport(pendingImport, deviceTimeZone)
      setShowTimeZoneModal(false)
    } catch (e: any) {
      setTimeZoneError(String(e?.message ?? e))
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
      const formatToUse = fileFormat
        || formatRegistry.detectFormatFromExtension(file.name)
        || formatRegistry.detectFormatFromContent(text)
      if (!formatToUse) {
        throw new Error('Could not detect schedule format. Please specify format explicitly.')
      }
      
      const canonical = await parseSchedule(text, formatToUse)
      const out = canonicalScheduleToAppFormat(canonical)
      if (out.sessions.length === 0) {
        throw new Error('Schedule loaded, but no sessions were found (unexpected format or empty schedule).')
      }
      
      // Generate a nice title from the filename
      const generatedTitle = generateTitle(file.name)
      
      // Use the best title: prefer conference title from file unless it's generic
      const bestTitle = getBestTitle(out.conferenceTitle, generatedTitle)
      
      const pending: PendingScheduleImport = {
        sourceLabel: generatedTitle,
        conferenceTitle: bestTitle,
        fetchedAt: new Date().toISOString(),
        sourceContent: text,
        sourceFormat: formatToUse,
      }
      const scheduleTimeZone = canonicalizeTimeZone(out.conferenceTimeZoneName)
      if (!scheduleTimeZone && out.requiresTimeZoneForParsing) {
        setPendingImport(pending)
        setTimeZoneSelection('')
        setEventCountryCode('')
        setTimeZoneError(null)
        setShowTimeZoneModal(true)
        return
      }

      await finishScheduleImport(pending, scheduleTimeZone)
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
        autoReloadMinutes: stored.autoReloadMinutes,
        importFilter: stored.importFilter,
        importIssues: stored.importIssues,
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
        className="animatedDialog urlImportDialog"
        onClick={handleUrlDialogClick}
        aria-labelledby="url-import-dialog-title"
        aria-modal="true"
      >
        <div className="modalHeader">
          <h3 id="url-import-dialog-title">Load from URL</h3>
          <button style={{ border: '0px solid transparent', fontSize: '20px', paddingTop: '2px', paddingRight: '2px', fontWeight: 'bold' }} className="btn btnClose" onClick={closeUrlModal}>×</button>
        </div>
        <div className="modalBody">
          <div className="field">
            <label>URL</label>
            <input 
              ref={urlInputRef}
              className="inputModal"
              value={url} 
              onChange={e => setUrl(e.target.value)} 
              placeholder="https://..."
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
            <div
              className={`field advancedImportOptions${advancedImportOptionsOpen ? ' is-open' : ''}`}
              style={{ marginTop: 22, marginBottom: 22 }}
            >
              <button
                type="button"
                className="advancedImportOptionsToggle"
                aria-expanded={advancedImportOptionsOpen}
                aria-controls="advanced-import-options-content"
                onClick={() => setAdvancedImportOptionsOpen(open => !open)}
              >
                Advanced import options
              </button>
              <div
                id="advanced-import-options-content"
                className="advancedImportOptionsClip"
                aria-hidden={!advancedImportOptionsOpen}
              >
                <div className="advancedImportOptionsContent">
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
                      <>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 160px' }}>
                            <label>Start date/time</label>
                            <input
                              className="inputModal"
                              value={startDate}
                              onChange={e => setStartDate(e.target.value)}
                              placeholder="YYYY-MM-DD or ISO 8601"
                              style={{ width: '100%' }}
                            />
                          </div>
                          <div style={{ flex: '1 1 160px' }}>
                            <label>End date/time</label>
                            <input
                              className="inputModal"
                              value={endDate}
                              onChange={e => setEndDate(e.target.value)}
                              placeholder="YYYY-MM-DD or ISO 8601"
                              style={{ width: '100%' }}
                            />
                          </div>
                          <div className="muted" style={{ fontSize: '12px', flexBasis: '100%', textAlign: 'center' }}>
                            Sessions outside this date range are excluded during data import.
                          </div>
                        </div>
                        <div>
                          <label>Time zone &ndash; IANA identifier, overrides schedule time zone</label>
                          <input
                            className="inputModal"
                            value={timeZone}
                            onChange={e => setTimeZone(e.target.value)}
                            list="iana-time-zones"
                            placeholder="Automatic (from schedule)"
                            autoComplete="off"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
          <button className="btn" onClick={closeUrlModal}>
            Cancel
          </button>
          <button className="btn btnPrimary" onClick={loadFromUrl} disabled={busy || Boolean(hint)}>
            {busy ? 'Loading…' : 'Load schedule'}
          </button>
        </div>
      </dialog>

      <dialog
        ref={timeZoneDialogRef}
        className="animatedDialog timeZoneDialog"
        onClick={handleTimeZoneDialogClick}
        aria-labelledby="time-zone-dialog-title"
        aria-modal="true"
      >
        <div className="modalHeader">
          <h3 id="time-zone-dialog-title">Time zone required</h3>
          <button
            className="btn btnClose"
            style={{ border: '0px solid transparent', fontSize: '20px', paddingTop: '2px', paddingRight: '2px', fontWeight: 'bold' }}
            onClick={cancelTimeZoneModal}
            aria-label="Close time zone dialog"
          >
            ×
          </button>
        </div>
        <div className="modalBody">
          <p className="timeZoneDialogText">
            This schedule does not provide a usable event time zone. Select one so session dates and times are interpreted correctly.
          </p>
          {eventCountries.length > 0 ? (
            <>
              <div className="field">
                <label>Event country</label>
                <select
                  className="inputModal"
                  value={eventCountryCode}
                  onChange={event => selectEventCountry(event.target.value)}
                  autoFocus
                >
                  <option value="">Select a country…</option>
                  {eventCountries.map(country => (
                    <option key={country.code} value={country.code}>{country.name}</option>
                  ))}
                </select>
              </div>
              {selectedEventCountry?.timeZones.length === 1 ? (
                <div className="muted">
                  Time zone: {selectedEventCountry.timeZones[0]}
                </div>
              ) : null}
              {(selectedEventCountry?.timeZones.length ?? 0) > 1 ? (
                <div className="field">
                  <label>Event region</label>
                  <select
                    className="inputModal"
                    value={timeZoneSelection}
                    onChange={event => setTimeZoneSelection(event.target.value)}
                  >
                    <option value="">Select the event region…</option>
                    {selectedEventCountry!.timeZones.map(zone => (
                      <option key={zone} value={zone}>{formatTimeZoneChoice(zone)}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          ) : null}

          <details className="timeZoneAdvancedChoice">
            <summary>Choose an IANA time zone manually</summary>
            <div className="field" style={{ marginTop: 10 }}>
              <select
                className="inputModal"
                value={timeZoneSelection}
                onChange={event => setTimeZoneSelection(event.target.value)}
                autoFocus={eventCountries.length === 0}
              >
                <option value="">Select a time zone…</option>
                {supportedTimeZones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </div>
          </details>
          <div className="muted" style={{ marginTop: 10 }}>
            If you do not know the event time zone, use your current device time zone ({deviceTimeZone}).
          </div>
          {timeZoneError ? <div className="error" style={{ marginTop: 12 }}>{timeZoneError}</div> : null}
        </div>
        <div className="modalFooter timeZoneDialogActions">
          <button className="btn" onClick={cancelTimeZoneModal} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={continueWithDeviceTimeZone} disabled={busy}>
            Use my time zone
          </button>
          <button
            className="btn btnPrimary"
            onClick={continueWithSelectedTimeZone}
            disabled={busy || !timeZoneSelection.trim()}
          >
            Continue
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

      <datalist id="iana-time-zones">
        {supportedTimeZones.map(zone => <option key={zone} value={zone} />)}
      </datalist>
    </>
  )
}
