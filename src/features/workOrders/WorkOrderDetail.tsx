import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  DollarSign,
  FileDown,
  FileSignature,
  Fuel,
  Link2,
  MessageSquarePlus,
  Package,
  Send,
  Paintbrush,
  PenLine,
  Plus,
  Receipt,
  Scale,
  User,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import MobileSection from '../../components/MobileSection';
import { useAuth } from '../../context/auth.context';
import { useLanguage } from '../../context/language.context';
import { useUnsavedChanges } from '../../context/unsavedChanges.context';
import type { OrderStatus, UserProfile } from '../../types/database';
import LaborTable from './LaborTable';
import PartsTable from './PartsTable';
import PartsSummaryCard from './PartsSummaryCard';
import CommissionEstimateCard from './CommissionEstimateCard';
import ProgressLog from './ProgressLog';
import ShareReportModal from './ShareReportModal';
import AuthorizationReasonModal from './AuthorizationReasonModal';
import DeliveryModal from './DeliveryModal';
import OrderBalanceCard from '../finance/OrderBalanceCard';
import PublishProgressModal from './PublishProgressModal';
import CustomerLinkCard from './CustomerLinkCard';
import QuoteCard from './QuoteCard';
import { isApproved } from './lineState';
import SignatureCard from './SignatureCard';
import MediaCaptureBar from '../media/MediaCaptureBar';
import MediaGallery from '../media/MediaGallery';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';
import { money } from '../../lib/money';

interface WorkOrderDetailProps {
  detail: WorkOrderDetailApi;
  /** Technicians of the sede, for the assignment picker. */
  operators: UserProfile[];
  statusLabels: Record<string, string>;
  onBack: () => void;
}

/**
 * The single-order screen: header and status, vehicle and intake, signature,
 * labor, parts, totals, assignments and the progress log.
 *
 * It composes the cards and holds only what is genuinely local to the layout —
 * the lightbox and the assignment picker. Every mutation belongs to
 * `useWorkOrderDetail`, and each card owns its own row drafts, so this file
 * stays a layout and not a second god component.
 */
export default function WorkOrderDetail({ detail, operators, statusLabels, onBack }: WorkOrderDetailProps) {
  const { t } = useLanguage();
  const { confirmNavigation } = useUnsavedChanges();
  const { user } = useAuth();
  const [addingOperatorId, setAddingOperatorId] = useState('');

  const order = detail.order;
  if (!order) return null;

  const isAdmin = user?.rol === 'admin';
  const customer = order.cliente;
  const vehicle = order.vehiculo;
  const assignments = order.asignaciones || [];
  const laborList = order.labor_items || [];
  const partsList = order.repuestos || [];
  // Solo lo autorizado por el cliente se cobra (igual que los totales de la base).
  const totalLabor = laborList.filter(isApproved).reduce((sum, l) => sum + l.costo, 0);
  const totalParts = partsList.filter(isApproved).reduce((sum, p) => sum + p.subtotal, 0);
  const receptionMedia = (order.media || []).filter((m) => m.origen === 'recepcion');
  const receptionPending = detail.pendingUploads.filter((p) => p.origen === 'recepcion');
  // Null para mecánicos y pintores: `orden_montos` es solo admin.
  const amounts = order.montos ?? null;
  // Con la casilla vacía (borrada para escribir otro número) el control muestra lo guardado.
  const draftProgress = parseInt(detail.progressDraft, 10);
  const sliderProgress = Number.isNaN(draftProgress) ? order.porcentaje_avance : draftProgress;

  const addOperator = async () => {
    const op = operators.find((o) => o.id === addingOperatorId);
    if (!op) return;
    await detail.addAssignment(op);
    setAddingOperatorId('');
  };

  // Volver es la salida más usada del detalle, y descartaba un avance a medias
  // sin preguntar. Pasa por los mismos guardias que la navegación del menú.
  const handleBack = () => {
    if (confirmNavigation()) onBack();
  };

  return (
    <div className="animate-fade-in">
      <button className="btn btn-ghost" onClick={handleBack} style={{ marginBottom: 'var(--space-4)' }}>
        <ChevronLeft size={18} /> {t('common.back')}
      </button>

      {detail.error && <div className="alert-error">{detail.error}</div>}
      {detail.loading && <div className="loading-state"><div className="spinner" /></div>}
      {order.estatus === 'espera_autorizacion' && (
        <div className="alert-warn">
          <strong>{t('workOrders.authorizationBanner')}</strong>
          {order.motivo_autorizacion ? ` ${order.motivo_autorizacion}` : null}
        </div>
      )}
      {!detail.canEdit && (
        <div className="alert-info">
          {detail.isDelivered ? t('workOrders.deliveredNotice') : t('workOrders.readOnlyNotice')}
        </div>
      )}

      {/* Order Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {order.numero_orden}
            <span className={`badge badge-${order.estatus}`}>{statusLabels[order.estatus]}</span>
            <span className={`badge badge-${order.tipo_trabajo}`}>{order.tipo_trabajo}</span>
            {[...laborList, ...partsList, ...(order.repuestos_resumen || [])].some((l) => l.estado === 'pendiente') && (
              <span className="badge badge-waiting-auth">{t('quotes.waitingBadge')}</span>
            )}
            {detail.isArchived && <span className="badge badge-archived">{t('workOrders.archivedBadge')}</span>}
            {/* Solo administración: el reporte lleva precios y totales, y el
                cliente pidió que los técnicos no lo manden desde su perfil. */}
            {detail.canSendReport && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={detail.generatePdf}
                  disabled={detail.generatingPdf}
                  title={t('workOrders.generatePdf')}
                >
                  <FileDown size={14} /> {detail.generatingPdf ? t('common.loading') : t('workOrders.generatePdf')}
                </button>
                {/* Enviar reporte: comparte el enlace web del cliente (correo desde el
                    sistema o WhatsApp). El PDF de al lado es solo para imprimir. */}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={detail.shareReport}
                  disabled={detail.preparingShare}
                  title={t('workOrders.shareReport')}
                >
                  <Send size={14} /> {detail.preparingShare ? t('common.loading') : t('workOrders.shareReport')}
                </button>
              </>
            )}
            {detail.canArchive && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void detail.toggleArchived()}
                disabled={detail.busy}
                id="order-archive-toggle"
              >
                {detail.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}{' '}
                {detail.isArchived ? t('workOrders.unarchive') : t('workOrders.archive')}
              </button>
            )}
          </h1>
          <p className="page-subtitle">{customer?.nombre} — {vehicle?.anio} {vehicle?.marca} {vehicle?.modelo}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap', width: '100%', maxWidth: 460 }}>
          {/* `key` con `statusEpoch`: al cancelar el confirm no cambia ningún
              estado, así que React no re-renderiza y el <select> se quedaba
              mostrando la opción elegida sobre una orden que no se movió.
              Remontarlo es lo único que lo devuelve al valor real. */}
          <select
            key={detail.statusEpoch}
            className="form-input form-select"
            value={order.estatus}
            onChange={(e) => detail.changeStatus(e.target.value as OrderStatus)}
            disabled={!detail.canEdit}
            style={{ flex: '1 1 160px' }}
          >
            {Object.keys(statusLabels)
              // Entregar asienta el ingreso y devenga las comisiones: no es un
              // paso del taller. Si la orden ya está entregada la opción se deja
              // visible, o el <select> no podría mostrar su propio valor.
              .filter((s) => s !== 'entregado' || detail.canDeliver || order.estatus === 'entregado')
              // Devolver una orden a Recepción es de administración: la base responde 42501.
              // Se filtra igual que Entregado, para no ofrecer algo que siempre falla.
              .filter((s) => s !== 'recepcion' || detail.isAdmin || order.estatus === 'recepcion')
              .map((s) => (
                <option key={s} value={s}>{statusLabels[s]}</option>
              ))}
          </select>
          <div style={{ textAlign: 'right', flex: '1 1 180px' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              {t('workOrders.progress')}
              {!detail.canEditProgress && (
                <span style={{ marginLeft: 6, color: 'var(--color-text-tertiary)' }}>({t('workOrders.progressLocked')})</span>
              )}
            </div>
            {/* Arrastrar solo mueve el borrador; se guarda al soltar (puntero o tecla) o al
                salir del control. Guardar en cada paso mandaba una ráfaga de UPDATE que
                llegaba a la base en cualquier orden (ver `commitProgress`). */}
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={sliderProgress}
              onChange={(e) => detail.setProgressDraft(e.target.value)}
              onPointerUp={detail.commitProgress}
              onKeyUp={detail.commitProgress}
              onBlur={detail.commitProgress}
              disabled={!detail.canEditProgress}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <input
                className="form-input"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={detail.progressDraft}
                disabled={!detail.canEditProgress}
                style={{ width: 70, textAlign: 'right', padding: 'var(--space-1) var(--space-2)', color: detail.isComplete ? 'var(--color-success)' : undefined, fontWeight: detail.isComplete ? 700 : undefined }}
                onChange={(e) => detail.setProgressDraft(e.target.value)}
                onBlur={detail.commitProgress}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
              />
              <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: detail.isComplete ? 'var(--color-success)' : 'var(--color-primary-light)' }}>%</span>
            </div>
          </div>
        </div>
      </div>

      {/* En el teléfono cada tarjeta va en una `MobileSection` plegable: la orden
          apila una docena y había que recorrerlas todas. En escritorio no cambia nada. */}
      <div className="responsive-grid-2">
        {/* Vehicle Info */}
        <MobileSection title={t('workOrders.vehicleServiceRepair')} icon={<Car size={18} />} summary={vehicle?.placa || undefined}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
            <Car size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('workOrders.vehicleServiceRepair')}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {[
              [t('vehicles.brand'), `${vehicle?.marca} ${vehicle?.modelo}`],
              [t('vehicles.year'), vehicle?.anio],
              [t('vehicles.vin'), vehicle?.vin],
              [t('vehicles.plate'), vehicle?.placa],
              [t('vehicles.color'), vehicle?.color],
              [t('workOrders.milesIn'), order.millas_ingreso.toLocaleString()],
            ].map(([label, value], i) => (
              <div key={i} style={{ padding: 'var(--space-2) 0' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontWeight: 500 }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Fuel size={16} style={{ color: 'var(--color-warning)' }} />
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{t('workOrders.fuelLevel')}</div>
                <div style={{ fontWeight: 600 }}>{order.nivel_gasolina}</div>
              </div>
            </div>
            {amounts && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <DollarSign size={16} style={{ color: 'var(--color-success)' }} />
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{t('workOrders.deposit')}</div>
                  <div style={{ fontWeight: 600 }}>{money(amounts.deposito_inicial)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        </MobileSection>

        {/* Inspection 360 */}
        <MobileSection title={t('workOrders.inspection360')} icon={<Camera size={18} />} summary={receptionMedia.length || undefined}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
            <Camera size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('workOrders.inspection360')}
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
            {order.inspeccion_360_notas}
          </p>

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
        </div>
        </MobileSection>

        <MobileSection
          title={t('workOrders.customerSignature')}
          icon={<PenLine size={18} />}
          summary={order.firma_ruta ? <CheckCircle2 size={16} style={{ color: 'var(--color-success)', verticalAlign: 'middle' }} /> : undefined}
        >
        <SignatureCard
          signaturePath={order.firma_ruta}
          signedAt={order.firma_fecha}
          customerName={customer?.nombre}
          canSign={detail.canSign}
          canResign={detail.canResign}
          saving={detail.savingSignature}
          onSave={detail.saveSignature}
        />
        </MobileSection>

        <MobileSection title={t('workOrders.laborDescription')} icon={<Wrench size={18} />} summary={laborList.length || undefined}>
        <LaborTable
          items={laborList}
          specialties={order.tipo_trabajo === 'combinado'}
          canEdit={detail.canEditLines}
          busy={detail.busy}
          onAdd={detail.addLabor}
          onUpdate={detail.updateLabor}
          onRemove={detail.removeLabor}
          canComplete={detail.canCompleteLabor}
          onToggleComplete={detail.toggleLaborComplete}
        />
        </MobileSection>

        {/* Un técnico no ve precios de repuestos: la tabla con montos es solo
            admin (y la base no se la devuelve). Ve qué piezas lleva la orden,
            que es lo que necesita para hacer el trabajo. */}
        <MobileSection
          title={t('workOrders.partsDescription')}
          icon={isAdmin ? <Paintbrush size={18} /> : <Package size={18} />}
          summary={(isAdmin ? partsList.length : (order.repuestos_resumen || []).length) || undefined}
        >
        {isAdmin ? (
          <PartsTable
            items={partsList}
            canEdit={detail.canEditLines}
            busy={detail.busy}
            onAdd={detail.addPart}
            onUpdate={detail.updatePart}
            onRemove={detail.removePart}
          />
        ) : (
          <PartsSummaryCard items={order.repuestos_resumen || []} />
        )}
        </MobileSection>
      </div>

      {/* Presupuesto: lo que falta autorizar y lo que espera al cliente. Solo admin. */}
      {isAdmin && (
        <MobileSection title={t('quotes.title')} icon={<FileSignature size={18} />}>
          <QuoteCard order={order} />
        </MobileSection>
      )}

      {/* Cuánto dejó el trabajo: solo tiene sentido ya entregado, y es de administración. */}
      {isAdmin && detail.isDelivered && (
        <MobileSection title={t('orderBalance.title')} icon={<Scale size={18} />}>
          <OrderBalanceCard orderId={order.id} />
        </MobileSection>
      )}

      {detail.commissionEstimate && (
        <MobileSection
          title={isAdmin ? t('commission.splitTitle') : t('workOrders.estimatedCommission')}
          icon={<Wallet size={18} />}
        >
        <CommissionEstimateCard
          estimate={detail.commissionEstimate}
          isAdmin={isAdmin}
          userId={detail.userId}
          names={Object.fromEntries((order.asignaciones || []).map((a) => [a.usuario_id, a.usuario?.nombre_completo ?? '—']))}
        />
        </MobileSection>
      )}

      {/* Totals Summary — solo cuando la base devolvió los montos (admin). */}
      {amounts && (
      <MobileSection
        title={t('workOrders.totalsTitle')}
        icon={<Receipt size={18} />}
        summary={money(totalParts + totalLabor - Number(amounts.deposito_inicial))}
      >
      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
          {[
            [t('workOrders.parts'), totalParts],
            [t('workOrders.labor'), totalLabor],
            [t('common.subtotal'), totalParts + totalLabor],
            [t('workOrders.deposit'), -Number(amounts.deposito_inicial)],
          ].map(([label, value], i) => (
            <div key={i} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{label as string}</div>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                {money(value as number)}
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'right', borderLeft: '2px solid var(--color-primary)', paddingLeft: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{t('common.total')}</div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-light)' }}>
              {money(totalParts + totalLabor - Number(amounts.deposito_inicial))}
            </div>
          </div>
        </div>
      </div>
      </MobileSection>
      )}

      {/* El enlace abre precios y totales: solo administración lo comparte. */}
      {isAdmin && (
        <MobileSection title={t('customerLink.title')} icon={<Link2 size={18} />}>
          <CustomerLinkCard order={order} statusLabels={statusLabels} />
        </MobileSection>
      )}

      {/* Assigned Technicians */}
      <MobileSection title={t('workOrders.assignedTechnician')} icon={<User size={18} />} summary={assignments.length || undefined}>
      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
          <User size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
          {t('workOrders.assignedTechnician')}
        </h3>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {assignments.length === 0 && (
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('common.noResults')}</p>
          )}
          {assignments.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-bg-tertiary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: a.tipo_tarea === 'mecanica'
                  ? 'var(--color-info-bg)' : 'rgba(236, 72, 153, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: a.tipo_tarea === 'mecanica' ? 'var(--color-info)' : '#F472B6',
              }}>
                {a.tipo_tarea === 'mecanica' ? <Wrench size={16} /> : <Paintbrush size={16} />}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{a.usuario?.nombre_completo}</div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
                  {a.tipo_tarea === 'mecanica' ? t('workOrders.mechanical') : t('workOrders.painting')} · {t(`workOrders.status.${a.estatus_tarea}`)}
                </span>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  onClick={() => detail.removeAssignment(a.id, a.usuario?.nombre_completo || '')}
                  style={{ marginLeft: 'var(--space-2)' }}
                  title={t('common.delete')}
                >
                  <X size={14} style={{ color: 'var(--color-danger)' }} />
                </button>
              )}
            </div>
          ))}
        </div>
        {isAdmin ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <select
              className="form-input form-select"
              style={{ maxWidth: 280 }}
              value={addingOperatorId}
              onChange={(e) => setAddingOperatorId(e.target.value)}
            >
              <option value="">-- {t('workOrders.assignedTechnician')} --</option>
              {/* Solo personal de la sede de la orden: la lista viene de la sede
                  elegida arriba, y una orden abierta desde un aviso puede ser de
                  otra. Asignar a alguien de otro taller le repartía la comisión. */}
              {operators
                .filter((op) => op.sede_id === order.sede_id && !assignments.some((a) => a.usuario_id === op.id))
                .map((op) => (
                  <option key={op.id} value={op.id}>{op.nombre_completo} ({op.rol})</option>
                ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={addOperator} disabled={!addingOperatorId}>
              <Plus size={16} /> {t('common.add')}
            </button>
          </div>
        ) : (
          // Aquí estaba "Unirme a la orden". Asignarse reparte la comisión
          // (`sync_order_commissions` divide la mano de obra entre los asignados), así que
          // es de administración y la base lo rechaza. Se deja la frase en su lugar: una
          // tarjeta que solo lista nombres, sin decir quién los pone, se lee como un botón
          // que falta.
          <p className="field-hint" style={{ marginTop: 'var(--space-4)' }}>
            {t('workOrders.assignedByAdmin')}
          </p>
        )}
      </div>
      </MobileSection>

      {/* Para un técnico es la tarjeta de trabajo: abre ya desplegada. */}
      <MobileSection
        title={t('workOrders.progressLog')}
        icon={<MessageSquarePlus size={18} />}
        summary={(order.avances || []).length || undefined}
        defaultOpen={!isAdmin}
      >
      <ProgressLog
        entries={order.avances || []}
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
      />
      </MobileSection>

      {detail.delivering && (
        <DeliveryModal order={order} onCancel={detail.cancelDelivery} onDelivered={detail.finishDelivery} />
      )}
      {detail.askingAuthReason && (
        <AuthorizationReasonModal
          saving={detail.busy}
          onCancel={detail.cancelAuthReason}
          onConfirm={detail.submitAuthReason}
        />
      )}

      {detail.publishingProgress && (
        <PublishProgressModal
          entry={detail.publishingProgress}
          saving={detail.busy}
          onCancel={detail.cancelPublishProgress}
          onConfirm={detail.confirmPublishProgress}
        />
      )}

      {detail.share && (
        <ShareReportModal
          order={order}
          link={detail.share.link}
          message={detail.share.message}
          downloading={detail.generatingPdf}
          onDownload={detail.generatePdf}
          onClose={detail.closeShare}
        />
      )}

    </div>
  );
}
