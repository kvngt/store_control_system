import { Tag } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { Sede, WorkOrder } from '../../../../types/database';
import NextServiceCard from '../../NextServiceCard';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import type { SectionStateProps } from '../detailTypes';

interface NextServiceSectionProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  orderSede: Sede | null;
  sectionProps: SectionStateProps;
  onOpenStickerModal: (initialData?: { fecha?: string | null; millas?: number | null; nota?: string | null; idioma?: 'es' | 'en' | null } | null) => void;
}

export default function NextServiceSection({
  order,
  detail,
  orderSede,
  sectionProps,
  onOpenStickerModal,
}: NextServiceSectionProps) {
  const { t } = useLanguage();

  return (
    <CollapsibleSection
      {...sectionProps}
      title={t('nextService.sectionTitle')}
      icon={<Tag size={18} />}
    >
      <NextServiceCard
        order={order}
        isAdmin={detail.isAdmin}
        canSuggest={detail.canSuggestNextService}
        sede={orderSede}
        onOpenModal={onOpenStickerModal}
      />
    </CollapsibleSection>
  );
}
