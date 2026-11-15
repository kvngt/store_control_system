import { Wrench } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import LaborTable from '../../LaborTable';
import OrderJobsList from '../../OrderJobsList';
import { suggestedTechnicianFor, suggestedTechnicianId } from '../../tasks';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import type { LaborPrefill, SectionStateProps } from '../detailTypes';

interface LaborSectionProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  isAdmin: boolean;
  prefill: LaborPrefill | null;
  sectionProps: SectionStateProps;
}

export default function LaborSection({
  order,
  detail,
  isAdmin,
  prefill,
  sectionProps,
}: LaborSectionProps) {
  const { t } = useLanguage();
  const assignments = order.asignaciones || [];
  const laborList = order.labor_items || [];
  // "Mano de obra" para administración (y el cliente); "Tareas" para el técnico.
  const laborTitle = isAdmin ? t('workOrders.laborDescription') : t('workOrders.tasks');

  return (
    <CollapsibleSection
      {...sectionProps}
      title={laborTitle}
      icon={<Wrench size={18} />}
      summary={laborList.length || undefined}
    >
      {isAdmin && (order.trabajos?.length ?? 0) > 0 && (
        <OrderJobsList orderId={order.id} onRefresh={detail.refresh} />
      )}
      <LaborTable
        title={laborTitle}
        items={laborList}
        orderId={order.id}
        orderSedeId={order.sede_id}
        catalogAllowed={!detail.isDelivered}
        assignments={assignments}
        trabajos={order.trabajos}
        workType={order.tipo_trabajo}
        canEdit={detail.canEditLines}
        busy={detail.busy}
        onAdd={detail.addLabor}
        onUpdate={detail.updateLabor}
        onRemove={detail.removeLabor}
        canComplete={detail.canCompleteLaborItem}
        onToggleComplete={detail.toggleLaborComplete}
        technicians={detail.technicians}
        onAssign={detail.canEditLines ? detail.assignLaborTechnician : undefined}
        onChangeSpecialty={detail.canEditLines ? detail.changeLaborSpecialty : undefined}
        lockedIds={detail.lockedLaborIds}
        paidPools={detail.paidPools}
        prefill={prefill}
        // Un trabajo que agrega administración: el único técnico de la orden, o nadie si hay
        // varios, para que se elija a quién va (06/10/2026).
        suggestedTechnicianId={suggestedTechnicianId(assignments.map((a) => a.usuario_id), detail.technicians)}
        defaultTechnicianFor={(s) => suggestedTechnicianFor(s, assignments, detail.technicians)}
        laborTimes={detail.laborTimes}
        onCorrectTime={detail.correctTime}
        onDeleteTime={detail.deleteTime}
      />
    </CollapsibleSection>
  );
}
