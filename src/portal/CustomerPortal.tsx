import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSignature,
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
import { answerQuote, fetchPortal, setEmailPreference } from './portal.api';
import type { PortalMedia, PortalQuote, PortalReport, PortalResponse, PortalShop } from './portal.types';
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

      {report && token && <Report report={report} token={token} s={s} language={language} onReload={() => load(undefined, true)} />}
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

function Report({
  report,
  token,
  s,
  language,
  onReload,
}: {
  report: PortalReport;
  token: string;
  s: Strings;
  language: PortalLanguage;
  onReload: () => Promise<void>;
}) {
  const fmt = useFormatters(language);
  const { orden, vehiculo, taller } = report;
  const reception = report.multimedia.filter((m) => m.origen === 'recepcion');
  const progress = report.multimedia.filter((m) => m.origen === 'avance');
  // Los avances que el taller decidió mostrar, cada uno con sus archivos. Los archivos
  // publicados cuyo avance no viene en la lista (los que un admin publicó suelto) se
  // agrupan al final, como siempre.
  const updates = report.avances ?? [];
  const updateIds = new Set(updates.map((u) => u.id));
  const looseProgress = progress.filter((m) => !m.avance_id || !updateIds.has(m.avance_id));
  const vehicleTitle = [vehiculo.anio, vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ');
  // La confirmación de una respuesta vive aquí y no en la sección del presupuesto:
  // al responder, el presupuesto desaparece de la página.
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="portal-body">
      <ShopHeader shop={taller} />

      {notice && (
        <section className="portal-card portal-notice" role="status">
          <Check size={18} /> {notice}
        </section>
      )}

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

      {/* Lo primero después del estado: es lo único que espera algo del cliente. */}
      {report.presupuesto && report.presupuesto.lineas.length > 0 && (
        <QuoteSection
          key={report.presupuesto.id}
          quote={report.presupuesto}
          token={token}
          s={s}
          fmt={fmt}
          onAnswered={async (message) => {
            if (message) setNotice(message);
            await onReload();
          }}
        />
      )}

      <section className="portal-card">
        <h2 className="portal-section-title">
          <Wrench size={18} /> {s.progressTitle}
        </h2>
        {updates.length === 0 && looseProgress.length === 0 ? (
          <p className="portal-muted">{s.noProgressMedia}</p>
        ) : (
          <div className="portal-updates">
            {updates.map((u) => {
              const files = progress.filter((m) => m.avance_id === u.id);
              return (
                <article key={u.id} className="portal-update">
                  <p className="portal-update-date">{fmt.dateTime(u.fecha)}</p>
                  <p className="portal-update-text">{u.mensaje || s.progressNoMessage}</p>
                  {files.length > 0 && <PortalMediaGrid media={files} s={s} fmt={fmt} />}
                </article>
              );
            })}
            {looseProgress.length > 0 && <PortalMediaGrid media={looseProgress} s={s} fmt={fmt} showDates />}
          </div>
        )}
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
    case 'espera_autorizacion':
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
          {(cuenta.no_autorizados ?? []).length > 0 && (
            <div className="portal-lines portal-not-authorized">
              <div className="portal-label">{s.notAuthorized}</div>
              {(cuenta.no_autorizados ?? []).map((line, i) => (
                <div key={i} className="portal-line">
                  <span>{line.descripcion}</span>
                  <span>{fmt.money(line.monto)}</span>
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
      {(report.presupuestos_respondidos ?? []).length > 0 && (
        <div className="portal-quote-history">
          <div className="portal-label">{s.historyTitle}</div>
          <ul>
            {(report.presupuestos_respondidos ?? []).map((q) => (
              <li key={q.numero}>
                <div>
                  {s.historyItem
                    .replace('{numero}', String(q.numero))
                    .replace('{via}', s.via[q.via] ?? q.via)
                    .replace('{fecha}', fmt.dateTime(q.respondido_en))}
                  {q.nombre && q.via !== 'firma_recepcion' && ` ${s.historyBy.replace('{nombre}', q.nombre)}`}
                </div>
                <div className="portal-muted">
                  {s.historyCounts
                    .replace('{autorizados}', String(q.autorizados))
                    .replace('{rechazados}', String(q.rechazados))
                    .replace('{total}', fmt.money(q.total_aprobado ?? 0))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * El presupuesto que espera la respuesta del cliente. Nada viene marcado: autorizar
 * es una decisión explícita, línea por línea, con su nombre como constancia.
 */
function QuoteSection({
  quote,
  token,
  s,
  fmt,
  onAnswered,
}: {
  quote: PortalQuote;
  token: string;
  s: Strings;
  fmt: Formatters;
  onAnswered: (message?: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = quote.lineas.filter((l) => selected.has(l.id)).reduce((sum, l) => sum + Number(l.monto), 0);
  const nameOk = name.trim().length >= 2;

  const submit = async (approvedIds: string[]) => {
    const question =
      approvedIds.length === 0
        ? s.confirmRejectAll
        : s.confirmAuthorize.replace('{count}', String(approvedIds.length)).replace('{total}', fmt.money(total));
    if (!confirm(question)) return;

    setSending(true);
    setMessage(null);
    try {
      const result = await answerQuote(token, {
        quoteId: quote.id,
        approvedIds,
        shownIds: quote.lineas.map((l) => l.id),
        name: name.trim(),
        comment: comment.trim(),
      });
      if (result.ok) {
        await onAnswered(s.answered);
        return;
      }
      setMessage({ ok: false, text: s.answerErrors[result.motivo] ?? s.answerErrors.solicitud_invalida });
      // El presupuesto ya no es el que el cliente tiene en pantalla: se vuelve a pedir.
      if (result.motivo !== 'nombre_requerido') await onAnswered();
    } catch {
      setMessage({ ok: false, text: s.answerErrors.red });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="portal-card portal-quote is-highlighted" id="presupuesto">
      <h2 className="portal-section-title">
        <FileSignature size={18} /> {s.quoteTitle}
      </h2>
      <p className="portal-muted">{s.quoteSentOn.replace('{fecha}', fmt.date(quote.enviado_en))}</p>
      <p>{s.quoteIntro}</p>

      <div className="portal-quote-select">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(quote.lineas.map((l) => l.id)))}>
          {s.selectAll}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
          {s.selectNone}
        </button>
      </div>

      <ul className="portal-quote-lines">
        {quote.lineas.map((line) => (
          <li key={line.id}>
            <label className={'portal-quote-line' + (selected.has(line.id) ? ' is-selected' : '')}>
              <input type="checkbox" checked={selected.has(line.id)} onChange={() => toggle(line.id)} />
              <span className="portal-quote-desc">
                {line.descripcion}
                {line.cantidad > 1 && (
                  <span className="portal-muted">
                    {' · '}
                    {s.quantityTimes.replace('{cantidad}', String(line.cantidad)).replace('{precio}', fmt.money(line.precio_unitario))}
                  </span>
                )}
              </span>
              <span className="portal-quote-amount">{fmt.money(line.monto)}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="portal-line is-balance">
        <span>{s.selectedTotal}</span>
        <span>{fmt.money(total)}</span>
      </div>

      <div className="portal-field">
        <label htmlFor="quote-name">{s.yourName}</label>
        <input id="quote-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
        <p className="portal-muted">{s.yourNameHint}</p>
      </div>
      <div className="portal-field">
        <label htmlFor="quote-comment">{s.comment}</label>
        <textarea id="quote-comment" className="form-input form-textarea" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      </div>

      <div className="portal-actions">
        <button type="button" className="btn btn-primary" disabled={sending || selected.size === 0 || !nameOk} onClick={() => void submit([...selected])}>
          {s.authorize}
          {selected.size > 0 && ` (${selected.size})`}
        </button>
        <button type="button" className="btn btn-secondary" disabled={sending || !nameOk} onClick={() => void submit([])}>
          {s.rejectAll}
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
