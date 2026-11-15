import { MessageSquarePlus } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import ProgressLog from '../../ProgressLog';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import type { SectionStateProps } from '../detailTypes';

interface ProgressSectionProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  isAdmin: boolean;
  sectionProps: SectionStateProps;
}

export default function ProgressSection({
  order,
  detail,
  isAdmin,
  sectionProps,
}: ProgressSectionProps) {
  const { t } = useLanguage();
  const laborList = order.labor_items || [];
  const progressEntries = order.avances || [];
  // Los avances donde cayeron las fotos de un trabajo adicional reportado (F6).
  const findingEntryIds = new Set((order.hallazgos || []).flatMap((h) => (h.avance_id ? [h.avance_id] : [])));

  return (
    <CollapsibleSection
      {...sectionProps}
      title={t('workOrders.progressLog')}
      icon={<MessageSquarePlus size={18} />}
      summary={progressEntries.length || undefined}
    >
      <ProgressLog
        entries={progressEntries}
        media={order.media || []}
        pending={detail.pendingUploads}
        canEdit={detail.canEdit}
        busy={detail.busy}
        isAdmin={detail.isAdmin}
        userId={detail.userId}
        onAdd={detail.addProgressUpdate}
        onRemove={detail.removeProgressUpdate}
        onToggleVisibility={detail.toggleMediaVisibility}
        onToggleEntryVisibility={detail.toggleProgressVisibility}
        onDeleteMedia={detail.deleteMedia}
        findingEntryIds={findingEntryIds}
        // Un avance puede ser de una tarea (06/10/2026): el técnico elige entre las suyas
        // autorizadas; administración, entre todas las autorizadas.
        tasks={laborList
          .filter((l) => (l.estado ?? 'aprobado') === 'aprobado' && (isAdmin || l.asignado_a === detail.userId))
          .map((l) => ({ id: l.id, descripcion: l.descripcion }))}
        taskNames={Object.fromEntries(laborList.map((l) => [l.id, l.descripcion]))}
      />
    </CollapsibleSection>
  );
}
