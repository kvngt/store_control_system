import { Package, Paintbrush } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import PartsSummaryCard from '../../PartsSummaryCard';
import PartsTable from '../../PartsTable';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import type { SectionStateProps } from '../detailTypes';

interface PartsSectionProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  isAdmin: boolean;
  sectionProps: SectionStateProps;
}

export default function PartsSection({
  order,
  detail,
  isAdmin,
  sectionProps,
}: PartsSectionProps) {
  const { t } = useLanguage();
  const partsList = order.repuestos || [];

  // Un técnico no ve precios de repuestos: la tabla con montos es solo admin (y la base no se
  // la devuelve). Ve qué piezas lleva la orden, que es lo que necesita para hacer el trabajo.
  return (
    <CollapsibleSection
      {...sectionProps}
      title={t('workOrders.partsDescription')}
      icon={isAdmin ? <Paintbrush size={18} /> : <Package size={18} />}
      summary={(isAdmin ? partsList.length : (order.repuestos_resumen || []).length) || undefined}
    >
      {isAdmin ? (
        <PartsTable
          items={partsList}
          trabajos={order.trabajos}
          canEdit={detail.canEditLines}
          busy={detail.busy}
          onAdd={detail.addPart}
          onUpdate={detail.updatePart}
          onRemove={detail.removePart}
          onSetOrderState={detail.setPartOrderState}
        />
      ) : (
        <PartsSummaryCard items={order.repuestos_resumen || []} />
      )}
    </CollapsibleSection>
  );
}
