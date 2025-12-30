import React, { useState, useEffect } from 'react'
import type { Filters } from '../utils/filters'
import type { ViewParams } from '../hooks/useViewParams'
import CollapsibleSection from './CollapsibleSection'

export type ReminderSettings = {
  enabled: boolean
  offsetMinutes: 0 | 10
}

function SelectRow(props: { label: string; value: any; onChange: (v: any) => void; options: Array<{ value: any; label: string }>; noActive?: boolean }) {
  // Check if current value is different from the first option (default)
  const isActive = props.noActive ? false : (String(props.value) !== String(props.options[0]?.value))
  
  return (
    <div className="field">
      <label>{props.label}</label>
      <select value={String(props.value)} onChange={e => props.onChange(e.target.value)} data-active={isActive}>
        {props.options.map(o => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function FiltersSidebar(props: {
  filters: Filters
  onChange: (next: Filters) => void
  facets: {
    tracks: string[]
    days: string[]
    rooms: string[]
    types: string[]
    languages: string[]
  }
  onReset: () => void
  onChangeSource: () => void

  viewParams: ViewParams
  onChangeViewParams: (next: ViewParams) => void

  canRefresh: boolean
  onRefresh: () => void
  refreshState: { busy: boolean; error: string | null; lastAttemptAt?: string }

  likedCount: number
  showMyChoicesOnly: boolean
  onToggleMyChoices: () => void

  onExportIcs: () => void
  onExportJson: () => void
  onExportCsv: () => void

  reminderSettings: ReminderSettings
  onChangeReminderSettings: (next: ReminderSettings) => void
  onRequestNotificationPermission: () => void
  notificationSupport: { supported: boolean; permission: NotificationPermission | 'unsupported' }
  reminderStatusText?: string
}) {
  const f = props.filters
  const vp = props.viewParams
  const set = (patch: Partial<Filters>) => props.onChange({ ...f, ...patch })
  const setVP = (patch: Partial<ViewParams>) => props.onChangeViewParams({ ...vp, ...patch })

  const rs = props.reminderSettings
  const setRS = (patch: Partial<ReminderSettings>) => props.onChangeReminderSettings({ ...rs, ...patch })

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 900)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Desktop view - single card with all sections
  if (!isMobile) {
    return (
      <div className="card sidebarCard">
      <div className="cardHeader">
        <div className="titleRow">
          <h2>Filters</h2>
        </div>
      </div>        
      <div className="cardBody stack">
          <div className="field">
            <input type="text" value={f.q} onChange={e => set({ q: e.target.value })} placeholder="Search term" data-active={!!f.q} />
          </div>

          <div className="field">
            <select value={f.day} onChange={e => set({ day: e.target.value as any })} data-active={f.day !== 'ALL'}>
              <option value="ALL">All days</option>
              {props.facets.days.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="field">
            <select value={f.track} onChange={e => set({ track: e.target.value as any })} data-active={f.track !== 'ALL'}>
              <option value="ALL">All tracks</option>
              {props.facets.tracks.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="field">
            <select value={f.room} onChange={e => set({ room: e.target.value as any })} data-active={f.room !== 'ALL'}>
              <option value="ALL">All rooms</option>
              {props.facets.rooms.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="field">
            <select value={f.type} onChange={e => set({ type: e.target.value as any })} data-active={f.type !== 'ALL'}>
              <option value="ALL">All types</option>
              {props.facets.types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="field">
            <select value={f.language} onChange={e => set({ language: e.target.value as any })} data-active={f.language !== 'ALL'}>
              <option value="ALL">All languages</option>
              {props.facets.languages.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>


          <div className="titleRow">
            <h2>View</h2>
          </div>

          <SelectRow
            label="View mode"
            value={vp.viewMode}
            onChange={(v) => setVP({ viewMode: (v === 'table' ? 'table' : 'card') })}
            noActive={true}
            options={[
              { value: 'card', label: 'Card view' },
              { value: 'table', label: 'Table view (compact)' },
            ]}
          />

          <SelectRow
            label="Timezone"
            value={vp.timezoneMode}
            onChange={(v) => setVP({ timezoneMode: v === 'device' ? 'device' : 'schedule' })}
            noActive={true}
            options={[
              { value: 'schedule', label: 'Schedule timezone' },
              { value: 'device', label: 'Device timezone' },
            ]}
          />

          <div className="field">
            <label>Time display</label>
            <div className="stack" style={{ gap: 8 }}>
              <label className="row" style={{ gap: 10 }}>
                <input type="checkbox" checked={vp.showTimeRange} onChange={e => setVP({ showTimeRange: e.target.checked })} />
                <span className="muted">Show time range (from - to)</span>
              </label>
              <label className="row" style={{ gap: 10 }}>
                <input type="checkbox" checked={vp.showDuration} onChange={e => setVP({ showDuration: e.target.checked })} />
                <span className="muted">Also show duration</span>
              </label>
            </div>
          </div>

          <div className="titleRow">
            <h2>Refresh</h2>
          </div>

          <SelectRow
            label="Auto reload"
            value={vp.autoReloadMinutes === null ? 'never' : String(vp.autoReloadMinutes)}
            onChange={(v) => {
              if (v === 'never') setVP({ autoReloadMinutes: null })
              else setVP({ autoReloadMinutes: Number(v) })
            }}
            noActive={true}
            options={[
              { value: 'never', label: 'Never' },
              { value: '5', label: 'Every 5 minutes' },
              { value: '10', label: 'Every 10 minutes' },
              { value: '15', label: 'Every 15 minutes' },
              { value: '30', label: 'Every 30 minutes' },
              { value: '60', label: 'Every 60 minutes' },
            ]}
          />

          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <button className="btn" onClick={props.onRefresh} disabled={!props.canRefresh || props.refreshState.busy}>
              {props.refreshState.busy ? 'Refreshing…' : 'Refresh now'}
            </button>
          </div>

          {props.refreshState.error ? <div className="error">{props.refreshState.error}</div> : null}
          {props.refreshState.lastAttemptAt ? (
            <div className="muted">
              Last refresh attempt: <span className="mono">{new Date(props.refreshState.lastAttemptAt).toLocaleString()}</span>
            </div>
          ) : null}
          {!props.canRefresh ? (
            <div className="muted">
              Auto/manual refresh is only available when you loaded from a URL (not from an imported file).
            </div>
          ) : null}

          <div className="titleRow">
            <h2>Own Schedule ({props.likedCount})</h2>
          </div>

          {props.likedCount === 0 ? (
            <div className="muted" style={{ lineHeight: 1.5 }}>
              1. Use the hearts to choose the sessions you are interested in.
              <br />
              2. Go to &quot;My Choices&quot; to see only the sessions you&apos;ve liked.
            </div>
          ) : (
            <>
              <button
                className={`btn ${props.showMyChoicesOnly ? 'btnPrimary' : ''}`}
                onClick={props.onToggleMyChoices}
              >
                {props.showMyChoicesOnly ? 'My Choices (showing)' : 'My Choices'}
              </button>

              <div className="titleRow">
                <h2>Export</h2>
              </div>

              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <button className="btn" onClick={props.onExportIcs}>Download ICS</button>
                <button className="btn" onClick={props.onExportJson}>Download JSON</button>
                <button className="btn" onClick={props.onExportCsv}>Download CSV</button>
              </div>

              <div className="titleRow">
                <h2>Reminders</h2>
              </div>

              <div className="muted" style={{ lineHeight: 1.5 }}>
                Lightweight reminders work without a server, but only while the app is open (or running in the background).
              </div>

              {!props.notificationSupport.supported ? (
                <div className="muted">This browser does not support notifications.</div>
              ) : (
                <button 
                  className={`btn ${rs.enabled && props.notificationSupport.permission === 'granted' ? 'btnPrimary' : ''}`}
                  onClick={() => {
                    if (props.notificationSupport.permission !== 'granted') {
                      props.onRequestNotificationPermission()
                    } else {
                      setRS({ enabled: !rs.enabled })
                    }
                  }}
                >
                  {rs.enabled && props.notificationSupport.permission === 'granted' 
                    ? 'Notifications active' 
                    : 'Enable notifications'}
                </button>
              )}

              <SelectRow
                label="When"
                value={String(rs.offsetMinutes)}
                onChange={(v) => setRS({ offsetMinutes: (v === '10' ? 10 : 0) })}
                noActive={true}
                options={[
                  { value: '0', label: 'At session start' },
                  { value: '10', label: '10 minutes before' },
                ]}
              />

              {props.reminderStatusText ? <div className="muted">{props.reminderStatusText}</div> : null}
            </>
          )}
        </div>
      </div>
    )
  }

  // Mobile view - collapsible sections
  return (
    <div className="stack">
      <CollapsibleSection title="Filters" defaultOpen={false} storageKey="filters">
        <div className="field">
          <input type="text" value={f.q} onChange={e => set({ q: e.target.value })} placeholder="Search term" data-active={!!f.q} />
        </div>

        <div className="field">
          <select value={f.day} onChange={e => set({ day: e.target.value as any })} data-active={f.day !== 'ALL'}>
            <option value="ALL">All days</option>
            {props.facets.days.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="field">
          <select value={f.track} onChange={e => set({ track: e.target.value as any })} data-active={f.track !== 'ALL'}>
            <option value="ALL">All tracks</option>
            {props.facets.tracks.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="field">
          <select value={f.room} onChange={e => set({ room: e.target.value as any })} data-active={f.room !== 'ALL'}>
            <option value="ALL">All rooms</option>
            {props.facets.rooms.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="field">
          <select value={f.type} onChange={e => set({ type: e.target.value as any })} data-active={f.type !== 'ALL'}>
            <option value="ALL">All types</option>
            {props.facets.types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="field">
          <select value={f.language} onChange={e => set({ language: e.target.value as any })} data-active={f.language !== 'ALL'}>
            <option value="ALL">All languages</option>
            {props.facets.languages.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="View" defaultOpen={false} storageKey="view">
        <SelectRow
          label="View mode"
          value={vp.viewMode}
          onChange={(v) => setVP({ viewMode: (v === 'table' ? 'table' : 'card') })}
          noActive={true}
          options={[
            { value: 'card', label: 'Card view' },
            { value: 'table', label: 'Table view (compact)' },
          ]}
        />

        <SelectRow
          label="Timezone"
          value={vp.timezoneMode}
          onChange={(v) => setVP({ timezoneMode: v === 'device' ? 'device' : 'schedule' })}
          noActive={true}
          options={[
            { value: 'schedule', label: 'Schedule timezone' },
            { value: 'device', label: 'Device timezone' },
          ]}
        />

        <div className="field">
          <label>Time range</label>
          <div className="row" style={{ gap: 10 }}>
            <input type="checkbox" checked={vp.showTimeRange} onChange={e => setVP({ showTimeRange: e.target.checked })} />
          </div>
        </div>

        <div className="field">
          <label>Duration</label>
          <div className="row" style={{ gap: 10 }}>
            <input type="checkbox" checked={vp.showDuration} onChange={e => setVP({ showDuration: e.target.checked })} />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Refresh" defaultOpen={false} storageKey="refresh">
        <SelectRow
          label="Auto reload"
          value={vp.autoReloadMinutes === null ? 'never' : String(vp.autoReloadMinutes)}
          onChange={(v) => {
            if (v === 'never') setVP({ autoReloadMinutes: null })
            else setVP({ autoReloadMinutes: Number(v) })
          }}
          noActive={true}
          options={[
            { value: 'never', label: 'Never' },
            { value: '5', label: 'Every 5 minutes' },
            { value: '10', label: 'Every 10 minutes' },
            { value: '15', label: 'Every 15 minutes' },
            { value: '30', label: 'Every 30 minutes' },
            { value: '60', label: 'Every 60 minutes' },
          ]}
        />

        <button className="btn" onClick={props.onRefresh} disabled={!props.canRefresh || props.refreshState.busy}>
          {props.refreshState.busy ? 'Refreshing…' : 'Refresh now'}
        </button>

        {props.refreshState.error ? <div className="error">{props.refreshState.error}</div> : null}
        {props.refreshState.lastAttemptAt ? (
          <div className="muted">
            Last: <span className="mono">{new Date(props.refreshState.lastAttemptAt).toLocaleString()}</span>
          </div>
        ) : null}
        {!props.canRefresh ? (
          <div className="muted">
            Only available when loaded from URL.
          </div>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection title={`Own Schedule (${props.likedCount})`} defaultOpen={false} storageKey="schedule">
        {props.likedCount === 0 ? (
          <div className="muted" style={{ lineHeight: 1.5 }}>
            Use the hearts to choose sessions, then see &quot;My Choices&quot;.
          </div>
        ) : (
          <>
            <button
              className={`btn ${props.showMyChoicesOnly ? 'btnPrimary' : ''}`}
              onClick={props.onToggleMyChoices}
            >
              {props.showMyChoicesOnly ? 'My Choices (showing)' : 'My Choices'}
            </button>

            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={props.onExportIcs}>ICS</button>
              <button className="btn" onClick={props.onExportJson}>JSON</button>
              <button className="btn" onClick={props.onExportCsv}>CSV</button>
            </div>
          </>
        )}
      </CollapsibleSection>

      {props.likedCount > 0 && (
        <CollapsibleSection title="Reminders" defaultOpen={false} storageKey="reminders">
          <div className="muted" style={{ lineHeight: 1.5 }}>
            Work only while app is open or in background.
          </div>

          {!props.notificationSupport.supported ? (
            <div className="muted">Browser does not support notifications.</div>
          ) : (
            <button 
              className={`btn ${rs.enabled && props.notificationSupport.permission === 'granted' ? 'btnPrimary' : ''}`}
              onClick={() => {
                if (props.notificationSupport.permission !== 'granted') {
                  props.onRequestNotificationPermission()
                } else {
                  setRS({ enabled: !rs.enabled })
                }
              }}
            >
              {rs.enabled && props.notificationSupport.permission === 'granted' 
                ? 'Notifications active' 
                : 'Enable notifications'}
            </button>
          )}

          <SelectRow
            label="When"
            value={String(rs.offsetMinutes)}
            onChange={(v) => setRS({ offsetMinutes: (v === '10' ? 10 : 0) })}
            noActive={true}
            options={[
              { value: '0', label: 'At session start' },
              { value: '10', label: '10 minutes before' },
            ]}
          />

          {props.reminderStatusText ? <div className="muted">{props.reminderStatusText}</div> : null}
        </CollapsibleSection>
      )}
    </div>
  )
}
