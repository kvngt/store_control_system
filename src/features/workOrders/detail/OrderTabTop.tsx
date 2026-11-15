import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../../context/language.context';
import type { WorkOrder } from '../../../types/database';
import AuthorizationPanel from '../AuthorizationPanel';
import FindingsCard from '../FindingsCard';
import PendingWorkNotice from '../PendingWorkNotice';
import TechOrderStatus from '../TechOrderStatus';
import type { findingsToReview } from '../findings';
import { suggestedTechnicianId } from '../tasks';
import type { WorkOrderDetailApi } from '../useWorkOrderDetail';
import type { LaborPrefill } from './detailTypes';
import OrderQuickActions from './OrderQuickActions';

interface OrderTabTopProps {
  tabId: string;
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  statusLabels: Record<string, string>;
  isAdmin: boolean;
  isMobile: boolean;
  findings: ReturnType<typeof findingsToReview>;
  unassignedCount: number;
  techWaitsAuthorization: boolean;
  goTo: (tabId: string, sectionId: string) => void;
  onOpenSection: (sectionId: string) => void;
  onSelectTab: (tabId: string) => void;
  onOpenStickerModal: () => void;
  onSetPrefill: (prefill: LaborPrefill) => void;
  onReportFinding: () => void;
}

export default function OrderTabTop({
  tabId,
  order,
  detail,
  statusLabels,
  isAdmin,
  isMobile,
  findings,
  unassignedCount,
  techWaitsAuthorization,
  goTo,
  onOpenSection,
  onSelectTab,
  onOpenStickerModal,
  onSetPrefill,
  onReportFinding,
}: OrderTabTopProps) {
  const { t } = useLanguage();
  const assignments = order.asignaciones || [];
  const laborList = order.labor_items || [];

  // F6: lo que reportó el taller y administración tiene que decidir. Arriba de Resumen y de
  // Trabajos; en el teléfono las dos pestañas están apiladas, así que va una sola vez.
  const findingsSection = findings.length > 0 && (
    <FindingsCard
      findings={findings}
      names={Object.fromEntries(assignments.map((a) => [a.usuario_id, a.usuario?.nombre_completo ?? '—']))}
      mediaCount={(order.media || []).reduce<Record<string, number>>((acc, m) => {
        if (m.avance_id) acc[m.avance_id] = (acc[m.avance_id] ?? 0) + 1;
        return acc;
      }, {})}
      busy={detail.busy}
      onQuote={async (h) => {
        const text = await detail.quoteFinding(h.id);
        if (text == null) return;
        // Va a quien lo reportó; si no puede recibirla, al único técnico de la orden (06/10/2026).
        onSetPrefill({
          text,
          nonce: Date.now(),
          technicianId: suggestedTechnicianId(assignments.map((a) => a.usuario_id), detail.technicians, h.reportado_por),
        });
        // La tarea precargada está en Mano de obra: se abre para que se vea.
        onOpenSection('mano_obra');
        onSelectTab('trabajos');
      }}
      onDiscard={(h, enReporte, texto) => detail.discardFinding(h.id, enReporte, texto)}
    />
  );

  // Aviso de tareas sin técnico, arriba del Resumen: es dinero que no le llega a nadie.
  const unassignedNotice = isAdmin && unassignedCount > 0 && (
    <div className="alert-warn order-notice" role="note">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>{t('tasks.unassignedNotice').replace('{n}', String(unassignedCount))}</span>
      {!isMobile && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            onOpenSection('mano_obra');
            onSelectTab('trabajos');
          }}
        >
          {t('tasks.goToWork')}
        </button>
      )}
    </div>
  );

  // Los avisos van arriba de las secciones y no se pliegan: son lo que hay que atender.
  if (tabId === 'resumen') {
    return (
      <>
        <OrderQuickActions
          order={order}
          detail={detail}
          isAdmin={isAdmin}
          goTo={goTo}
          onOpenStickerModal={onOpenStickerModal}
          onReportFinding={onReportFinding}
        />
        {isAdmin && <AuthorizationPanel order={order} onOpenQuote={() => goTo('trabajos', 'presupuesto')} />}
        {findingsSection}
        {unassignedNotice}
        {/* Lo que el cliente dejó pendiente en otras visitas: el momento de ofrecerlo es ahora. */}
        {isAdmin && !detail.isDelivered && <PendingWorkNotice vehicleId={order.vehiculo_id} excludeOrderId={order.id} />}
      </>
    );
  }

  if (tabId === 'trabajos') {
    return !isMobile ? <>{findingsSection}</> : null;
  }

  // El técnico ve primero en qué va la orden y qué de lo suyo está autorizado (06/10/2026).
  if (tabId === 'tareas' && !isAdmin) {
    return (
      <>
        <OrderQuickActions
          order={order}
          detail={detail}
          isAdmin={isAdmin}
          goTo={goTo}
          onOpenStickerModal={onOpenStickerModal}
          onReportFinding={onReportFinding}
        />
        <TechOrderStatus
          order={order}
          myTasks={laborList.filter((l) => l.asignado_a === detail.userId)}
          statusLabel={statusLabels[order.estatus] ?? order.estatus}
          waitingAuthorization={techWaitsAuthorization}
        />
      </>
    );
  }

  return null;
}
