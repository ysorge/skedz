import React, { useState, useEffect } from 'react'
import type { ScheduleMetadata } from '../data/scheduleLibrary'
import { loadScheduleLibrary, removeScheduleFromLibrary } from '../data/scheduleLibrary'
import { deleteSchedule } from '../data/storage'
import { deleteUserPreferences } from '../data/userPreferences'

export default function ScheduleLibrary(props: {
  onSelectSchedule: (key: string) => void
}) {
  const [library, setLibrary] = useState<ScheduleMetadata[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLibrary()
  }, [])

  async function loadLibrary() {
    setLoading(true)
    try {
      const lib = await loadScheduleLibrary()
      setLibrary(lib.schedules)
    } catch (error) {
      console.error('Failed to load schedule library:', error)
    }
    setLoading(false)
  }

  async function handleDelete(key: string, e: React.MouseEvent) {
    e.stopPropagation()
    
    if (!confirm('Delete this schedule from your library? This will remove all data including your liked sessions.')) {
      return
    }

    try {
      // Delete schedule data, user preferences, and library entry
      await Promise.all([
        deleteSchedule(key),
        deleteUserPreferences(key),
        removeScheduleFromLibrary(key),
      ])
      
      // Reload library
      await loadLibrary()
    } catch (error) {
      console.error('Failed to delete schedule:', error)
      alert('Failed to delete schedule. Please try again.')
    }
  }

  function formatDate(isoString: string): string {
    try {
      const date = new Date(isoString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      if (diffDays < 7) return `${diffDays}d ago`
      
      return date.toLocaleDateString()
    } catch {
      return isoString
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="cardBody">
          <p className="muted">Loading schedule library...</p>
        </div>
      </div>
    )
  }

  if (library.length === 0) {
    return (
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="cardBody">
          <p className="muted">No schedules in your library yet. Load a schedule from URL or file above to get started.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: '16px' }}>
      <div className="cardHeader">
        <h2>Schedule Library</h2>
      </div>
      <div className="cardBody">
        <div className="stack" style={{ gap: 8 }}>
          {library.map(schedule => (
            <div
              key={schedule.key}
              className="scheduleLibraryItem"
              onClick={() => props.onSelectSchedule(schedule.key)}
              style={{
                padding: '12px',
                background: 'var(--day-header-bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.background = 'var(--day-header-bg)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>
                    {schedule.conferenceTitle || schedule.sourceLabel || 'Untitled Schedule'}
                  </div>
                  
                  {schedule.endpointUrl && (
                    <div className="muted" style={{ fontSize: '12px', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {schedule.endpointUrl}
                    </div>
                  )}
                  
                  {!schedule.endpointUrl && schedule.sourceLabel && (
                    <div className="muted" style={{ fontSize: '12px', marginBottom: 4 }}>
                      File: {schedule.sourceLabel}
                    </div>
                  )}
                  
                  <div className="muted" style={{ fontSize: '12px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {schedule.sessionCount && (
                      <span>{schedule.sessionCount} sessions</span>
                    )}
                    {schedule.lastAccessedAt && (
                      <span>Last opened: {formatDate(schedule.lastAccessedAt)}</span>
                    )}
                    {schedule.lastFetchedAt && (
                      <span>Data from: {formatDate(schedule.lastFetchedAt)}</span>
                    )}
                  </div>
                </div>
                
                <button
                  className="btn"
                  onClick={(e) => handleDelete(schedule.key, e)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    marginLeft: '12px',
                    flexShrink: 0,
                  }}
                  title="Delete this schedule"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
