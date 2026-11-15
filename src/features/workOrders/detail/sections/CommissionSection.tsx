import { Wallet } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import CommissionEstimateCard from '../../CommissionEstimateCard';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import type { SectionStateProps } from '../detailTypes';

interface CommissionSectionProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  isAdmin: boolean;
  sectionProps: SectionStateProps;
}

export default function CommissionSection({
  order,
  detail,
  isAdmin,
  sectionProps,
}: CommissionSectionProps) {
  const { t } = useLanguage();
  if (!detail.commissionEstimate) return null;

  const laborList = order.labor_items || [];

  return (
    <CollapsibleSection
      {...sectionProps}
      title={isAdmin ? t('commission.splitTitle') : t('workOrders.estimatedCommission')}
      icon={<Wallet size={18} />}
    >
      <CommissionEstimateCard
        estimate={detail.commissionEstimate}
        isAdmin={isAdmin}
        userId={detail.userId}
        names={{
          // Quien tiene una tarea ya está entre los asignados (la base lo agrega); el nombre
          // embebido en la línea cubre al que no, por si acaso.
          ...Object.fromEntries(laborList.flatMap((l) => (l.tecnico ? [[l.tecnico.id, l.tecnico.nombre_completo]] : []))),
          ...Object.fromEntries((order.asignaciones || []).map((a) => [a.usuario_id, a.usuario?.nombre_completo ?? '—'])),
        }}
        onApproveCommission={detail.approveCommission}
      />
    </CollapsibleSection>
  );
}
