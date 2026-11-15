import { Scale } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import OrderBalanceCard from '../../../finance/OrderBalanceCard';
import type { SectionStateProps } from '../detailTypes';

interface BalanceSectionProps {
  order: WorkOrder;
  sectionProps: SectionStateProps;
}

export default function BalanceSection({ order, sectionProps }: BalanceSectionProps) {
  const { t } = useLanguage();

  // Cuánto dejó el trabajo: solo tiene sentido ya entregado, y es de administración.
  return (
    <CollapsibleSection {...sectionProps} title={t('orderBalance.title')} icon={<Scale size={18} />}>
      <OrderBalanceCard orderId={order.id} />
    </CollapsibleSection>
  );
}
