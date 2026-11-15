import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { DamageMark } from '../../../../lib/vehicleDiagram';
import type { WorkOrder } from '../../../../types/database';
import PointInspection from '../../../inspection/PointInspection';
import MediaCaptureBar from '../../../media/MediaCaptureBar';
import MediaGallery from '../../../media/MediaGallery';
import DamageDiagramEditor from '../../DamageDiagramEditor';
import { suggestedTechnicianId } from '../../tasks';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import type { LaborPrefill, SectionStateProps } from '../detailTypes';

interface InspectionSectionProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  sectionProps: SectionStateProps;
  onQuotePointPrefill: (prefill: LaborPrefill) => void;
}

export default function InspectionSection({
  order,
  detail,
  sectionProps,
  onQuotePointPrefill,
}: InspectionSectionProps) {
  const { t } = useLanguage();
  // Las marcas de daños que el admin está poniendo y todavía no guarda. Sin este borrador el
  // dibujo no respondía: el editor no guarda estado propio y avisa cada cambio por onChange
  // (revisión del 30/10/2026). Se descarta al cambiar de orden o al guardar bien.
  const [damageDraft, setDamageDraft] = useState<DamageMark[] | null>(null);
  useEffect(() => setDamageDraft(null), [order.id]);

  const assignments = order.asignaciones || [];
  const receptionMedia = (order.media || []).filter((m) => m.origen === 'recepcion');
  const receptionPending = detail.pendingUploads.filter((p) => p.origen === 'recepcion');

  const saveDamageMarks = async (marks: DamageMark[]) => {
    await detail.updateDamageMarks(marks);
    setDamageDraft(null);
  };

  return (
    <CollapsibleSection
      {...sectionProps}
      title={t('workOrders.inspection360')}
      icon={<Camera size={18} />}
      summary={receptionMedia.length || undefined}
    >
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
          <Camera size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
          {t('workOrders.inspection360')}
        </h3>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
          {order.inspeccion_360_notas}
        </p>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <DamageDiagramEditor
            marks={damageDraft ?? order.marcas_danos ?? []}
            editable={detail.isAdmin && !order.firma_ruta}
            isLocked={Boolean(order.firma_ruta)}
            isSaving={detail.savingDamageMarks}
            onChange={setDamageDraft}
            onSave={(marks) => saveDamageMarks(marks).catch(() => undefined)}
          />
        </div>

        {/* La recepción es lo que el cliente firma: nace visible para él, salvo la nota de
            voz, que es el taller hablando y la publica un admin (20261010000003). Aquí
            también se puede sumar un video de recorrido o una nota de voz
            sobre el estado en que llegó el vehículo. */}
        <MediaGallery
          media={receptionMedia}
          pending={receptionPending}
          canManage={detail.isAdmin}
          canDeleteOwn={detail.canEdit}
          currentUserId={detail.userId}
          onToggleVisibility={detail.toggleMediaVisibility}
          onDelete={detail.deleteMedia}
          emptyLabel={t('media.empty')}
        />
        {detail.canEdit && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <MediaCaptureBar onAdd={detail.addReceptionMedia} disabled={detail.busy} />
          </div>
        )}

        <PointInspection
          orderId={order.id}
          orderSedeId={order.sede_id}
          isAdmin={detail.isAdmin}
          canEdit={detail.canEdit}
          isDelivered={detail.isDelivered}
          media={order.media || []}
          pendingUploads={detail.pendingUploads}
          technicians={detail.technicians}
          assignments={assignments}
          onQuotePoint={(point) => {
            const text = point.nota ? `${point.nombre} — ${point.nota}` : point.nombre;
            onQuotePointPrefill({
              text,
              nonce: Date.now(),
              technicianId: suggestedTechnicianId(assignments.map((a) => a.usuario_id), detail.technicians),
            });
          }}
          onRefreshOrder={detail.refresh}
          onAddMedia={(puntoId, items) => {
            detail.enqueueMedia(items, {
              origen: 'inspeccion',
              inspeccionPuntoId: puntoId,
            });
          }}
        />
      </div>
    </CollapsibleSection>
  );
}
