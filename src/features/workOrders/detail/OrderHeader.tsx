import { Archive, ArchiveRestore, CarFront, FileDown, Send } from 'lucide-react';
import { useLanguage } from '../../../context/language.context';
import { workTypeKey } from '../../../lib/workType';
import type { WorkOrder } from '../../../types/database';
import type { WorkOrderDetailApi } from '../useWorkOrderDetail';
import { toOrderStatus } from './detailTypes';

interface OrderHeaderProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  statusLabels: Record<string, string>;
  pdfLanguage: 'es' | 'en';
  onChangePdfLanguage: (lang: 'es' | 'en') => void;
  techWaitsAuthorization: boolean;
}

export default function OrderHeader({
  order,
  detail,
  statusLabels,
  pdfLanguage,
  onChangePdfLanguage,
  techWaitsAuthorization,
}: OrderHeaderProps) {
  const { t } = useLanguage();

  const customer = order.cliente;
  const vehicle = order.vehiculo;
  const laborList = order.labor_items || [];
  const partsList = order.repuestos || [];

  // Una pieza pedida que no ha llegado. Administración lo lee de sus repuestos; el técnico, del
  // resumen sin precios (`repuestos_de_orden`).
  const waitingParts = [...partsList, ...(order.repuestos_resumen || [])].some(
    (p) => p.estado_pedido === 'pedido' && p.estado !== 'rechazado'
  );
  // Con la casilla vacía (borrada para escribir otro número) el control muestra lo guardado.
  const draftProgress = parseInt(detail.progressDraft, 10);
  const sliderProgress = Number.isNaN(draftProgress) ? order.porcentaje_avance : draftProgress;

  return (
    <div className="order-detail-header">
      <div className="order-detail-heading">
        <h1 className="page-title order-detail-title">
          {order.numero_orden}
          {order.retirada_sin_reparar ? (
            <span className="badge badge-retirada">{t('withdrawal.status')}</span>
          ) : (
            <span className={`badge badge-${order.estatus}`}>{statusLabels[order.estatus]}</span>
          )}
          <span className={`badge badge-${order.tipo_trabajo}`}>{t(workTypeKey(order.tipo_trabajo))}</span>
          {order.con_seguro && (
            <span className="badge badge-insurance">{t('workOrders.insuranceBadge')}</span>
          )}
          {/* Finalizada: o falta que administración la revise, o ya está lista para el cliente. */}
          {order.estatus === 'finalizado' && !order.retirada_sin_reparar && (
            order.lista_para_entregar_en
              ? <span className="badge badge-success">{t('workOrders.readyForPickup')}</span>
              : <span className="badge badge-waiting-auth">{t('workOrders.pendingReview')}</span>
          )}
          {waitingParts && !detail.isDelivered && (
            <span className="badge badge-waiting-parts">{t('parts.waitingBadge')}</span>
          )}
          {[...laborList, ...partsList, ...(order.repuestos_resumen || [])].some((l) => l.estado === 'pendiente') && (
            <span className="badge badge-waiting-auth">{t('quotes.waitingBadge')}</span>
          )}
          {detail.isArchived && <span className="badge badge-archived">{t('workOrders.archivedBadge')}</span>}
        </h1>
        <p className="page-subtitle">{customer?.nombre} — {vehicle?.anio} {vehicle?.marca} {vehicle?.modelo}</p>
        {(detail.canSendReport || detail.canArchive || detail.canWithdraw) && (
          <div className="order-detail-actions">
            {/* Solo administración: el reporte lleva precios y totales, y el
                cliente pidió que los técnicos no lo manden desde su perfil. */}
            {detail.canSendReport && (
              <>
                {/* El PDF sale en el idioma que elija administración (05/10/2026). */}
                <span className="pdf-download">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void detail.generatePdf(pdfLanguage)}
                    disabled={detail.generatingPdf}
                    title={t('workOrders.generatePdf')}
                  >
                    <FileDown size={14} /> {detail.generatingPdf ? t('common.loading') : t('workOrders.generatePdf')}
                  </button>
                  <select
                    className="form-input form-select form-input-sm pdf-language"
                    aria-label={t('workOrders.pdfLanguage')}
                    value={pdfLanguage}
                    onChange={(e) => onChangePdfLanguage(e.target.value === 'en' ? 'en' : 'es')}
                  >
                    <option value="es">ES</option>
                    <option value="en">EN</option>
                  </select>
                </span>
                {/* Enviar reporte: comparte el enlace web del cliente (correo desde el
                    sistema o WhatsApp). El PDF de al lado es solo para imprimir. Secundario:
                    el botón principal de cada estado está en las acciones rápidas. */}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
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
            {/* Cerrar sin hacer el trabajo: devuelve el depósito o cobra el diagnóstico. */}
            {detail.canWithdraw && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={detail.startWithdrawal}
                disabled={detail.busy}
                id="order-withdraw"
              >
                <CarFront size={14} /> {t('withdrawal.action')}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="order-detail-controls">
        {/* `key` con `statusEpoch`: al cancelar el confirm no cambia ningún
            estado, así que React no re-renderiza y el <select> se quedaba
            mostrando la opción elegida sobre una orden que no se movió.
            Remontarlo es lo único que lo devuelve al valor real. */}
        <select
          key={detail.statusEpoch}
          className="form-input form-select"
          aria-label={t('common.status')}
          value={order.estatus}
          onChange={(e) => {
            const nextStatus = toOrderStatus(e.target.value);
            if (nextStatus) void detail.changeStatus(nextStatus);
          }}
          // F6: la pausa la quita administración (al cotizar, descartar o con la respuesta del
          // cliente); el técnico no la levanta por su cuenta.
          // Una finalizada solo la reabre administración (05/10/2026).
          disabled={
            !detail.canEdit ||
            (!detail.isAdmin && (order.estatus === 'espera_autorizacion' || order.estatus === 'finalizado')) ||
            techWaitsAuthorization
          }
          title={
            techWaitsAuthorization
              ? t('techStatus.waitingAuthorizationNote')
              : !detail.isAdmin && order.estatus === 'espera_autorizacion'
              ? t('findings.pausedByOffice')
              : !detail.isAdmin && order.estatus === 'finalizado'
                ? t('workOrders.onlyAdminReopens')
                : undefined
          }
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
            // F6: la pausa la pone la oficina; el técnico reporta trabajo adicional en Tareas.
            .filter((s) => s !== 'espera_autorizacion' || detail.isAdmin || order.estatus === 'espera_autorizacion')
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
            aria-label={t('workOrders.progress')}
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
              aria-label={t('workOrders.progress')}
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
  );
}
