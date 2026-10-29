import { StrictMode } from 'react'
import type { Root } from 'react-dom/client'
// Antes que cualquier componente, para que sus estilos queden después en la cascada.
import './styles/index.css'
import './styles/components.css'
import App from './App'
import { initMonitoring } from './lib/monitoring'
import { registerServiceWorker } from './lib/push'
import { installStaleChunkReload } from './lib/staleChunk'

/** La app del taller. El portal del cliente arranca aparte (ver main.tsx). */
export function start(root: Root) {
  // index.html trae el título y la descripción de la página del taller (los leen los buscadores y
  // las vistas previas de WhatsApp). La app tiene los suyos y no se indexa.
  document.title = 'Restorify'
  const robots = document.createElement('meta')
  robots.name = 'robots'
  robots.content = 'noindex'
  document.head.appendChild(robots)

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
