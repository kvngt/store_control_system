import * as Sentry from '@sentry/react';
import type { UserProfile } from '../types/database';

/**
 * Seguimiento de errores con Sentry, en un solo lugar.
 *
 * Pedido del taller (03/10/2026): "dar trazabilidad a los problemas que nos reportan". Sentry
 * estaba instalado pero solo arrancaba con `VITE_SENTRY_DSN`, que no está en Hostinger, y aun
 * así nada le llegaba: el `ErrorBoundary` solo hacía `console.error`. Con este módulo:
 *
 *   * Un error que tumba la pantalla o una consulta que falla por algo inesperado llega a
 *     Sentry con quién tenía la sesión (`identifyUser`).
 *   * Cualquier persona puede mandar "Reportar un problema" (`openProblemReport`) con lo que
 *     pasó; Sentry adjunta la grabación de los segundos previos.
 *
 * Sin DSN todo es un no-op: las pruebas, el desarrollo local y un despliegue sin Sentry se
 * comportan igual que antes. El resto del código no importa `@sentry/react` directamente.
 *
 * Privacidad: la grabación oculta todo el texto y bloquea imágenes y videos (son datos de
 * clientes) y solo se guarda cuando hay un error o un reporte, no de sesiones al azar.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export const monitoringEnabled = Boolean(DSN);

export function initMonitoring() {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // La versión (`release`) la inyecta `sentryVitePlugin` con el commit del build.
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
      // Sin botón flotante: el formulario se abre desde Configuración y desde la pantalla
      // de error (`openProblemReport`).
      Sentry.feedbackIntegration({ autoInject: false, colorScheme: 'system', showBranding: false }),
    ],
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

/** Quién tiene la sesión, para saber a quién le pasó. `null` al cerrar sesión. */
export function identifyUser(user: Pick<UserProfile, 'id' | 'rol' | 'sede_id' | 'nombre_completo' | 'email'> | null) {
  if (!DSN) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: user.id, username: user.nombre_completo, email: user.email ?? undefined });
  Sentry.setTag('rol', user.rol);
  Sentry.setTag('sede', user.sede_id ?? 'ninguna');
}

/** Manda un error a Sentry con contexto. No hace nada sin DSN. */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (!DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/**
 * Lo que falla por una razón conocida y ya tiene su mensaje en pantalla: no es un error de la
 * app. Una fila que no existe (PGRST116), un permiso negado (42501), una regla de la base
 * (23xxx, P0001) o la red del taller que se cayó.
 */
export function isExpectedFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && (code === 'PGRST116' || code === '42501' || code === 'P0001' || code.startsWith('23'))) {
    return true;
  }
  return typeof message === 'string' && /failed to fetch|load failed|networkerror|network request failed/i.test(message);
}

export interface ProblemReportLabels {
  formTitle: string;
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  messageLabel: string;
  messagePlaceholder: string;
  submitButtonLabel: string;
  cancelButtonLabel: string;
  successMessageText: string;
  isRequiredLabel: string;
  addScreenshotButtonLabel: string;
  removeScreenshotButtonLabel: string;
}

/**
 * Abre el formulario "Reportar un problema" de Sentry con los textos del idioma de la app.
 * Devuelve false si Sentry no está configurado (el botón no debería verse en ese caso).
 */
export async function openProblemReport(labels: ProblemReportLabels): Promise<boolean> {
  if (!DSN) return false;
  const feedback = Sentry.getFeedback();
  if (!feedback) return false;
  const form = await feedback.createForm(labels);
  form.appendToDom();
  form.open();
  return true;
}
