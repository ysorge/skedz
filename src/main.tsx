import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'
import { registerSW } from 'virtual:pwa-register'

// Register service worker (PWA) with update notification
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New content available')
    // Show user a notification instead of automatically reloading
    if (confirm('Eine neue Version der App ist verfügbar. Jetzt aktualisieren?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('[PWA] App ready to work offline')
  },
  onRegistered(registration) {
    console.log('[PWA] Service worker registered')
    
    // Check for updates every 6 hours (21600000 ms)
    if (registration) {
      setInterval(() => {
        console.log('[PWA] Checking for updates...')
        registration.update()
      }, 21600000)
    }
  }
})

// Listen for messages from service worker
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') {
      console.log('[PWA] Service worker updated')
      // Show user a notification instead of automatically reloading
      if (confirm('Die App wurde aktualisiert. Jetzt neu laden?')) {
        window.location.reload()
      }
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
