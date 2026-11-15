import { Wrench } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import TechnicianTaskList from '../../TechnicianTaskList';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import type { SectionStateProps } from '../detailTypes';

interface TechLaborSectionProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  reportRequest: number;
  sectionProps: SectionStateProps;
}

export default function TechLaborSection({
  order,
  detail,
  reportRequest,
  sectionProps,
}: TechLaborSectionProps) {
  const { t } = useLanguage();
  const laborList = order.labor_items || [];

  return (
    <CollapsibleSection
      {...sectionProps}
      title={t('workOrders.tasks')}
      icon={<Wrench size={18} />}
      summary={laborList.length || undefined}
    >
      <TechnicianTaskList items={laborList} currentUserId={detail.userId ?? ''} detail={detail} reportRequest={reportRequest} />
    </CollapsibleSection>
  );
}
