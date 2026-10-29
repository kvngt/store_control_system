import { createRoot, type Root } from 'react-dom/client'
import { chooseEntry, isInstalledApp, type Entry } from './landing/entry'
import { preloadHeroImage } from './landing/heroImage'
import { isStaleChunkError, reloadForStaleChunk } from './lib/staleChunk'

// Tres aplicaciones en el mismo sitio, cada una en su propio paquete (y cada una carga sus estilos):
//
// - /r/<token> y /s/<token> son el portal del cliente y la página de próximo servicio.
//   Los abre alguien que no es del taller, casi siempre desde el teléfono y con datos móviles.
//   No descarga la app del taller, ni el cliente de Supabase, ni Sentry (que grabaría la sesión de una
//   persona ajena), ni registra el service worker de push.
// - La raíz, en el navegador, es la página del taller para el público (src/landing), aunque haya una
//   sesión del personal guardada: el panel está en /panel. /home la muestra siempre. Tampoco
//   descarga la app. En la app instalada, la raíz es la app (el login o el panel).
// - Todo lo demás es la app del taller.
//
// Cada import() va en su propia función de este objeto, no en las ramas de un if/else: con tres ramas,
// el minificador juntó las llamadas en una sola con la lista de archivos de la app, y en el build la
// página de inicio cargaba los estilos y los paquetes de la app y no los suyos (26/10/2026).
const starters = {
  portal: () => import('./portal/start'),
  landing: () => import('./landing/start'),
  app: () => import('./appStart'),
} satisfies Record<Entry, () => Promise<{ start: (root: Root) => void }>>

const root = createRoot(document.getElementById('root')!)
const entry = chooseEntry(window.location.pathname, {
  installed: isInstalledApp(),
  search: window.location.search,
  hash: window.location.hash,
})

// La foto de portada es lo más pesado de la primera pantalla: se pide ya, en paralelo con el paquete.
if (entry === 'landing') preloadHeroImage()

// Una pestaña abierta antes de publicar pide archivos que ya no existen: se recarga una vez.
starters[entry]()
  .then((m) => m.start(root))
  .catch((error: unknown) => {
    if (!isStaleChunkError(error) || !reloadForStaleChunk()) throw error
  })
