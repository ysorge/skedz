import React from 'react'

export default function HeartIcon(props: { filled: boolean; title?: string }) {
  const fill = props.filled ? 'currentColor' : 'none'
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 20.3S6.3 15.9 4 12C1.7 8.3 3.5 4.9 7 4.3c1.9-.3 3.8.5 5 2 1.2-1.5 3.1-2.3 5-2 3.5.6 5.3 4 3 7.7-2.3 3.9-8 8.3-8 8.3z"
        fill={fill}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
