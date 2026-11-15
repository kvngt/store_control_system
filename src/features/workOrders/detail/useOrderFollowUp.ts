import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../../context/language.context';
import { useToast } from '../../../context/toast.context';
import { customerPortalService } from '../../../services/customerPortal.service';
import { mediaService } from '../../../services/media.service';
import { parkingService } from '../../../services/parking.service';
import { reportsService } from '../../../services/reports.service';
import { workOrdersService } from '../../../services/workOrders.service';
import { queryKeys } from '../../../lib/queryClient';
import { getErrorMessage } from '../../../lib/errors';
import { reportAssetPaths } from '../../../lib/reportMedia';
import type { WorkOrder } from '../../../types/database';
import type { OrderDetailSharedContext, ShareReportState } from './detailTypes';

interface UseOrderFollowUpOptions
  extends Pick<OrderDetailSharedContext, 'order' | 'orderSede'> {
  canSendReport: boolean;
}

const emptyTranslations = (): Record<string, string> => ({});

export function useOrderFollowUp({
  order,
  orderSede,
  canSendReport,
}: UseOrderFollowUpOptions) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [preparingShare, setPreparingShare] = useState(false);
  // The signed link + message for the report the user just generated. Non-null
  // is what opens the share dialog.
  const [share, setShare] = useState<ShareReportState | null>(null);

  /**
   * URLs firmadas para lo que el PDF incrusta: las fotos visibles para el cliente
   * (en miniatura; ni videos ni audio, que un PDF no reproduce) y la firma. Todo
   * vive en un bucket privado, así que el generador no puede leerlo por URL pública.
   */
  const signPdfAssets = async (target: WorkOrder) => mediaService.signUrls(reportAssetPaths(target), 10 * 60);

  // En español o en inglés, lo elige administración al descargarlo (decisión del 05/10/2026).
  const generatePdf = async (pdfLanguage: 'es' | 'en' = 'es') => {
    if (!order || !canSendReport) return;
    setGeneratingPdf(true);
    try {
      // ~400 kB of jsPDF, fetched only when someone prints.
      const [{ generateWorkOrderPdf }, urls, link, balance, translations, parking] = await Promise.all([
        import('../../../lib/workOrderPdf'),
        signPdfAssets(order),
        // Si la orden ya tiene enlace, el PDF lo lleva: la versión con videos.
        customerPortalService.getActiveLink(order.id).catch(() => null),
        // Lo recibido y el saldo, como los cuenta la base. Si falla, el PDF usa lo de antes.
        workOrdersService.getBalance(order.id).catch(() => null),
        // En inglés, lo que el taller escribió sale con su traducción si ya la hay.
        pdfLanguage === 'en'
          ? workOrdersService.getOrderTranslations(order.id).catch(emptyTranslations)
          : Promise.resolve(emptyTranslations()),
        // Parqueo acumulado si corresponde
        parkingService.getOrderParking(order.id).catch(() => null),
      ]);
      await generateWorkOrderPdf(order, orderSede, urls, {
        portalUrl: link ? customerPortalService.portalUrl(link.token) : undefined,
        language: pdfLanguage,
        translations,
        balance: balance ? { cobrado: balance.cobrado, saldo: balance.saldo } : null,
        parking: parking && Number(parking.monto) > 0 ? { monto: Number(parking.monto), dias: parking.dias_cobrados } : null,
      });
    } catch (err) {
      showToast('error', t('workOrders.pdfError'), getErrorMessage(err, language));
    } finally {
      setGeneratingPdf(false);
    }
  };

  /**
   * Abre "Enviar reporte" con el enlace web del cliente (fase 6).
   *
   * Ya no genera ni sube un PDF: el reporte es la página del cliente, que muestra
   * los videos y se mantiene al día sola. Si la orden no tenía enlace (sin firma
   * todavía), se crea aquí.
   */
  const shareReport = async () => {
    if (!order || !canSendReport) return;
    setPreparingShare(true);
    try {
      const link = await customerPortalService.createLink(order.id);
      const url = customerPortalService.portalUrl(link.token);
      setShare({ link: url, message: reportsService.buildMessage(order, url, orderSede?.nombre) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerLink(order.id) });
    } catch (err) {
      showToast('error', t('workOrders.shareReportError'), getErrorMessage(err, language));
    } finally {
      setPreparingShare(false);
    }
  };

  const closeShare = useCallback(() => setShare(null), []);

  return {
    generatingPdf,
    generatePdf,
    preparingShare,
    share,
    shareReport,
    closeShare,
  };
}
