import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../../context/language.context';
import { useToast } from '../../../context/toast.context';
import { nextServiceService } from '../../../services/nextService.service';
import { queryKeys } from '../../../lib/queryClient';
import { getErrorMessage } from '../../../lib/errors';
import ChoiceDialog from '../../../components/ChoiceDialog';
import type { NextServiceInput, Sede, WorkOrder } from '../../../types/database';
import type { WorkOrderDetailApi } from '../useWorkOrderDetail';
import { isApproved } from '../lineState';
import { openStickerWindow } from '../nextService';
import { noteForSticker } from '../stickerNote';
import AdvancePaymentModal from '../AdvancePaymentModal';
import DeliveryModal from '../DeliveryModal';
import OrderInsuranceModal from '../OrderInsuranceModal';
import PublishProgressModal from '../PublishProgressModal';
import ReadyNotifyModal from '../ReadyNotifyModal';
import ServiceStickerModal from '../ServiceStickerModal';
import ShareReportModal from '../ShareReportModal';
import WithdrawalModal, { type WithdrawalLine } from '../WithdrawalModal';
import type { StickerModalState } from './detailTypes';

interface OrderDialogsProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  isAdmin: boolean;
  orderSede: Sede | null;
  pdfLanguage: 'es' | 'en';
  showInsuranceModal: boolean;
  onCloseInsuranceModal: () => void;
  stickerModal: StickerModalState;
  onCloseStickerModal: () => void;
  onReviewTasks: () => void;
}

export default function OrderDialogs({
  order,
  detail,
  isAdmin,
  orderSede,
  pdfLanguage,
  showInsuranceModal,
  onCloseInsuranceModal,
  stickerModal,
  onCloseStickerModal,
  onReviewTasks,
}: OrderDialogsProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const laborList = order.labor_items || [];
  const partsList = order.repuestos || [];
  // Lo autorizado de la orden: lo que se puede marcar como hecho al retirarla sin reparar.
  const withdrawalLines: WithdrawalLine[] = [
    ...laborList.filter(isApproved).map((l): WithdrawalLine => ({
      id: l.id, tipo: 'mano_obra', descripcion: l.descripcion, monto: Number(l.costo), hecho: !!l.completado_en,
    })),
    ...partsList.filter(isApproved).map((p): WithdrawalLine => ({
      id: p.id, tipo: 'repuesto', descripcion: p.descripcion, monto: Number(p.subtotal),
    })),
  ];

  const handleSaveNextService = async (data: NextServiceInput, lang: 'es' | 'en') => {
    await nextServiceService.program(order.id, data, lang);
    await queryClient.invalidateQueries({ queryKey: queryKeys.nextService(order.id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(order.id) });
    showToast('success', t('nextService.programmedSuccess'));
  };

  const handleSaveAndPrintNextService = async (data: NextServiceInput, lang: 'es' | 'en') => {
    // La ventana se abre aquí, todavía dentro del clic: después del primer `await` el iPhone la
    // bloquea. El PDF llega a ella cuando termina de guardar.
    const printWindow = openStickerWindow();
    let row;
    try {
      row = await nextServiceService.program(order.id, data, lang);
    } catch (err) {
      printWindow?.close();
      throw err;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.nextService(order.id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(order.id) });
    showToast('success', t('nextService.programmedSuccess'));
    if (!row?.token) {
      printWindow?.close();
      return;
    }
    // Lo que falle de aquí en adelante (el import del PDF, el PDF mismo) ya no es un error de guardar:
    // el servicio quedó guardado. Se cierra la ventana en blanco y se avisa con un aviso aparte; si
    // se dejara subir, el diálogo diría que no se guardó y la persona lo guardaría otra vez.
    try {
      const { nota: noteForPdf, fallo } = await noteForSticker(row.nota, lang);
      if (fallo) {
        showToast('error', t('nextService.noteNotTranslated'));
      }
      const { printServiceSticker } = await import('../../../lib/serviceStickerPdf');
      await printServiceSticker(
        {
          taller: {
            nombre: orderSede?.nombre || '',
            telefono: orderSede?.telefono || null,
          },
          vehiculo: {
            anio: order.vehiculo?.anio || 0,
            marca: order.vehiculo?.marca || '',
            modelo: order.vehiculo?.modelo || '',
            placa: order.vehiculo?.placa || '',
          },
          servicio: {
            fecha: row.fecha,
            millas: row.millas,
            nota: noteForPdf,
            token: row.token,
          },
          numero_orden: order.numero_orden,
        },
        lang,
        printWindow
      );
    } catch (err) {
      printWindow?.close();
      showToast('error', t('nextService.printAfterSaveError'), getErrorMessage(err, language));
    }
  };

  const handleSuggestNextService = async (data: NextServiceInput) => {
    await nextServiceService.suggest(order.id, data);
    await queryClient.invalidateQueries({ queryKey: queryKeys.nextService(order.id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(order.id) });
    showToast('success', t('nextService.suggestedSuccess'));
  };

  return (
    <>
      {detail.delivering && (
        <DeliveryModal
          order={order}
          onCancel={detail.cancelDelivery}
          onDelivered={detail.finishDelivery}
        />
      )}

      {detail.withdrawing && (
        <WithdrawalModal
          order={order}
          lines={withdrawalLines}
          onCancel={detail.cancelWithdrawal}
          onDone={detail.finishWithdrawal}
        />
      )}

      {detail.advancing && (
        <AdvancePaymentModal
          order={order}
          onCancel={detail.cancelAdvance}
          onDone={detail.finishAdvance}
        />
      )}

      {detail.publishingProgress && (
        <PublishProgressModal
          entry={detail.publishingProgress}
          saving={detail.busy}
          onCancel={detail.cancelPublishProgress}
          onConfirm={detail.confirmPublishProgress}
        />
      )}

      {detail.share && (
        <ShareReportModal
          order={order}
          link={detail.share.link}
          message={detail.share.message}
          downloading={detail.generatingPdf}
          onDownload={() => void detail.generatePdf(pdfLanguage)}
          onClose={detail.closeShare}
        />
      )}

      {detail.readyNotifyOpen && (
        <ReadyNotifyModal
          order={order}
          onClose={detail.closeReadyNotify}
        />
      )}

      {showInsuranceModal && (
        <OrderInsuranceModal
          order={order}
          onSave={detail.updateInsurance}
          onClose={onCloseInsuranceModal}
        />
      )}

      {stickerModal.open && (
        <ServiceStickerModal
          mode={isAdmin ? 'admin' : 'tecnico'}
          order={order}
          initialData={stickerModal.initialData}
          onSave={isAdmin ? handleSaveNextService : undefined}
          onSaveAndPrint={isAdmin ? handleSaveAndPrintNextService : undefined}
          onSuggest={!isAdmin ? handleSuggestNextService : undefined}
          onClose={onCloseStickerModal}
        />
      )}

      {detail.finishConfirmCount != null && detail.finishConfirmCount > 0 && (
        <ChoiceDialog
          title={
            detail.finishConfirmCount === 1
              ? t('workOrders.finishUnmarkedTitleOne')
              : t('workOrders.finishUnmarkedTitleMany').replace('{n}', String(detail.finishConfirmCount))
          }
          body={t('workOrders.finishUnmarkedBody')}
          onDismiss={detail.cancelFinishConfirm}
          actions={[
            {
              label: t('workOrders.reviewTasks'),
              variant: 'primary',
              onClick: () => {
                detail.cancelFinishConfirm();
                onReviewTasks();
              },
            },
            {
              label: t('workOrders.finishAnyway'),
              variant: 'secondary',
              onClick: () => {
                void detail.confirmFinish();
              },
            },
          ]}
        />
      )}
    </>
  );
}
