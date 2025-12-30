import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Error boundary component to catch and handle React component errors.
 * Prevents the entire app from crashing on runtime errors.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // Here you could send to error tracking service (Sentry, etc.)
    // Example: Sentry.captureException(error, { extra: errorInfo })
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: undefined })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="container">
          <div className="card" style={{ marginTop: '40px' }}>
            <div className="cardHeader">
              <h2>Something went wrong</h2>
            </div>
            <div className="cardBody stack">
              <p className="muted">
                The application encountered an unexpected error. This has been logged for investigation.
              </p>
              {this.state.error && (
                <details style={{ marginTop: '12px' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>
                    Error details
                  </summary>
                  <pre
                    style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: 'var(--panel2)',
                      borderRadius: '8px',
                      overflow: 'auto',
                      fontSize: '13px',
                    }}
                  >
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button className="btn" onClick={this.handleReset}>
                  Try again
                </button>
                <button className="btn" onClick={() => window.location.reload()}>
                  Reload page
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
