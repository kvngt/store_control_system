import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, FileWarning, Send, XCircle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { getErrorMessage } from '../../lib/errors';
import { money } from '../../lib/money';
import { queryKeys } from '../../lib/queryClient';
import { quotesService } from '../../services/quotes.service';
import { relativeTime } from '../notifications/renderNotification';
import type { LineState, WorkOrder } from '../../types/database';

interface Line {
  descripcion: string;
  monto: number;
  estado: LineState;
  presupuestoId: string | null;
}

function linesOf(order: WorkOrder): Line[] {
  return [
    ...(order.labor_items || []).map((l) => ({
      descripcion: l.descripcion, monto: Number(l.costo), estado: l.estado ?? 'aprobado', presupuestoId: l.presupuesto_id ?? null,
    })),
    ...(order.repuestos || []).map((p) => ({
      descripcion: p.descripcion, monto: Number(p.subtotal), estado: p.estado ?? 'aprobado', presupuestoId: p.presupuesto_id ?? null,
    })),
  ];
}

/**
 * "Autorización del cliente", arriba del Resumen de la orden (solo administración; pedido del
 * taller del 06/10/2026). Dice en una línea en qué va lo cotizado y deja hacer lo siguiente
 * desde ahí:
 *   * trabajos sin enviar → "Enviar presupuesto" (o "Registrar autorización" en Trabajos);
 *   * presupuesto enviado → desde cuándo espera y cuántas líneas;
 *   * la última respuesta → qué autorizó el cliente y qué no.
 * Desde que la firma no autoriza (20261010000022), sin esto la orden no decía que faltaba
 * mandar el presupuesto.
 */
export default function AuthorizationPanel({ order, onOpenQuote }: { order: WorkOrder; onOpenQuote: () => void }) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);

  const quotesQuery = useQuery({
    queryKey: queryKeys.quotes(order.id),
    queryFn: () => quotesService.listQuotes(order.id),
  });

  const lines = linesOf(order);
  const drafts = lines.filter((l) => l.estado === 'borrador');
  const pending = lines.filter((l) => l.estado === 'pendiente');
  const quotes = quotesQuery.data ?? [];
  const open = quotes.find((q) => q.estado === 'enviado') ?? null;
  const lastAnswered = quotes.find((q) => q.estado === 'respondido') ?? null;
  const answeredLines = lastAnswered ? lines.filter((l) => l.presupuestoId === lastAnswered.id) : [];
  const approved = answeredLines.filter((l) => l.estado === 'aprobado');
  const rejected = answeredLines.filter((l) => l.estado === 'rechazado');
  const sum = (list: Line[]) => list.reduce((acc, l) => acc + l.monto, 0);

  if (order.estatus === 'entregado' || (drafts.length === 0 && !open && !lastAnswered)) return null;

  const send = async () => {
    if (!confirm(t('quotes.sendConfirm'))) return;
    setSending(true);
    try {
      const result = await quotesService.sendQuote(order.id, true);
      showToast(result.correo === 'sin_correo' ? 'error' : 'success', t(result.correo === 'sin_correo' ? 'quotes.sentNoEmail' : 'quotes.sent'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(order.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes(order.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.customerEmails(order.id) }),
        queryClient.invalidateQueries({ queryKey: ['work-orders'] }),
      ]);
    } catch (err) {
      showToast('error', t('quotes.sendError'), getErrorMessage(err, language));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="authorization-panel" role="region" aria-label={t('authorization.title')}>
      <div className="authorization-panel-title">{t('authorization.title')}</div>

      {drafts.length > 0 && !open && (
        <div className="authorization-row is-draft">
          <FileWarning size={16} aria-hidden="true" />
          <div className="authorization-row-text">
            <strong>{t('authorization.notSent').replace('{count}', String(drafts.length)).replace('{total}', money(sum(drafts)))}</strong>
            <span>{t('authorization.notSentHint')}</span>
          </div>
          <div className="authorization-row-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void send()} disabled={sending}>
              <Send size={14} /> {sending ? t('common.loading') : t('authorization.send')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenQuote}>
              {t('authorization.registerInWork')}
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="authorization-row is-waiting">
          <Clock size={16} aria-hidden="true" />
          <div className="authorization-row-text">
            <strong>
              {t('authorization.waiting')
                .replace('{numero}', String(open.numero))
                .replace('{time}', relativeTime(open.creado_en, language))}
            </strong>
            <span>{t('authorization.waitingHint').replace('{count}', String(pending.length)).replace('{total}', money(sum(pending)))}</span>
          </div>
          <div className="authorization-row-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenQuote}>
              {t('authorization.viewQuote')}
            </button>
          </div>
        </div>
      )}

      {lastAnswered && (approved.length > 0 || rejected.length > 0) && (
        <div className={`authorization-row ${rejected.length > 0 && approved.length === 0 ? 'is-rejected' : 'is-approved'}`}>
          {approved.length > 0 ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
          <div className="authorization-row-text">
            <strong>
              {t('authorization.answered')
                .replace('{numero}', String(lastAnswered.numero))
                .replace('{time}', lastAnswered.respondido_en ? relativeTime(lastAnswered.respondido_en, language) : '')}
            </strong>
            {approved.length > 0 && (
              <span>{t('authorization.approvedList').replace('{list}', approved.map((l) => l.descripcion).join(', '))}</span>
            )}
            {rejected.length > 0 && (
              <span className="authorization-rejected">{t('authorization.rejectedList').replace('{list}', rejected.map((l) => l.descripcion).join(', '))}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
