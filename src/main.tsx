import { createRoot } from 'react-dom/client'
import './styles/index.css'
import './styles/components.css'
import { isCustomerPortalPath } from './portal/path'

// Dos aplicaciones en el mismo sitio, cada una en su propio paquete:
//
// - /r/<token> es el reporte del cliente. Lo abre alguien que no es del taller,
//   casi siempre desde el teléfono y con datos móviles. No descarga la app del
//   taller, ni el cliente de Supabase, ni Sentry (que grabaría la sesión de una
//   persona ajena), ni registra el service worker de push.
// - Todo lo demás es la app del taller.
const root = createRoot(document.getElementById('root')!)

if (isCustomerPortalPath(window.location.pathname)) {
  void import('./portal/start').then((m) => m.start(root))
} else {
  void import('./appStart').then((m) => m.start(root))
}
