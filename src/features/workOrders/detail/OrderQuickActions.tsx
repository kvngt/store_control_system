import { useQuery } from '@tanstack/react-query';
import { Banknote, CheckCircle2, FileSignature, MessageSquarePlus, PackageCheck, PenLine, Plus, Receipt, Tag } from 'lucide-react';
import { nextServiceService } from '../../../services/nextService.service';
import { queryKeys } from '../../../lib/queryClient';
import type { WorkOrder } from '../../../types/database';
import type { WorkOrderDetailApi } from '../useWorkOrderDetail';
import { hasNextService } from '../nextService';
import QuickActions, { type QuickAction } from '../QuickActions';
import { adminNextStep } from '../adminNextStep';
import { buildTechActions } from '../techNextStep';

interface OrderQuickActionsProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  isAdmin: boolean;
  goTo: (tabId: string, sectionId: string) => void;
  onAddWork: () => void;
  onAuthorize: () => void;
  onOpenStickerModal: () => void;
  onReportFinding: () => void;
}

export default function OrderQuickActions({
  order,
  detail,
  isAdmin,
  goTo,
  onAddWork,
  onAuthorize,
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
  const partsList = order.repuestos || [];
  const isFinalizadoPendingReview = order.estatus === 'finalizado' && !order.lista_para_entregar_en && !order.retirada_sin_reparar;
  const showsDeliver = detail.isReadyForPickup && detail.canDeliver;
  const hasToAuthorize = [...laborList, ...partsList].some((l) => l.estado === 'borrador' || l.estado === 'pendiente');

  if (isAdmin) {
    if (detail.isDelivered) return <QuickActions actions={[]} />;

    const nextStep = adminNextStep(order, {
      canSign: detail.canSign,
      canDeliver: detail.canDeliver,
    });

    const candidates: QuickAction[] = [
      ...(isFinalizadoPendingReview
        ? [{ key: 'markReady', icon: CheckCircle2, label: 'workOrders.markReady', onClick: () => void detail.markReadyForPickup() }]
        : []),
      ...(showsDeliver
        ? [{ key: 'deliver', icon: PackageCheck, label: 'quickActions.deliver', onClick: detail.startDelivery }]
        : []),
      { key: 'addWork', icon: Plus, label: 'quickActions.addWork', onClick: onAddWork },
      ...(!order.firma_ruta && detail.canSign
        ? [{ key: 'sign', icon: PenLine, label: 'quickActions.sign', onClick: () => goTo('resumen', 'firma') }]
        : []),
      ...(hasToAuthorize
        ? [{ key: 'authorize', icon: FileSignature, label: 'quickActions.authorize', onClick: onAuthorize }]
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
    ];

    const primaryAction = nextStep ? candidates.find((a) => a.key === nextStep) : undefined;
    const adminActions: QuickAction[] = primaryAction
      ? [
          { ...primaryAction, primary: true },
          ...candidates.filter((a) => a.key !== nextStep),
        ]
      : candidates;

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
