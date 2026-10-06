import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Camera,
  Car,
  CarFront,
  CheckCircle2,
  ChevronLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  DollarSign,
  FileDown,
  FileSignature,
  Fuel,
  History,
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
import CollapsibleSection from '../../components/CollapsibleSection';
import Tabs, { TabPanel, type TabItem } from '../../components/Tabs';
import { useAuth } from '../../context/auth.context';
import { useLanguage } from '../../context/language.context';
import { useUnsavedChanges } from '../../context/unsavedChanges.context';
import { useIsMobile } from '../../lib/useMediaQuery';
import type { OrderStatus } from '../../types/database';
import LaborTable from './LaborTable';
import PartsTable from './PartsTable';
import PartsSummaryCard from './PartsSummaryCard';
import CommissionEstimateCard from './CommissionEstimateCard';
import TechnicianTaskList from './TechnicianTaskList';
import TechOrderStatus from './TechOrderStatus';
import ProgressLog from './ProgressLog';
import ShareReportModal from './ShareReportModal';
import FindingsCard from './FindingsCard';
import { findingsToReview } from './findings';
import DeliveryModal from './DeliveryModal';
import WithdrawalModal, { type WithdrawalLine } from './WithdrawalModal';
import AdvancePaymentModal from './AdvancePaymentModal';
import OrderTotalsCard from './OrderTotalsCard';
import PendingWorkNotice from './PendingWorkNotice';
import { isApproved } from './lineState';
import OrderBalanceCard from '../finance/OrderBalanceCard';
import PublishProgressModal from './PublishProgressModal';
import CustomerLinkCard from './CustomerLinkCard';
import QuoteCard from './QuoteCard';
import OrderHistory from './OrderHistory';
import { isUnassignedTask, suggestedTechnicianId } from './tasks';
import SignatureCard from './SignatureCard';
import MediaCaptureBar from '../media/MediaCaptureBar';
import MediaGallery from '../media/MediaGallery';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';
import { money } from '../../lib/money';

interface WorkOrderDetailProps {
  detail: WorkOrderDetailApi;
  statusLabels: Record<string, string>;
  onBack: () => void;
}

/** Las pestañas de cada quien, en orden. La primera es la que abre. */
const ADMIN_TABS = ['resumen', 'trabajos', 'fotos', 'cobro', 'historial'] as const;
const TECH_TABS = ['tareas', 'orden', 'avances'] as const;

/**
 * Las secciones plegables de cada pestaña, en orden. Arrancan cerradas (pedido del taller,
 * 04/10/2026): se ven los títulos con su resumen y se abre lo que se necesita. En el teléfono,
 * sin pestañas, van todas apiladas en este mismo orden.
 */
const TAB_SECTIONS: Record<string, readonly string[]> = {
  resumen: ['vehiculo', 'firma', 'tecnicos'],
  trabajos: ['mano_obra', 'repuestos', 'presupuesto', 'comision'],
  fotos: ['inspeccion', 'avances'],
  cobro: ['totales', 'balance', 'enlace'],
  historial: ['historial'],
  tareas: ['tareas', 'comision'],
  orden: ['vehiculo', 'inspeccion', 'repuestos', 'firma', 'tecnicos'],
  avances: ['avances'],
};

/** Un enlace a una pestaña (un aviso, "Requiere atención", "Mis tareas") abre lo que fue a ver. */
const LINKED_SECTION: Record<string, string> = { trabajos: 'mano_obra', tareas: 'tareas' };

/**
 * The single-order screen: header and status, vehicle and intake, signature,
 * labor, parts, totals, assignments and the progress log.
 *
 * Desde el 03/10/2026, en escritorio las tarjetas van en pestañas bajo un encabezado fijo: la
 * orden apilaba hasta doce y había que recorrerlas todas (pedido del taller). En el teléfono
 * siguen las secciones apiladas, en el mismo orden que las pestañas. Desde el 04/10/2026 cada
 * tarjeta es una sección plegable (`CollapsibleSection`), cerrada al entrar, también en
 * escritorio: se ven los títulos y se abre lo que se necesita.
 *
 * It composes the cards and holds only what is genuinely local to the layout —
 * the open tab and the assignment picker. Every mutation belongs to
 * `useWorkOrderDetail`, and each card owns its own row drafts, so this file
 * stays a layout and not a second god component.
 */
export default function WorkOrderDetail({ detail, statusLabels, onBack }: WorkOrderDetailProps) {
  const { t } = useLanguage();
  const { confirmNavigation } = useUnsavedChanges();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [addingOperatorId, setAddingOperatorId] = useState('');
  // El idioma del PDF que se descarga: lo elige administración (05/10/2026).
  const [pdfLanguage, setPdfLanguage] = useState<'es' | 'en'>('es');

  const isAdmin = user?.rol === 'admin';
  const tabIds: readonly string[] = isAdmin ? ADMIN_TABS : TECH_TABS;
  const [tab, setTab] = useState<string>(tabIds[0]);
  // Una pestaña se monta la primera vez que se abre y después solo se esconde: así el
  // historial no se pide al abrir cada orden, y lo escrito en otra pestaña no se pierde.
  const [visited, setVisited] = useState<string[]>([tabIds[0]]);

  const orderId = detail.order?.id;
  // La tarea que se precarga al cotizar un hallazgo (F6).
  const [prefill, setPrefill] = useState<{ text: string; nonce: number; technicianId?: string | null } | null>(null);
  // Qué secciones están abiertas: ninguna al entrar a una orden, salvo la que pide un enlace.
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const next = detail.requestedTab && tabIds.includes(detail.requestedTab) ? detail.requestedTab : tabIds[0];
    setTab(next);
    setVisited([next]);
    const linked = detail.requestedTab === next ? LINKED_SECTION[next] : undefined;
    setOpenSections(new Set(linked ? [linked] : []));
    // `tabIds` cambia solo con el rol, que no cambia con la orden abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, detail.requestedTab]);

  const order = detail.order;
  if (!order) return null;

  const selectTab = (id: string) => {
    setTab(id);
    setVisited((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const openSection = (id: string) => setOpenSections((prev) => new Set(prev).add(id));
  // Lo que recibe cada `CollapsibleSection`: si está abierta y cómo se abre o se cierra.
  const sectionState = (id: string) => ({
    open: openSections.has(id),
    onToggle: () =>
      setOpenSections((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
  });

  const customer = order.cliente;
  const vehicle = order.vehiculo;
  const assignments = order.asignaciones || [];
  const laborList = order.labor_items || [];
  const partsList = order.repuestos || [];
  const progressEntries = order.avances || [];
  // Los avances donde cayeron las fotos de un trabajo adicional reportado (F6).
  const findingEntryIds = new Set((order.hallazgos || []).flatMap((h) => (h.avance_id ? [h.avance_id] : [])));
  const receptionMedia = (order.media || []).filter((m) => m.origen === 'recepcion');
  const receptionPending = detail.pendingUploads.filter((p) => p.origen === 'recepcion');
  // Null para mecánicos y pintores: `orden_montos` es solo admin.
  const amounts = order.montos ?? null;
  // Lo autorizado de la orden: lo que se puede marcar como hecho al retirarla sin reparar.
  const withdrawalLines: WithdrawalLine[] = [
    ...laborList.filter(isApproved).map((l) => ({
      id: l.id, tipo: 'mano_obra' as const, descripcion: l.descripcion, monto: Number(l.costo), hecho: !!l.completado_en,
    })),
    ...partsList.filter(isApproved).map((p) => ({
      id: p.id, tipo: 'repuesto' as const, descripcion: p.descripcion, monto: Number(p.subtotal),
    })),
  ];
  // Una pieza pedida que no ha llegado. Administración lo lee de sus repuestos; el técnico, del
  // resumen sin precios (`repuestos_de_orden`).
  const waitingParts = [...partsList, ...(order.repuestos_resumen || [])].some(
    (p) => p.estado_pedido === 'pedido' && p.estado !== 'rechazado'
  );
  // Con la casilla vacía (borrada para escribir otro número) el control muestra lo guardado.
  const draftProgress = parseInt(detail.progressDraft, 10);
  const sliderProgress = Number.isNaN(draftProgress) ? order.porcentaje_avance : draftProgress;
  // Algo cotizado que el cliente todavía no autorizó: no se cobra ni genera comisión.
  const hasUnauthorized = [...laborList, ...partsList].some((l) => l.estado === 'borrador');
  // Tareas sin técnico (no heredadas, no rechazadas): nadie cobrará su comisión hasta asignarlas
  // (20261010000006). Se cuentan líneas, no se suma dinero.
  const unassignedCount = laborList.filter((l) => isUnassignedTask(l) && l.estado !== 'rechazado').length;
  // Personal de la sede DE LA ORDEN (no de la elegida arriba): lo carga el hook.
  const operators = detail.orderOperators;
  // Trabajos de antes de la comisión por tarea, sin técnico: se reparten por especialidad entre
  // los asignados a mano (origen 'manual'). Solo entonces importa quién está "en el reparto".
  const hasInheritedLines = laborList.some((l) => !l.asignado_a && l.reparto_heredado !== false && l.estado !== 'rechazado');

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

  // ----- las secciones ---------------------------------------------------------
  // Cada una envuelta en su `CollapsibleSection`, cerrada al entrar. Se arman una vez y se
  // acomodan abajo (`TAB_SECTIONS`): en pestañas (escritorio) o apiladas (teléfono).

  const vehicleSection = (
    <CollapsibleSection {...sectionState('vehiculo')} title={t('workOrders.vehicleInfo')} icon={<Car size={18} />} summary={vehicle?.placa || undefined}>
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
          <Car size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
          {t('workOrders.vehicleInfo')}
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
    </CollapsibleSection>
  );

  const inspectionSection = (
    <CollapsibleSection {...sectionState('inspeccion')} title={t('workOrders.inspection360')} icon={<Camera size={18} />} summary={receptionMedia.length || undefined}>
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
    </CollapsibleSection>
  );

  const signatureSection = (
    <CollapsibleSection {...sectionState('firma')}
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
    </CollapsibleSection>
  );

  // "Mano de obra" para administración (y el cliente); "Tareas" para el técnico.
  const laborTitle = isAdmin ? t('workOrders.laborDescription') : t('workOrders.tasks');
  const laborSection = (
    <CollapsibleSection {...sectionState('mano_obra')} title={laborTitle} icon={<Wrench size={18} />} summary={laborList.length || undefined}>
      <LaborTable
        title={laborTitle}
        items={laborList}
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
      />
    </CollapsibleSection>
  );

  const techLaborSection = !isAdmin && (
    <CollapsibleSection {...sectionState('tareas')} title={t('workOrders.tasks')} icon={<Wrench size={18} />} summary={laborList.length || undefined}>
      <TechnicianTaskList items={laborList} currentUserId={detail.userId ?? ''} detail={detail} />
    </CollapsibleSection>
  );

  // Un técnico no ve precios de repuestos: la tabla con montos es solo admin (y la base no se
  // la devuelve). Ve qué piezas lleva la orden, que es lo que necesita para hacer el trabajo.
  const partsSection = (
    <CollapsibleSection {...sectionState('repuestos')}
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
          onSetOrderState={detail.setPartOrderState}
        />
      ) : (
        <PartsSummaryCard items={order.repuestos_resumen || []} />
      )}
    </CollapsibleSection>
  );

  // Presupuesto: lo que falta autorizar y lo que espera al cliente. Solo admin.
  const quoteSection = isAdmin && (
    <CollapsibleSection {...sectionState('presupuesto')} title={t('quotes.title')} icon={<FileSignature size={18} />}>
      <QuoteCard order={order} />
    </CollapsibleSection>
  );

  // Cuánto dejó el trabajo: solo tiene sentido ya entregado, y es de administración.
  const balanceSection = isAdmin && detail.isDelivered && (
    <CollapsibleSection {...sectionState('balance')} title={t('orderBalance.title')} icon={<Scale size={18} />}>
      <OrderBalanceCard orderId={order.id} />
    </CollapsibleSection>
  );

  const commissionSection = detail.commissionEstimate && (
    <CollapsibleSection {...sectionState('comision')}
      title={isAdmin ? t('commission.splitTitle') : t('workOrders.estimatedCommission')}
      icon={<Wallet size={18} />}
    >
      <CommissionEstimateCard
        estimate={detail.commissionEstimate}
        isAdmin={isAdmin}
        userId={detail.userId}
        names={{
          // Quien tiene una tarea ya está entre los asignados (la base lo agrega); el nombre
          // embebido en la línea cubre al que no, por si acaso.
          ...Object.fromEntries(laborList.flatMap((l) => (l.tecnico ? [[l.tecnico.id, l.tecnico.nombre_completo]] : []))),
          ...Object.fromEntries((order.asignaciones || []).map((a) => [a.usuario_id, a.usuario?.nombre_completo ?? '—'])),
        }}
        onApproveCommission={detail.approveCommission}
      />
    </CollapsibleSection>
  );

  // Totales — solo cuando la base devolvió los montos (admin). Todas las cifras son de la base.
  const totalsSection = amounts && (
    <CollapsibleSection {...sectionState('totales')}
      title={t('workOrders.totalsTitle')}
      icon={<Receipt size={18} />}
      summary={money(Number(amounts.total_general))}
    >
      <OrderTotalsCard
        order={order}
        amounts={amounts}
        canDiscount={detail.canEditLines}
        onApplyDiscount={detail.applyDiscount}
        onRegisterAdvance={detail.canRegisterAdvance ? detail.startAdvance : undefined}
      />
    </CollapsibleSection>
  );

  // El enlace abre precios y totales: solo administración lo comparte.
  const customerLinkSection = isAdmin && (
    <CollapsibleSection {...sectionState('enlace')} title={t('customerLink.title')} icon={<Link2 size={18} />}>
      <CustomerLinkCard order={order} statusLabels={statusLabels} />
    </CollapsibleSection>
  );

  const techniciansSection = (
    <CollapsibleSection {...sectionState('tecnicos')} title={t('workOrders.assignedTechnician')} icon={<User size={18} />} summary={assignments.length || undefined}>
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
                {/* Quien entró por una tarea cobra solo sus tareas; quien se asignó a mano entra
                    además al reparto de los trabajos anteriores sin técnico (20261010000006). */}
                {(a.origen === 'tarea' || hasInheritedLines) && (
                  <div className="assignment-origin">
                    <span
                      className={`badge assignment-origin-badge${a.origen === 'tarea' ? ' is-task' : ''}`}
                      title={a.origen === 'tarea' ? t('tasks.byTaskHint') : t('tasks.inSplitHint')}
                    >
                      {a.origen === 'tarea' ? t('tasks.byTask') : t('tasks.inSplit')}
                    </span>
                    {isAdmin && hasInheritedLines && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm assignment-split-toggle"
                        onClick={() => void detail.setAssignmentInSplit(a, a.origen === 'tarea')}
                        disabled={detail.busy || detail.paidPools.has(a.tipo_tarea)}
                        title={detail.paidPools.has(a.tipo_tarea) ? t('tasks.splitPaid') : undefined}
                      >
                        {a.origen === 'tarea' ? t('tasks.joinSplit') : t('tasks.leaveSplit')}
                      </button>
                    )}
                  </div>
                )}
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
              {/* Quien ya está solo por una tarea sí se ofrece: agregarlo a mano lo mete al
                  reparto (el hook cambia el origen de su fila en vez de duplicarla). */}
              {operators
                .filter((op) => op.sede_id === order.sede_id && !assignments.some((a) => a.usuario_id === op.id && a.origen !== 'tarea'))
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
    </CollapsibleSection>
  );

  const progressSection = (
    <CollapsibleSection {...sectionState('avances')}
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
      />
    </CollapsibleSection>
  );

  // El historial es de administración. Se monta solo cuando se abre (ver `visited`).
  const historySection = isAdmin && (
    <CollapsibleSection {...sectionState('historial')} title={t('history.title')} icon={<History size={18} />}>
      <OrderHistory orderId={order.id} statusLabels={statusLabels} />
    </CollapsibleSection>
  );

  // F6: lo que reportó el taller y administración tiene que decidir. Arriba de Resumen y de
  // Trabajos; en el teléfono las dos pestañas están apiladas, así que va una sola vez.
  const findings = isAdmin ? findingsToReview(order.hallazgos) : [];
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
        setPrefill({
          text,
          nonce: Date.now(),
          technicianId: suggestedTechnicianId(assignments.map((a) => a.usuario_id), detail.technicians, h.reportado_por),
        });
        // La tarea precargada está en Mano de obra: se abre para que se vea.
        openSection('mano_obra');
        selectTab('trabajos');
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
            openSection('mano_obra');
            selectTab('trabajos');
          }}
        >
          {t('tasks.goToWork')}
        </button>
      )}
    </div>
  );

  // ----- qué va en cada pestaña --------------------------------------------------

  const sectionNodes: Record<string, ReactNode> = {
    vehiculo: vehicleSection,
    firma: signatureSection,
    tecnicos: techniciansSection,
    mano_obra: laborSection,
    tareas: techLaborSection,
    repuestos: partsSection,
    presupuesto: quoteSection,
    comision: commissionSection,
    inspeccion: inspectionSection,
    avances: progressSection,
    totales: totalsSection,
    balance: balanceSection,
    enlace: customerLinkSection,
    historial: historySection,
  };
  // Las que esta orden y este rol de verdad tienen (el balance solo entregada, el presupuesto
  // solo para administración…).
  const sectionsOf = (tabId: string) => (TAB_SECTIONS[tabId] ?? []).filter((id) => sectionNodes[id]);

  // "Desplegar todo" / "Contraer todo" de un grupo de secciones (una pestaña, o todo el detalle
  // en el teléfono). Con una sola no hace falta: su flecha es lo mismo.
  const sectionTools = (ids: readonly string[]) => {
    if (ids.length < 2) return null;
    const allOpen = ids.every((id) => openSections.has(id));
    return (
      <div className="section-tools">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() =>
            setOpenSections((prev) => {
              const next = new Set(prev);
              for (const id of ids) {
                if (allOpen) next.delete(id);
                else next.add(id);
              }
              return next;
            })
          }
        >
          {allOpen ? <ChevronsDownUp size={14} aria-hidden /> : <ChevronsUpDown size={14} aria-hidden />}{' '}
          {allOpen ? t('workOrders.tabs.collapseAll') : t('workOrders.tabs.expandAll')}
        </button>
      </div>
    );
  };

  // Los avisos van arriba de las secciones y no se pliegan: son lo que hay que atender.
  const tabTop: Record<string, ReactNode> = {
    resumen: (
      <>
        {findingsSection}
        {unassignedNotice}
        {/* Lo que el cliente dejó pendiente en otras visitas: el momento de ofrecerlo es ahora. */}
        {isAdmin && !detail.isDelivered && <PendingWorkNotice vehicleId={order.vehiculo_id} excludeOrderId={order.id} />}
      </>
    ),
    trabajos: !isMobile && findingsSection,
    // El técnico ve primero en qué va la orden y qué de lo suyo está autorizado (06/10/2026).
    tareas: !isAdmin && (
      <TechOrderStatus
        order={order}
        myTasks={laborList.filter((l) => l.asignado_a === detail.userId)}
        statusLabel={statusLabels[order.estatus] ?? order.estatus}
      />
    ),
  };

  const renderTab = (tabId: string) => (
    <>
      {tabTop[tabId]}
      {!isMobile && sectionTools(sectionsOf(tabId))}
      {sectionsOf(tabId).map((id) => (
        <Fragment key={id}>{sectionNodes[id]}</Fragment>
      ))}
    </>
  );

  const tabItems: TabItem[] = isAdmin
    ? [
        {
          id: 'resumen',
          label: t('workOrders.tabs.summary'),
          attention: findings.length > 0,
          attentionLabel: t('findings.cardTitle'),
        },
        {
          id: 'trabajos',
          label: t('workOrders.tabs.work'),
          count: laborList.length + partsList.length,
          attention: hasUnauthorized || unassignedCount > 0,
          attentionLabel: hasUnauthorized
            ? t('workOrders.tabs.unauthorized')
            : t('tasks.unassignedNotice').replace('{n}', String(unassignedCount)),
        },
        { id: 'fotos', label: t('workOrders.tabs.media'), count: receptionMedia.length + progressEntries.length },
        { id: 'cobro', label: t('workOrders.tabs.billing') },
        { id: 'historial', label: t('history.title') },
      ]
    : [
        { id: 'tareas', label: t('workOrders.tasks'), count: laborList.length },
        { id: 'orden', label: t('workOrders.tabs.order') },
        { id: 'avances', label: t('workOrders.tabs.progress'), count: progressEntries.length },
      ];

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

      {/* El encabezado: en escritorio queda fijo arriba con las pestañas, para cambiar de
          sección o de estado sin volver a subir. */}
      <div className="order-detail-top">
      <div className="order-detail-header">
        <div className="order-detail-heading">
          <h1 className="page-title order-detail-title">
            {order.numero_orden}
            {order.retirada_sin_reparar ? (
              <span className="badge badge-retirada">{t('withdrawal.status')}</span>
            ) : (
              <span className={`badge badge-${order.estatus}`}>{statusLabels[order.estatus]}</span>
            )}
            <span className={`badge badge-${order.tipo_trabajo}`}>{order.tipo_trabajo}</span>
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
          {(detail.canSendReport || detail.canArchive || detail.canWithdraw || detail.canMarkReady) && (
            <div className="order-detail-actions">
              {/* Lo termina el técnico; administración lo revisa y confirma. Ahí sale el correo. */}
              {detail.canMarkReady && (
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={() => void detail.markReadyForPickup()}
                  disabled={detail.busy}
                  id="order-mark-ready"
                >
                  <CheckCircle2 size={14} /> {t('workOrders.markReady')}
                </button>
              )}
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
                      onChange={(e) => setPdfLanguage(e.target.value as 'es' | 'en')}
                    >
                      <option value="es">ES</option>
                      <option value="en">EN</option>
                    </select>
                  </span>
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
            value={order.estatus}
            onChange={(e) => detail.changeStatus(e.target.value as OrderStatus)}
            // F6: la pausa la quita administración (al cotizar, descartar o con la respuesta del
            // cliente); el técnico no la levanta por su cuenta.
            // Una finalizada solo la reabre administración (05/10/2026).
            disabled={
              !detail.canEdit ||
              (!detail.isAdmin && (order.estatus === 'espera_autorizacion' || order.estatus === 'finalizado'))
            }
            title={
              !detail.isAdmin && order.estatus === 'espera_autorizacion'
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

      {!isMobile && (
        <Tabs tabs={tabItems} active={tab} onChange={selectTab} idPrefix="order-detail" ariaLabel={t('workOrders.tabs.label')} />
      )}
      </div>

      {isMobile ? (
        // En el teléfono, todas las secciones apiladas y plegables, en el orden de las pestañas.
        <>
          {sectionTools(tabIds.flatMap(sectionsOf))}
          {tabIds.map((id) => (
            <div key={id} className="order-detail-group">
              {renderTab(id)}
            </div>
          ))}
        </>
      ) : (
        tabIds.map((id) => (
          <TabPanel key={id} id={id} idPrefix="order-detail" active={tab === id}>
            {visited.includes(id) ? renderTab(id) : null}
          </TabPanel>
        ))
      )}

      {detail.delivering && (
        <DeliveryModal
          order={order}
          onCancel={detail.cancelDelivery}
          onDelivered={detail.finishDelivery}
        />
      )}

      {detail.withdrawing && (
        <WithdrawalModal
          order={order}
          lines={withdrawalLines}
          onCancel={detail.cancelWithdrawal}
          onDone={detail.finishWithdrawal}
        />
      )}

      {detail.advancing && (
        <AdvancePaymentModal
          order={order}
          onCancel={detail.cancelAdvance}
          onDone={detail.finishAdvance}
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
          onDownload={() => void detail.generatePdf(pdfLanguage)}
          onClose={detail.closeShare}
        />
      )}

    </div>
  );
}
