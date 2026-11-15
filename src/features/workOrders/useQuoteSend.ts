import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { getErrorMessage } from '../../lib/errors';
import { customerCanReceiveEmail } from '../../lib/portalShare';
import { invalidateOrderEffects, queryKeys } from '../../lib/queryClient';
import { customerPortalService } from '../../services/customerPortal.service';
import { quotesService } from '../../services/quotes.service';
import type { WorkOrder } from '../../types/database';

/**
 * Envío compartido del presupuesto (desde el Resumen o desde la tarjeta Presupuesto):
 * adapta el `confirm()` si el cliente no tiene correo válido y avisa cuando debe
 * compartirse por WhatsApp o enlace directo.
 */
export function useQuoteSend(order: WorkOrder) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);

  const refreshOrderQueries = async () => {
    await Promise.all([
      invalidateOrderEffects(queryClient, { orderId: order.id }),
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes(order.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customerEmails(order.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customerLink(order.id) }),
    ]);
  };

  const sendQuote = async () => {
    const confirmKey = customerCanReceiveEmail(order.cliente) ? 'quotes.sendConfirm' : 'quotes.sendConfirmNoEmail';
    if (!confirm(t(confirmKey))) return;

    setSending(true);
    try {
      const result = await quotesService.sendQuote(order.id, true);
      if (result.correo === 'sin_correo') {
        showToast('info', t('quotes.sentNoEmail'));
      } else {
        showToast('success', t('quotes.sent'));
      }
      await refreshOrderQueries();
    } catch (err) {
      showToast('error', t('quotes.sendError'), getErrorMessage(err, language));
    } finally {
      setSending(false);
    }
  };

  return { sending, sendQuote, refreshOrderQueries };
}

/**
 * URL del enlace activo del cliente mientras haya un presupuesto enviado sin responder
 * y el cliente no pueda recibir correos. Usa la misma consulta que `CustomerLinkCard`.
 */
export function useQuoteShareUrl(order: WorkOrder, hasOpenQuote: boolean): string | null {
  const shouldShow = hasOpenQuote && !customerCanReceiveEmail(order.cliente);
  const linkQuery = useQuery({
    queryKey: queryKeys.customerLink(order.id),
    queryFn: () => customerPortalService.getActiveLink(order.id),
    enabled: shouldShow,
  });

  if (!shouldShow) return null;
  const link = linkQuery.data ?? null;
  return link ? customerPortalService.portalUrl(link.token) : null;
}
