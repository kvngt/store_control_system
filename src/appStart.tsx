import { StrictMode } from 'react'
import type { Root } from 'react-dom/client'
import App from './App'
import { initMonitoring } from './lib/monitoring'
import { registerServiceWorker } from './lib/push'
import { installStaleChunkReload } from './lib/staleChunk'

/** La app del taller. El portal del cliente arranca aparte (ver main.tsx). */
export function start(root: Root) {
  // Sentry, si hay DSN (ver lib/monitoring.ts).
  initMonitoring()

  // Solo para push (ver public/sw.js): no cachea la app.
  registerServiceWorker()

  // Tras publicar una versión, una pestaña abierta pide archivos que ya no existen.
  installStaleChunkReload()

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
