import { useQuery } from '@tanstack/react-query';
import { Banknote, CheckCircle2, MessageSquarePlus, PackageCheck, PenLine, Plus, Receipt, Tag } from 'lucide-react';
import { nextServiceService } from '../../../services/nextService.service';
import { queryKeys } from '../../../lib/queryClient';
import type { WorkOrder } from '../../../types/database';
import type { WorkOrderDetailApi } from '../useWorkOrderDetail';
import { hasNextService } from '../nextService';
import QuickActions, { type QuickAction } from '../QuickActions';
import { buildTechActions } from '../techNextStep';

interface OrderQuickActionsProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  isAdmin: boolean;
  goTo: (tabId: string, sectionId: string) => void;
  onOpenStickerModal: () => void;
  onReportFinding: () => void;
}

export default function OrderQuickActions({
  order,
  detail,
  isAdmin,
  goTo,
  onOpenStickerModal,
  onReportFinding,
}: OrderQuickActionsProps) {
  // La misma consulta que `NextServiceCard`: la acción rápida del sticker lleva al que ya existe.
  const nextServiceQuery = useQuery({
    queryKey: queryKeys.nextService(order.id),
    queryFn: () => nextServiceService.getNextService(order.id),
    enabled: !!order.id,
  });
  const serviceExists = hasNextService(nextServiceQuery.data);

  const laborList = order.labor_items || [];
  const hasLabor = laborList.length > 0;
  const isFinalizadoPendingReview = order.estatus === 'finalizado' && !order.lista_para_entregar_en && !order.retirada_sin_reparar;
  const showsDeliver = detail.isReadyForPickup && detail.canDeliver;

  if (isAdmin) {
    const adminActions: QuickAction[] = !detail.isDelivered
      ? [
          ...(isFinalizadoPendingReview
            ? [{ key: 'markReady', icon: CheckCircle2, label: 'workOrders.markReady', onClick: () => void detail.markReadyForPickup(), primary: true }]
            : []),
          ...(showsDeliver
            ? [{ key: 'deliver', icon: PackageCheck, label: 'quickActions.deliver', onClick: detail.startDelivery, primary: true }]
            : []),
          { key: 'work', icon: Plus, label: 'quickActions.addWork', onClick: () => goTo('trabajos', 'mano_obra'), primary: !hasLabor && !isFinalizadoPendingReview && !showsDeliver },
          ...(!order.firma_ruta && detail.canSign
            ? [{ key: 'sign', icon: PenLine, label: 'quickActions.sign', onClick: () => goTo('resumen', 'firma'), primary: order.estatus === 'recepcion' && hasLabor }]
            : []),
          { key: 'progress', icon: MessageSquarePlus, label: 'quickActions.progress', onClick: () => goTo('fotos', 'avances') },
          {
            key: 'serviceSticker',
            icon: Tag,
            label: 'quickActions.serviceSticker',
            onClick: () => {
              if (serviceExists) {
                goTo('cobro', 'proximo_servicio');
              } else {
                onOpenStickerModal();
              }
            },
          },
          ...(detail.canRegisterAdvance
            ? [{ key: 'advance', icon: Banknote, label: 'quickActions.advance', onClick: detail.startAdvance }]
            : []),
          { key: 'payments', icon: Receipt, label: 'quickActions.payments', onClick: () => goTo('cobro', 'totales') },
        ]
      : [];

    return <QuickActions actions={adminActions} />;
  }

  const techActions: QuickAction[] = detail.canEdit && detail.userId
    ? buildTechActions({
        order,
        laborList,
        userId: detail.userId,
        canEdit: detail.canEdit,
        busy: detail.busy,
        canSuggestNextService: detail.canSuggestNextService,
        changeStatus: detail.changeStatus,
        goTo,
        onReportFinding,
        onSuggestService: () => {
          if (serviceExists) {
            goTo('orden', 'proximo_servicio');
          } else {
            onOpenStickerModal();
          }
        },
      })
    : [];

  return <QuickActions actions={techActions} />;
}
