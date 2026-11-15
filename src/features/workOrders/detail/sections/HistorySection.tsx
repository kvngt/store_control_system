import { History } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import OrderHistory from '../../OrderHistory';
import type { SectionStateProps } from '../detailTypes';

interface HistorySectionProps {
  order: WorkOrder;
  statusLabels: Record<string, string>;
  sectionProps: SectionStateProps;
}

export default function HistorySection({
  order,
  statusLabels,
  sectionProps,
}: HistorySectionProps) {
  const { t } = useLanguage();

  // El historial es de administración. Se monta solo cuando se abre (ver `visited`).
  return (
    <CollapsibleSection {...sectionProps} title={t('history.title')} icon={<History size={18} />}>
      <OrderHistory orderId={order.id} statusLabels={statusLabels} />
    </CollapsibleSection>
  );
}
