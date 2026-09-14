import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileSignature, RotateCcw, Send, X, XCircle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { getErrorMessage } from '../../lib/errors';
import { queryKeys } from '../../lib/queryClient';
import { relativeTime } from '../notifications/renderNotification';
import { quotesService } from '../../services/quotes.service';
import type { AdminAuthorizationVia, LineState, Quote, WorkOrder } from '../../types/database';

interface QuoteLine {
  id: string;
  descripcion: string;
  monto: number;
  cantidad: number;
  estado: LineState;
  presupuestoId: string | null;
}

const money = (value: number) => `$${Number(value).toFixed(2)}`;

/** Las líneas de la orden con su monto y estado, en el orden en que se agregaron. */
function linesOf(order: WorkOrder): QuoteLine[] {
  return [
    ...(order.labor_items || []).map((l) => ({
      id: l.id, descripcion: l.descripcion, monto: Number(l.costo), cantidad: 1, estado: l.estado ?? 'aprobado',
      presupuestoId: l.presupuesto_id ?? null, creado: l.creado_en ?? '',
    })),
    ...(order.repuestos || []).map((p) => ({
      id: p.id, descripcion: p.descripcion, monto: Number(p.subtotal), cantidad: p.cantidad, estado: p.estado ?? 'aprobado',
      presupuestoId: p.presupuesto_id ?? null, creado: p.creado_en ?? '',
    })),
  ]
    .sort((a, b) => a.creado.localeCompare(b.creado))
    .map(({ creado: _creado, ...line }) => line);
}

/**
 * El presupuesto de la orden (solo admin): lo que falta autorizar, el presupuesto
 * que espera al cliente y las respuestas anteriores.
 *
 * Nada aquí aprueba una línea con un UPDATE: enviar, registrar y cancelar son
 * funciones de la base que dejan evidencia de quién respondió, cómo y cuándo.
 */
export default function QuoteCard({ order }: { order: WorkOrder }) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);

  const quotesQuery = useQuery({
    queryKey: queryKeys.quotes(order.id),
    queryFn: () => quotesService.listQuotes(order.id),
  });

  const lines = useMemo(() => linesOf(order), [order]);
  const drafts = lines.filter((l) => l.estado === 'borrador');
  const pending = lines.filter((l) => l.estado === 'pendiente');
  const quotes = quotesQuery.data ?? [];
  const open = quotes.find((q) => q.estado === 'enviado') ?? null;
  const history = quotes.filter((q) => q.estado !== 'enviado');
  const sum = (list: QuoteLine[]) => list.reduce((acc, l) => acc + l.monto, 0);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(order.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes(order.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customerEmails(order.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customerLink(order.id) }),
      queryClient.invalidateQueries({ queryKey: ['work-orders'] }),
    ]);
  };

  const run = async (action: () => Promise<void>, errorKey: string) => {
    setBusy(true);
    try {
      await action();
      await refreshAll();
    } catch (err) {
      showToast('error', t(errorKey), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    if (!confirm(t('quotes.sendConfirm'))) return;
    void run(async () => {
      const result = await quotesService.sendQuote(order.id, true);
      showToast(result.correo === 'sin_correo' ? 'error' : 'success', t(result.correo === 'sin_correo' ? 'quotes.sentNoEmail' : 'quotes.sent'));
    }, 'quotes.sendError');
  };

  const cancel = (quote: Quote) => {
    if (!confirm(t('quotes.cancelConfirm'))) return;
    void run(async () => {
      await quotesService.cancelQuote(quote.id);
      showToast('success', t('quotes.cancelled'));
    }, 'quotes.cancelError');
  };

  if (!open && drafts.length === 0 && history.length === 0) return null;

  return (
    <div className="card quote-card" style={{ marginTop: 'var(--space-4)' }}>
      <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
        <FileSignature size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('quotes.title')}
      </h3>

      {open ? (
        <div className="quote-status is-open">
          <strong>{t('quotes.openTitle').replace('{numero}', String(open.numero))}</strong>
          <p>
            {t('quotes.openHint')
              .replace('{time}', relativeTime(open.creado_en, language))
              .replace('{count}', String(pending.length))
              .replace('{total}', money(sum(pending)))}
          </p>
          {drafts.length > 0 && <p>{t('quotes.openDraftsHint').replace('{count}', String(drafts.length))}</p>}
          <div className="quote-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setRegistering(true)} disabled={busy}>
              <CheckCircle2 size={14} /> {t('quotes.register')}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={send} disabled={busy}>
              {drafts.length > 0 ? <Send size={14} /> : <RotateCcw size={14} />}
              {drafts.length > 0 ? t('quotes.sendMore') : t('quotes.resend')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancel(open)} disabled={busy}>
              <XCircle size={14} style={{ color: 'var(--color-danger)' }} /> {t('quotes.cancel')}
            </button>
          </div>
        </div>
      ) : drafts.length > 0 ? (
        <div className="quote-status is-draft">
          <strong>{t('quotes.draftsTitle')}</strong>
          <p>
            {t('quotes.draftsHint').replace('{count}', String(drafts.length)).replace('{total}', money(sum(drafts)))}
          </p>
          <div className="quote-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={send} disabled={busy}>
              <Send size={14} /> {t('quotes.send')}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRegistering(true)} disabled={busy}>
              <CheckCircle2 size={14} /> {t('quotes.register')}
            </button>
          </div>
        </div>
      ) : null}

      {history.length > 0 && (
        <div className="quote-history">
          <h4>{t('quotes.historyTitle')}</h4>
          <ul>
            {history.map((q) => (
              <li key={q.id}>
                {q.estado === 'cancelado' ? (
                  <span className="quote-history-muted">
                    {t('quotes.cancelledItem')
                      .replace('{numero}', String(q.numero))
                      .replace('{time}', relativeTime(q.cancelado_en ?? q.creado_en, language))}
                  </span>
                ) : (
                  <>
                    <div>
                      {t('quotes.historyItem')
                        .replace('{numero}', String(q.numero))
                        .replace('{via}', t(`quotes.responseVia.${q.respondido_via}`))
                        .replace('{time}', relativeTime(q.respondido_en ?? q.creado_en, language))}
                      {q.respondido_por_nombre && ` · ${q.respondido_por_nombre}`}
                    </div>
                    <QuoteCounts quote={q} lines={lines} />
                    {q.comentario_cliente && (
                      <div className="quote-history-comment">
                        {t('quotes.historyComment').replace('{comment}', q.comentario_cliente)}
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {registering && (
        <AuthorizationModal
          order={order}
          lines={[...pending, ...drafts]}
          busy={busy}
          onClose={() => setRegistering(false)}
          onSubmit={(input) =>
            run(async () => {
              await quotesService.registerAuthorization({ orderId: order.id, ...input });
              showToast('success', t('quotes.registered'));
              setRegistering(false);
            }, 'quotes.registerError')
          }
        />
      )}
    </div>
  );
}

function QuoteCounts({ quote, lines }: { quote: Quote; lines: QuoteLine[] }) {
  const { t } = useLanguage();
  // Las líneas de este presupuesto. Una rechazada que se corrigió vuelve a borrador
  // y sale de él, así que el total autorizado es el que guardó la base.
  const own = lines.filter((l) => l.presupuestoId === quote.id);
  return (
    <div className="quote-history-muted">
      {t('quotes.historyCounts')
        .replace('{approved}', String(own.filter((l) => l.estado === 'aprobado').length))
        .replace('{rejected}', String(own.filter((l) => l.estado === 'rechazado').length))
        .replace('{total}', money(Number(quote.total_aprobado ?? 0)))}
    </div>
  );
}

interface AuthorizationInput {
  approvedIds: string[];
  shownIds: string[];
  via: AdminAuthorizationVia;
  name: string;
  note: string;
}

function AuthorizationModal({
  order,
  lines,
  busy,
  onClose,
  onSubmit,
}: {
  order: WorkOrder;
  lines: QuoteLine[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: AuthorizationInput) => void;
}) {
  const { t } = useLanguage();
  // Marcado por defecto: lo común es que el cliente autorice todo por teléfono, y
  // desmarcar lo que no quiso es un toque por línea.
  const [approved, setApproved] = useState<Set<string>>(() => new Set(lines.map((l) => l.id)));
  const [via, setVia] = useState<AdminAuthorizationVia>('admin_telefono');
  const [name, setName] = useState(order.cliente?.nombre ?? '');
  const [note, setNote] = useState('');

  const toggle = (id: string) =>
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = lines.filter((l) => approved.has(l.id)).reduce((acc, l) => acc + l.monto, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="authorization-title">
        <div className="modal-header">
          <h3 className="modal-title" id="authorization-title">{t('quotes.modalTitle')}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>{t('quotes.modalHint')}</p>

          <div className="quote-select-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setApproved(new Set(lines.map((l) => l.id)))}>
              {t('quotes.selectAll')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setApproved(new Set())}>
              {t('quotes.selectNone')}
            </button>
          </div>

          <ul className="quote-lines">
            {lines.map((line) => (
              <li key={line.id}>
                <label className="checkbox-row">
                  <input type="checkbox" checked={approved.has(line.id)} onChange={() => toggle(line.id)} />
                  <span className="quote-line-desc">
                    {line.descripcion}
                    {line.cantidad > 1 && <span className="quote-history-muted"> × {line.cantidad}</span>}
                  </span>
                  <span className="quote-line-amount">{money(line.monto)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="quote-total">
            <span>{t('quotes.approvedTotal')}</span>
            <strong>{money(total)}</strong>
          </div>

          <div className="form-row" style={{ marginTop: 'var(--space-3)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="authorization-via">{t('quotes.via')}</label>
              <select id="authorization-via" className="form-input form-select" value={via} onChange={(e) => setVia(e.target.value as AdminAuthorizationVia)}>
                {(['admin_telefono', 'admin_presencial', 'admin_whatsapp'] as const).map((v) => (
                  <option key={v} value={v}>{t(`quotes.viaOptions.${v}`)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="authorization-name">{t('quotes.authorizedBy')}</label>
              <input id="authorization-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="authorization-note">{t('quotes.note')}</label>
            <textarea
              id="authorization-note"
              className="form-input form-textarea"
              placeholder={t('quotes.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || lines.length === 0}
            onClick={() => onSubmit({ approvedIds: [...approved], shownIds: lines.map((l) => l.id), via, name, note })}
          >
            {busy ? t('common.loading') : t('quotes.confirmRegister')}
          </button>
        </div>
      </div>
    </div>
  );
}
