import { Link2 } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import CustomerLinkCard from '../../CustomerLinkCard';
import type { SectionStateProps } from '../detailTypes';

interface CustomerLinkSectionProps {
  order: WorkOrder;
  statusLabels: Record<string, string>;
  sectionProps: SectionStateProps;
}

export default function CustomerLinkSection({
  order,
  statusLabels,
  sectionProps,
}: CustomerLinkSectionProps) {
  const { t } = useLanguage();

  // El enlace abre precios y totales: solo administración lo comparte.
  return (
    <CollapsibleSection {...sectionProps} title={t('customerLink.title')} icon={<Link2 size={18} />}>
      <CustomerLinkCard order={order} statusLabels={statusLabels} />
    </CollapsibleSection>
  );
}
