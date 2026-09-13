import { StrictMode } from 'react'
import type { Root } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App'
import { registerServiceWorker } from './lib/push'

/** La app del taller. El portal del cliente arranca aparte (ver main.tsx). */
export function start(root: Root) {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    })
  }

  // Solo para push (ver public/sw.js): no cachea la app.
  registerServiceWorker()

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
