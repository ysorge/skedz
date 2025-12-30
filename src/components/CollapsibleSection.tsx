import React, { useState, useEffect } from 'react'

export default function CollapsibleSection(props: {
  title: string
  defaultOpen?: boolean
  storageKey?: string
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(() => {
    if (props.storageKey) {
      const stored = localStorage.getItem(`collapsible:${props.storageKey}`)
      if (stored !== null) {
        return stored === 'true'
      }
    }
    return props.defaultOpen ?? false
  })

  useEffect(() => {
    if (props.storageKey) {
      localStorage.setItem(`collapsible:${props.storageKey}`, String(isOpen))
    }
  }, [isOpen, props.storageKey])

  return (
    <div className="collapsibleSection">
      <button
        className="collapsibleHeader"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span>{props.title}</span>
        <span className="collapsibleArrow">{isOpen ? '▲' : '▼'}</span>
      </button>
      <div className={`collapsibleContent ${isOpen ? 'collapsibleContentOpen' : ''}`}>
        {isOpen && <div className="collapsibleBody">{props.children}</div>}
      </div>
    </div>
  )
}
