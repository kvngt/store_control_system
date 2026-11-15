import { Receipt } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import { money } from '../../../../lib/money';
import type { WorkOrder } from '../../../../types/database';
import OrderTotalsCard from '../../OrderTotalsCard';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import type { SectionStateProps } from '../detailTypes';
import { useOrderParking } from '../useOrderParking';

interface TotalsSectionProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  isAdmin: boolean;
  sectionProps: SectionStateProps;
}

export default function TotalsSection({
  order,
  detail,
  isAdmin,
  sectionProps,
}: TotalsSectionProps) {
  const { t } = useLanguage();
  const { parkingAmount } = useOrderParking(order.id, order.sede_id, isAdmin);
  const amounts = order.montos ?? null;
  if (!amounts) return null;

  // Totales — solo cuando la base devolvió los montos (admin). Todas las cifras son de la base.
  return (
    <CollapsibleSection
      {...sectionProps}
      title={t('workOrders.totalsTitle')}
      icon={<Receipt size={18} />}
      summary={money(Number(amounts.total_general))}
    >
      <OrderTotalsCard
        order={order}
        amounts={amounts}
        parkingAmount={parkingAmount}
        canDiscount={detail.canEditLines}
        onApplyDiscount={detail.applyDiscount}
        onRegisterAdvance={detail.canRegisterAdvance ? detail.startAdvance : undefined}
      />
    </CollapsibleSection>
  );
}
