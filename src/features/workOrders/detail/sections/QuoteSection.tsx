import { FileSignature } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import QuoteCard from '../../QuoteCard';
import type { SectionStateProps } from '../detailTypes';

interface QuoteSectionProps {
  order: WorkOrder;
  sectionProps: SectionStateProps;
}

export default function QuoteSection({ order, sectionProps }: QuoteSectionProps) {
  const { t } = useLanguage();

  // Presupuesto: lo que falta autorizar y lo que espera al cliente. Solo admin.
  return (
    <CollapsibleSection {...sectionProps} title={t('quotes.title')} icon={<FileSignature size={18} />}>
      <QuoteCard order={order} />
    </CollapsibleSection>
  );
}
