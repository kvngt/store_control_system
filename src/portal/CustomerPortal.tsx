import { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe } from 'lucide-react';
import { applySedeBranding } from '../lib/branding';
import { Report } from './components/Report';
import { Unavailable } from './components/Unavailable';
import { isStaffPreview } from './path';
import { fetchPortal, setLanguagePreference } from './portal.api';
import type { PortalResponse } from './portal.types';
import { initialPortalLanguage, portalStrings, savePortalLanguage, savedPortalLanguage, type PortalLanguage } from './strings';
import { translateReport } from './translate';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; data: PortalResponse };

/**
 * El reporte web del cliente.
 *
 * Pensado primero para el teléfono: una columna, lo más importante arriba (en qué
 * va su vehículo), y la multimedia pesada solo cuando la toca.
 */
export default function CustomerPortal({ token }: { token: string | null }) {
  const [language, setLanguage] = useState<PortalLanguage>(initialPortalLanguage);
  const s = portalStrings[language];
  const [state, setState] = useState<LoadState>(token ? { kind: 'loading' } : { kind: 'loaded', data: { estado_enlace: 'no_encontrado' } });

  const load = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (!token) return;
      if (!silent) setState({ kind: 'loading' });
      try {
        const data = await fetchPortal(token, signal);
        setState({ kind: 'loaded', data });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Una recarga silenciosa que falla deja lo que ya se ve.
        if (!silent) setState({ kind: 'error' });
      }
    },
    [token]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const report = state.kind === 'loaded' && state.data.estado_enlace === 'ok' ? state.data : null;
  const shop = state.kind === 'loaded' ? state.data.taller : undefined;
  // Lo escrito a mano por el taller, en inglés si el cliente lo pidió (06/10/2026).
  const shown = useMemo(() => (report ? translateReport(report, language) : null), [report, language]);

  // Quien nunca eligió idioma en este navegador ve el de sus correos (inglés por defecto).
  const clientLanguage = report?.cliente.idioma;
  useEffect(() => {
    if (clientLanguage && !savedPortalLanguage()) setLanguage(clientLanguage);
  }, [clientLanguage]);

  // Las URLs de fotos y videos duran 2 horas. Si la página queda abierta, se piden
  // de nuevo cinco minutos antes de que venzan.
  useEffect(() => {
    if (!report) return;
    const refreshIn = new Date(report.urls_vencen_en).getTime() - Date.now() - 5 * 60 * 1000;
    const timer = window.setTimeout(() => void load(undefined, true), Math.max(refreshIn, 30_000));
    return () => window.clearTimeout(timer);
  }, [report, load]);

  useEffect(() => {
    applySedeBranding(shop?.color, 'light');
    document.title = shop ? `${report ? `${s.order} ${report.orden.numero} · ` : ''}${shop.nombre}` : 'Restorify';
  }, [shop, report, s.order]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const toggleLanguage = () => {
    const next = language === 'es' ? 'en' : 'es';
    setLanguage(next);
    savePortalLanguage(next);
    // Y los correos le llegan en ese idioma. No si es el personal viendo el enlace desde la orden
    // (?vista=taller): cambiaba el idioma de los correos del cliente sin que nadie lo notara.
    if (token && !isStaffPreview()) void setLanguagePreference(token, next).catch(() => undefined);
  };

  return (
    <main className="portal">
      <div className="portal-topbar">
        <button type="button" className="portal-language" onClick={toggleLanguage}>
          <Globe size={14} /> {s.language}
        </button>
      </div>

      {state.kind === 'loading' && (
        <div className="portal-center" role="status">
          <div className="spinner" />
          <p>{s.loading}</p>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="portal-center">
          <p>{s.loadError}</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            {s.retry}
          </button>
        </div>
      )}

      {state.kind === 'loaded' && state.data.estado_enlace !== 'ok' && (
        <Unavailable
          state={state.data.estado_enlace}
          shop={state.data.taller}
          cliente={state.data.cliente}
          token={token}
          s={s}
        />
      )}

      {shown && token && <Report report={shown} token={token} s={s} language={language} onReload={() => load(undefined, true)} />}
    </main>
  );
}
