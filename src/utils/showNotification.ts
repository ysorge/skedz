/**
 * Show a notification that works both with and without Service Worker
 */
export async function showNotification(title: string, options?: NotificationOptions): Promise<void> {
  if (!('Notification' in window)) {
    throw new Error('Notifications not supported')
  }

  if (Notification.permission !== 'granted') {
    throw new Error('Notification permission not granted')
  }

  // If Service Worker is active, use ServiceWorkerRegistration.showNotification
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(title, options)
  } else {
    // Fallback to regular Notification API
    new Notification(title, options)
  }
}
