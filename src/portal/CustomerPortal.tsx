import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Gauge,
  Fuel,
  Globe,
  Mail,
  MessageCircle,
  Mic,
  Phone,
  Play,
  Receipt,
  Wrench,
  X,
} from 'lucide-react';
import { applySedeBranding } from '../lib/branding';
import { formatDuration } from '../lib/media/mime';
import { telUrl, whatsAppUrl } from '../lib/phone';
import { fetchPortal, setEmailPreference } from './portal.api';
import type { PortalMedia, PortalReport, PortalResponse, PortalShop } from './portal.types';
import { initialPortalLanguage, portalStrings, savePortalLanguage, type PortalLanguage } from './strings';

type Strings = (typeof portalStrings)['es'];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; data: PortalResponse };

/** Una columna DATE ('2026-10-01') a mediodía UTC, para que no retroceda un día en EE. UU. */
function toDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

function useFormatters(language: PortalLanguage) {
  return useMemo(() => {
    const locale = language === 'es' ? 'es-US' : 'en-US';
    const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    const dateTime = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
    const number = new Intl.NumberFormat(locale);
    return {
      date: (v: string | null | undefined) => (v ? date.format(toDate(v)) : '—'),
      dateTime: (v: string | null | undefined) => (v ? dateTime.format(new Date(v)) : '—'),
      money: (v: number | null | undefined) => money.format(Number(v ?? 0)),
      number: (v: number | null | undefined) => (v == null ? '—' : number.format(v)),
    };
  }, [language]);
}

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
  };

  return (
    <div className="portal">
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
        <Unavailable state={state.data.estado_enlace} shop={state.data.taller} s={s} />
      )}

      {report && token && <Report report={report} token={token} s={s} language={language} />}
    </div>
  );
}

function ShopHeader({ shop }: { shop: PortalShop }) {
  return (
    <header className="portal-shop">
      {shop.logo_url && <img src={shop.logo_url} alt="" className="portal-shop-logo" />}
      <div className="portal-shop-name">{shop.nombre}</div>
    </header>
  );
}

function Unavailable({
  state,
  shop,
  s,
}: {
  state: 'no_encontrado' | 'revocado' | 'vencido';
  shop?: PortalShop;
  s: Strings;
}) {
  const [title, body] =
    state === 'revocado'
      ? [s.revokedTitle, s.revokedBody]
      : state === 'vencido'
        ? [s.expiredTitle, s.expiredBody]
        : [s.notFoundTitle, s.notFoundBody];
  const tel = telUrl(shop?.telefono);

  return (
    <div className="portal-body">
      {shop && <ShopHeader shop={shop} />}
      <section className="portal-card portal-unavailable">
        <h1>{title}</h1>
        <p>{body}</p>
        {tel && (
          <a className="btn btn-primary" href={tel}>
            <Phone size={16} /> {s.call} {shop?.telefono}
          </a>
        )}
      </section>
    </div>
  );
}

function Report({ report, token, s, language }: { report: PortalReport; token: string; s: Strings; language: PortalLanguage }) {
  const fmt = useFormatters(language);
  const { orden, vehiculo, taller } = report;
  const reception = report.multimedia.filter((m) => m.origen === 'recepcion');
  const progress = report.multimedia.filter((m) => m.origen === 'avance');
  const vehicleTitle = [vehiculo.anio, vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ');

  return (
    <div className="portal-body">
      <ShopHeader shop={taller} />

      <section className="portal-card portal-hero">
        <div className="portal-hero-top">
          <span className="portal-order-number">
            {s.order} {orden.numero}
          </span>
          <span className={`badge badge-${orden.estatus}`}>{s.status[orden.estatus]}</span>
        </div>
        <h1 className="portal-vehicle">
          <Car size={22} /> {vehicleTitle || s.vehicle}
        </h1>
        <p className="portal-vehicle-meta">
          {[vehiculo.color, vehiculo.placa ? `${s.plate} ${vehiculo.placa}` : s.noPlate, vehiculo.vin_final ? `${s.vinEnding} ${vehiculo.vin_final}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <StatusSteps status={orden.estatus} s={s} />
        <p className="portal-status-hint">{s.statusHint[orden.estatus]}</p>

        {orden.estatus !== 'entregado' && (
          <div className="portal-progress">
            <div className="portal-progress-label">
              <span>{s.progress}</span>
              <strong>{orden.porcentaje_avance}%</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, orden.porcentaje_avance))}%` }} />
            </div>
          </div>
        )}

        {orden.fecha_estimada_entrega && !['finalizado', 'entregado'].includes(orden.estatus) && (
          <p className="portal-eta">
            <Calendar size={14} /> {s.estimatedDelivery}: <strong>{fmt.date(orden.fecha_estimada_entrega)}</strong>
          </p>
        )}
      </section>

      <section className="portal-card">
        <h2 className="portal-section-title">
          <Wrench size={18} /> {s.progressTitle}
        </h2>
        {progress.length > 0 ? <PortalMediaGrid media={progress} s={s} fmt={fmt} showDates /> : <p className="portal-muted">{s.noProgressMedia}</p>}
      </section>

      <section className="portal-card">
        <h2 className="portal-section-title">
          <ClipboardList size={18} /> {s.receptionTitle}
        </h2>
        <dl className="portal-facts">
          <div>
            <dt><Calendar size={14} /> {s.receivedOn}</dt>
            <dd>{fmt.date(orden.fecha_ingreso)}</dd>
          </div>
          <div>
            <dt><Gauge size={14} /> {s.mileage}</dt>
            <dd>{fmt.number(orden.millas_ingreso)}</dd>
          </div>
          <div>
            <dt><Fuel size={14} /> {s.fuel}</dt>
            <dd>{s.fuelLevels[orden.nivel_gasolina] ?? orden.nivel_gasolina}</dd>
          </div>
        </dl>
        {orden.notas_recepcion?.trim() && (
          <div className="portal-notes">
            <div className="portal-label">{s.receptionNotes}</div>
            <p>{orden.notas_recepcion}</p>
          </div>
        )}
        {reception.length > 0 ? <PortalMediaGrid media={reception} s={s} fmt={fmt} /> : <p className="portal-muted">{s.noReceptionMedia}</p>}
        {orden.firma_url && (
          <div className="portal-signature">
            <div className="portal-label">{s.signature}</div>
            <img src={orden.firma_url} alt={s.signature} />
            {orden.firma_fecha && (
              <div className="portal-muted">
                {s.signedOn} {fmt.dateTime(orden.firma_fecha)}
              </div>
            )}
          </div>
        )}
      </section>

      <AccountSection report={report} s={s} fmt={fmt} />

      <section className="portal-card">
        <h2 className="portal-section-title">
          <Phone size={18} /> {s.contactTitle}
        </h2>
        <p className="portal-contact-name">{taller.nombre}</p>
        {taller.direccion && <p className="portal-muted">{taller.direccion}</p>}
        <div className="portal-actions">
          {telUrl(taller.telefono) && (
            <a className="btn btn-secondary" href={telUrl(taller.telefono)!}>
              <Phone size={16} /> {s.call}
            </a>
          )}
          {taller.whatsapp && (
            <a
              className="btn btn-primary"
              href={whatsAppUrl(taller.whatsapp, s.whatsappMessage.replace('{numero}', orden.numero))}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} /> {s.whatsapp}
            </a>
          )}
          {taller.email && (
            <a className="btn btn-secondary" href={`mailto:${taller.email}?subject=${encodeURIComponent(`${s.order} ${orden.numero}`)}`}>
              <Mail size={16} /> {s.writeEmail}
            </a>
          )}
        </div>
      </section>

      {report.cliente.tiene_correo && <EmailPreference token={token} initial={report.cliente.acepta_correos} s={s} />}

      <footer className="portal-footer">
        <p>{s.privateLink}</p>
        {report.enlace.expira_en && <p>{s.expiresOn.replace('{fecha}', fmt.date(report.enlace.expira_en))}</p>}
        <p className="portal-footer-brand">Restorify</p>
      </footer>
    </div>
  );
}

const STEP_ORDER = ['received', 'working', 'ready', 'delivered'] as const;

function stepIndex(status: PortalReport['orden']['estatus']): number {
  switch (status) {
    case 'recepcion':
      return 0;
    case 'en_proceso':
    case 'espera_repuestos':
      return 1;
    case 'finalizado':
      return 2;
    case 'entregado':
      return 3;
  }
}

function StatusSteps({ status, s }: { status: PortalReport['orden']['estatus']; s: Strings }) {
  const current = stepIndex(status);
  return (
    <ol className="portal-steps" aria-label={s.status[status]}>
      {STEP_ORDER.map((step, i) => (
        <li key={step} className={i < current ? 'is-done' : i === current ? 'is-current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="portal-step-dot">{i < current ? <Check size={12} /> : i + 1}</span>
          <span className="portal-step-label">{s.steps[step]}</span>
        </li>
      ))}
    </ol>
  );
}

type Formatters = ReturnType<typeof useFormatters>;

function AccountSection({ report, s, fmt }: { report: PortalReport; s: Strings; fmt: Formatters }) {
  const { cuenta } = report;
  const hasLines = cuenta.mano_obra.length > 0 || cuenta.repuestos.length > 0;

  return (
    <section className="portal-card">
      <h2 className="portal-section-title">
        <Receipt size={18} /> {s.accountTitle}
      </h2>
      {!hasLines && Number(cuenta.total) === 0 ? (
        <p className="portal-muted">{s.noCharges}</p>
      ) : (
        <>
          {cuenta.mano_obra.length > 0 && (
            <div className="portal-lines">
              <div className="portal-label">{s.labor}</div>
              {cuenta.mano_obra.map((line, i) => (
                <div key={i} className="portal-line">
                  <span>{line.descripcion}</span>
                  <span>{fmt.money(line.monto)}</span>
                </div>
              ))}
            </div>
          )}
          {cuenta.repuestos.length > 0 && (
            <div className="portal-lines">
              <div className="portal-label">{s.parts}</div>
              {cuenta.repuestos.map((line, i) => (
                <div key={i} className="portal-line">
                  <span>
                    {line.descripcion}
                    {line.cantidad > 1 && (
                      <span className="portal-muted">
                        {' '}
                        · {s.quantityShort} {line.cantidad} × {fmt.money(line.precio_unitario)}
                      </span>
                    )}
                  </span>
                  <span>{fmt.money(line.subtotal)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="portal-totals">
            <div className="portal-line is-total">
              <span>{s.total}</span>
              <span>{fmt.money(cuenta.total)}</span>
            </div>
            {Number(cuenta.deposito) > 0 && (
              <div className="portal-line">
                <span>{s.deposit}</span>
                <span>{fmt.money(cuenta.deposito)}</span>
              </div>
            )}
            {Number(cuenta.pagado) > 0 && (
              <div className="portal-line">
                <span>{s.paid}</span>
                <span>{fmt.money(cuenta.pagado)}</span>
              </div>
            )}
            {Number(cuenta.total) > 0 && Number(cuenta.saldo) <= 0 ? (
              <div className="portal-line is-balance is-settled">
                <span>{s.paidInFull}</span>
                <Check size={16} />
              </div>
            ) : (
              <div className="portal-line is-balance">
                <span>{s.balance}</span>
                <span>{fmt.money(cuenta.saldo)}</span>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function PortalMediaGrid({ media, s, fmt, showDates = false }: { media: PortalMedia[]; s: Strings; fmt: Formatters; showDates?: boolean }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const visual = media.filter((m) => m.tipo !== 'audio');
  const audio = media.filter((m) => m.tipo === 'audio');
  const opened = openIndex !== null ? visual[openIndex] : null;

  return (
    <div className="media-gallery portal-media">
      {visual.length > 0 && (
        <div className="media-grid">
          {visual.map((m, i) => {
            const thumb = m.miniatura_url ?? (m.tipo === 'foto' ? m.url : null);
            return (
              <div key={m.id} className="media-cell">
                <button type="button" className="media-tile" onClick={() => setOpenIndex(i)} aria-label={m.tipo === 'video' ? s.video : s.photo}>
                  {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="media-tile-placeholder" />}
                  {m.tipo === 'video' && (
                    <span className="media-tile-badge">
                      <Play size={12} fill="currentColor" /> {formatDuration(m.duracion_seg)}
                    </span>
                  )}
                </button>
                {showDates && <div className="portal-media-date">{fmt.dateTime(m.creado_en)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {audio.length > 0 && (
        <ul className="media-audio-list">
          {audio.map((m) => (
            <li key={m.id} className="media-audio-row">
              {playingAudio === m.id ? (
                <audio src={m.url} controls autoPlay preload="none" className="media-audio-player" />
              ) : (
                <button type="button" className="media-audio-play" onClick={() => setPlayingAudio(m.id)}>
                  <Play size={14} fill="currentColor" />
                  <Mic size={14} />
                  <span>
                    {s.voiceNote} · {formatDuration(m.duracion_seg)}
                    {showDates && ` · ${fmt.dateTime(m.creado_en)}`}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {opened && (
        <PortalViewer
          media={opened}
          s={s}
          onClose={() => setOpenIndex(null)}
          onPrev={visual.length > 1 ? () => setOpenIndex((i) => ((i ?? 0) - 1 + visual.length) % visual.length) : undefined}
          onNext={visual.length > 1 ? () => setOpenIndex((i) => ((i ?? 0) + 1) % visual.length) : undefined}
        />
      )}
    </div>
  );
}

function PortalViewer({
  media,
  s,
  onClose,
  onPrev,
  onNext,
}: {
  media: PortalMedia;
  s: Strings;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <button className="lightbox-close" onClick={onClose} aria-label={s.close}>
        <X size={20} />
      </button>
      {onPrev && (
        <button
          className="lightbox-nav is-prev"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label={s.previous}
        >
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        {media.tipo === 'video' ? (
          <video key={media.id} src={media.url} poster={media.miniatura_url ?? undefined} controls autoPlay playsInline preload="metadata" />
        ) : (
          <img src={media.url} alt={s.photo} />
        )}
      </div>
      {onNext && (
        <button
          className="lightbox-nav is-next"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label={s.next}
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}

function EmailPreference({ token, initial, s }: { token: string; initial: boolean; s: Strings }) {
  const [accepts, setAccepts] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLElement>(null);

  // Llegó desde "No quiero recibir estos correos". La baja se confirma con el
  // botón: un enlace directo daría de baja a quien tenga un filtro de correo que
  // abre los enlaces para revisarlos.
  const fromUnsubscribeLink = useMemo(() => new URLSearchParams(window.location.search).get('correos') === 'baja', []);

  useEffect(() => {
    if (fromUnsubscribeLink) ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [fromUnsubscribeLink]);

  const change = async (next: boolean) => {
    if (!next && !confirm(s.emailsStopConfirm)) return;
    setSaving(true);
    setMessage(null);
    try {
      setAccepts(await setEmailPreference(token, next));
      setMessage({ ok: true, text: s.emailsSaved });
    } catch {
      setMessage({ ok: false, text: s.emailsError });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section ref={ref} className={'portal-card' + (fromUnsubscribeLink && accepts ? ' is-highlighted' : '')} id="correos">
      <h2 className="portal-section-title">
        <Mail size={18} /> {s.emailsTitle}
      </h2>
      <p className="portal-muted">{accepts ? s.emailsOn : s.emailsOff}</p>
      {fromUnsubscribeLink && accepts && <p>{s.unsubscribeHint}</p>}
      <div className="portal-actions">
        <button type="button" className={accepts ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => void change(!accepts)} disabled={saving}>
          {accepts ? s.emailsStop : s.emailsStart}
        </button>
      </div>
      {message && (
        <p className={message.ok ? 'portal-success' : 'portal-error'} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
