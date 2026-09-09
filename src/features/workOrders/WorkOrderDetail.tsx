import { useState } from 'react';
import {
  Camera,
  Car,
  ChevronLeft,
  DollarSign,
  FileDown,
  Fuel,
  Send,
  Paintbrush,
  Plus,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/auth.context';
import { useLanguage } from '../../context/language.context';
import type { OrderStatus, UserProfile } from '../../types/database';
import LaborTable from './LaborTable';
import PartsTable from './PartsTable';
import ProgressLog from './ProgressLog';
import ShareReportModal from './ShareReportModal';
import SignatureCard from './SignatureCard';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';

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
  const { user } = useAuth();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [addingOperatorId, setAddingOperatorId] = useState('');

  const order = detail.order;
  if (!order) return null;

  const isAdmin = user?.rol === 'admin';
  const customer = order.cliente;
  const vehicle = order.vehiculo;
  const assignments = order.asignaciones || [];
  const laborList = order.labor_items || [];
  const partsList = order.repuestos || [];
  const totalLabor = laborList.reduce((sum, l) => sum + l.costo, 0);
  const totalParts = partsList.reduce((sum, p) => sum + p.subtotal, 0);
  const photoUrls = (order.inspeccion_360_fotos || []).filter(Boolean) as string[];

  const addOperator = async () => {
    const op = operators.find((o) => o.id === addingOperatorId);
    if (!op) return;
    await detail.addAssignment(op);
    setAddingOperatorId('');
  };

  return (
    <div className="animate-fade-in">
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 'var(--space-4)' }}>
        <ChevronLeft size={18} /> {t('common.back')}
      </button>

      {detail.error && <div className="alert-error">{detail.error}</div>}
      {detail.loading && <div className="loading-state"><div className="spinner" /></div>}
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
            {detail.canEdit && (
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
                {/* Generate and send: the report goes to the phone number and
                    email the customer left on the order. */}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={detail.shareReport}
                  disabled={detail.generatingPdf}
                  title={t('workOrders.shareReport')}
                >
                  <Send size={14} /> {detail.generatingPdf ? t('common.loading') : t('workOrders.shareReport')}
                </button>
              </>
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
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={order.porcentaje_avance}
              onChange={(e) => detail.changeProgress(parseInt(e.target.value, 10))}
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
                onBlur={() => detail.changeProgress(parseInt(detail.progressDraft, 10) || 0)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
              />
              <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: detail.isComplete ? 'var(--color-success)' : 'var(--color-primary-light)' }}>%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="responsive-grid-2">
        {/* Vehicle Info */}
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
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <DollarSign size={16} style={{ color: 'var(--color-success)' }} />
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{t('workOrders.deposit')}</div>
                <div style={{ fontWeight: 600 }}>${order.deposito_inicial.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Inspection 360 */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
            <Camera size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('workOrders.inspection360')}
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
            {order.inspeccion_360_notas}
          </p>

          {photoUrls.length > 0 ? (
            <div className="photo-gallery-grid">
              {photoUrls.map((url, i) => (
                <button key={i} type="button" className="photo-gallery-thumb" onClick={() => setLightboxUrl(url)}>
                  <img src={url} alt={`foto-${i}`} loading="lazy" />
                </button>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
              {t('common.noResults')}
            </p>
          )}
        </div>

        <SignatureCard
          signatureUrl={order.firma_cliente_url}
          signedAt={order.firma_fecha}
          customerName={customer?.nombre}
          canEdit={detail.canEdit}
          saving={detail.savingSignature}
          onSave={detail.saveSignature}
          onClear={detail.clearSignature}
        />

        <LaborTable
          items={laborList}
          canEdit={detail.canEdit}
          busy={detail.busy}
          onAdd={detail.addLabor}
          onUpdate={detail.updateLabor}
          onRemove={detail.removeLabor}
        />

        <PartsTable
          items={partsList}
          canEdit={detail.canEdit}
          busy={detail.busy}
          onAdd={detail.addPart}
          onUpdate={detail.updatePart}
          onRemove={detail.removePart}
        />
      </div>

      {/* Totals Summary */}
      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
          {[
            [t('workOrders.parts'), totalParts],
            [t('workOrders.labor'), totalLabor],
            [t('common.subtotal'), totalParts + totalLabor],
            [t('workOrders.deposit'), -order.deposito_inicial],
          ].map(([label, value], i) => (
            <div key={i} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{label as string}</div>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                {(value as number) < 0 ? '-' : ''}${Math.abs(value as number).toFixed(2)}
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'right', borderLeft: '2px solid var(--color-primary)', paddingLeft: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{t('common.total')}</div>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-light)' }}>
              ${(totalParts + totalLabor - order.deposito_inicial).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Assigned Technicians */}
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
              {operators
                .filter((op) => !assignments.some((a) => a.usuario_id === op.id))
                .map((op) => (
                  <option key={op.id} value={op.id}>{op.nombre_completo} ({op.rol})</option>
                ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={addOperator} disabled={!addingOperatorId}>
              <Plus size={16} /> {t('common.add')}
            </button>
          </div>
        ) : (
          // `canJoin` ya excluye estar asignado y la orden entregada: unirse
          // después de la entrega re-reparte una bolsa de comisión ya calculada.
          detail.canJoin && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <button type="button" className="btn btn-primary" onClick={detail.joinOrder} disabled={detail.busy}>
                <Plus size={16} /> {t('workOrders.joinOrder')}
              </button>
            </div>
          )
        )}
      </div>

      <ProgressLog
        entries={order.avances || []}
        canEdit={detail.canEdit}
        busy={detail.busy}
        onAdd={detail.addProgressUpdate}
        onRemove={detail.removeProgressUpdate}
        onOpenPhoto={setLightboxUrl}
      />

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

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button className="lightbox-close" onClick={() => setLightboxUrl(null)} aria-label={t('common.close')}>
            <X size={20} />
          </button>
          <img src={lightboxUrl} alt="Foto de inspección" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
