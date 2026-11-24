import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import Tabs, { TabPanel, type TabItem } from '../../components/Tabs';
import { useAuth } from '../../context/auth.context';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { useUnsavedChanges } from '../../context/unsavedChanges.context';
import { useIsMobile } from '../../lib/useMediaQuery';
import { moduloActivo } from '../../config/modulos';
import { findingsToReview } from './findings';
import { isUnassignedTask } from './tasks';
import type { WorkOrderDetailApi } from './useWorkOrderDetail';
import type { LaborPrefill, SectionStateProps, StickerModalState } from './detail/detailTypes';
import OrderDialogs from './detail/OrderDialogs';
import OrderHeader from './detail/OrderHeader';
import OrderQuickActions from './detail/OrderQuickActions';
import OrderTabTop from './detail/OrderTabTop';
import BalanceSection from './detail/sections/BalanceSection';
import CommissionSection from './detail/sections/CommissionSection';
import CustomerLinkSection from './detail/sections/CustomerLinkSection';
import HistorySection from './detail/sections/HistorySection';
import InspectionSection from './detail/sections/InspectionSection';
import LaborSection from './detail/sections/LaborSection';
import NextServiceSection from './detail/sections/NextServiceSection';
import ParkingSection from './detail/sections/ParkingSection';
import { useOrderParking } from './detail/useOrderParking';
import PartsSection from './detail/sections/PartsSection';
import ProgressSection from './detail/sections/ProgressSection';
import QuoteSection from './detail/sections/QuoteSection';
import SignatureSection from './detail/sections/SignatureSection';
import TechLaborSection from './detail/sections/TechLaborSection';
import TechniciansSection from './detail/sections/TechniciansSection';
import TotalsSection from './detail/sections/TotalsSection';
import VehicleSection from './detail/sections/VehicleSection';

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
  cobro: ['totales', 'parqueo', 'proximo_servicio', 'balance', 'enlace'],
  historial: ['historial'],
  tareas: ['tareas', 'comision'],
  orden: ['vehiculo', 'inspeccion', 'repuestos', 'firma', 'tecnicos', 'proximo_servicio'],
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
 * It composes the section components, header, quick actions and dialogs under `./detail/`,
 * and holds only layout state — the open tab and open sections. Every mutation belongs to
 * `useWorkOrderDetail`.
 */
export default function WorkOrderDetail({ detail, statusLabels, onBack }: WorkOrderDetailProps) {
  const { t } = useLanguage();
  const { requestNavigation } = useUnsavedChanges();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isMobile = useIsMobile();
  // El idioma del PDF que se descarga: lo elige administración (05/10/2026).
  const [pdfLanguage, setPdfLanguage] = useState<'es' | 'en'>('es');
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [stickerModal, setStickerModal] = useState<StickerModalState>({ open: false });

  const isAdmin = user?.rol === 'admin';
  const tabIds: readonly string[] = isAdmin ? ADMIN_TABS : TECH_TABS;
  const [tab, setTab] = useState<string>(tabIds[0]);
  // Una pestaña se monta la primera vez que se abre y después solo se esconde: así el
  // historial no se pide al abrir cada orden, y lo escrito en otra pestaña no se pierde.
  const [visited, setVisited] = useState<string[]>([tabIds[0]]);

  const order = detail.order;
  const orderId = order?.id;
  // La sección de parqueo solo existe con el cobro encendido: si no, no cuenta para las pestañas ni
  // para «Desplegar todo». La consulta es la misma que hace la sección (se comparte la caché).
  const { isParkingEnabled } = useOrderParking(orderId, order?.sede_id, isAdmin);
  // La tarea que se precarga al cotizar un hallazgo (F6).
  // "Reportar trabajo adicional" desde las acciones rápidas abre el diálogo de la lista de tareas.
  const [reportRequest, setReportRequest] = useState(0);
  const [addLaborRequest, setAddLaborRequest] = useState(0);
  const [authorizeRequest, setAuthorizeRequest] = useState(0);
  const [prefill, setPrefill] = useState<LaborPrefill | null>(null);
  // Qué secciones están abiertas: para el técnico «Tareas» abre desplegada al entrar (B-03).
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(() => new Set(isAdmin ? [] : ['tareas']));

  useEffect(() => {
    const next = detail.requestedTab && tabIds.includes(detail.requestedTab) ? detail.requestedTab : tabIds[0];
    setTab(next);
    setVisited([next]);
    const linked = detail.requestedTab === next ? LINKED_SECTION[next] : undefined;
    const initialSections = new Set<string>(isAdmin ? [] : ['tareas']);
    if (linked) initialSections.add(linked);
    setOpenSections(initialSections);
    // `tabIds` cambia solo con el rol, que no cambia con la orden abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, detail.requestedTab]);

  // El recuadro de error vive arriba de la orden: en el teléfono, quien tacha una tarea o guarda un
  // avance al fondo de la página no lo ve y el botón parece no hacer nada. También sale como aviso.
  const actionError = detail.error;
  useEffect(() => {
    if (actionError) showToast('error', t('common.error'), actionError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionError]);

  if (!order) return null;

  const selectTab = (id: string) => {
    setTab(id);
    setVisited((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const openSection = (id: string) => setOpenSections((prev) => new Set(prev).add(id));
  // Lo que recibe cada `CollapsibleSection`: si está abierta y cómo se abre o se cierra.
  const sectionState = (id: string): SectionStateProps => ({
    sectionId: id,
    open: openSections.has(id),
    onToggle: () =>
      setOpenSections((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
  });

  const laborList = order.labor_items || [];
  const partsList = order.repuestos || [];
  const progressEntries = order.avances || [];
  const receptionMedia = (order.media || []).filter((m) => m.origen === 'recepcion');
  // Null para mecánicos y pintores: `orden_montos` es solo admin.
  const amounts = order.montos ?? null;
  // Algo cotizado que el cliente todavía no autorizó: no se cobra ni genera comisión.
  const hasUnauthorized = [...laborList, ...partsList].some((l) => l.estado === 'borrador');
  // Algo autorizado (mano de obra o repuesto). Sin eso, el técnico no empieza ni termina la orden
  // (decisión del dueño, 20261010000041); el técnico lee los repuestos del resumen, sin precios.
  const hasAuthorizedWork = [...laborList, ...partsList, ...(order.repuestos_resumen || [])].some((l) => l.estado === 'aprobado');
  const techWaitsAuthorization = !isAdmin && !hasAuthorizedWork && (order.estatus === 'recepcion' || order.estatus === 'en_proceso');
  // Tareas sin técnico (no heredadas, no rechazadas): nadie cobrará su comisión hasta asignarlas
  // (20261010000006). Se cuentan líneas, no se suma dinero.
  const unassignedCount = moduloActivo('comisiones')
    ? laborList.filter((l) => isUnassignedTask(l) && l.estado !== 'rechazado').length
    : 0;
  const findings = isAdmin ? findingsToReview(order.hallazgos) : [];

  // Volver es la salida más usada del detalle, y descartaba un avance a medias
  // sin preguntar. Pasa por los mismos guardias que la navegación del menú.
  const handleBack = () => {
    requestNavigation(onBack);
  };

  const orderSede = detail.orderSede;

  // ----- qué va en cada pestaña --------------------------------------------------

  const sectionNodes: Record<string, ReactNode> = {
    vehiculo: (
      <VehicleSection
        order={order}
        isAdmin={detail.isAdmin}
        sectionProps={sectionState('vehiculo')}
        onEditInsurance={() => setShowInsuranceModal(true)}
      />
    ),
    firma: <SignatureSection order={order} detail={detail} sectionProps={sectionState('firma')} />,
    tecnicos: <TechniciansSection order={order} detail={detail} isAdmin={isAdmin} sectionProps={sectionState('tecnicos')} />,
    mano_obra: <LaborSection order={order} detail={detail} isAdmin={isAdmin} prefill={prefill} sectionProps={sectionState('mano_obra')} openAddRequest={addLaborRequest} />,
    tareas: !isAdmin ? <TechLaborSection order={order} detail={detail} reportRequest={reportRequest} sectionProps={sectionState('tareas')} /> : null,
    repuestos: <PartsSection order={order} detail={detail} isAdmin={isAdmin} sectionProps={sectionState('repuestos')} />,
    presupuesto: isAdmin ? <QuoteSection order={order} sectionProps={sectionState('presupuesto')} registerRequest={authorizeRequest} /> : null,
    comision: moduloActivo('comisiones') && detail.commissionEstimate ? <CommissionSection order={order} detail={detail} isAdmin={isAdmin} sectionProps={sectionState('comision')} /> : null,
    inspeccion: (
      <InspectionSection
        order={order}
        detail={detail}
        sectionProps={sectionState('inspeccion')}
        onQuotePointPrefill={(nextPrefill) => {
          setPrefill(nextPrefill);
          openSection('mano_obra');
          selectTab('trabajos');
        }}
      />
    ),
    avances: <ProgressSection order={order} detail={detail} isAdmin={isAdmin} sectionProps={sectionState('avances')} />,
    totales: amounts ? <TotalsSection order={order} detail={detail} isAdmin={isAdmin} sectionProps={sectionState('totales')} /> : null,
    parqueo: isAdmin && isParkingEnabled ? <ParkingSection order={order} isAdmin={isAdmin} sectionProps={sectionState('parqueo')} /> : null,
    proximo_servicio: (
      <NextServiceSection
        order={order}
        detail={detail}
        orderSede={orderSede}
        sectionProps={sectionState('proximo_servicio')}
        onOpenStickerModal={(data) => setStickerModal({ open: true, initialData: data })}
      />
    ),
    balance: isAdmin && detail.isDelivered ? <BalanceSection order={order} sectionProps={sectionState('balance')} /> : null,
    enlace: isAdmin ? <CustomerLinkSection order={order} statusLabels={statusLabels} sectionProps={sectionState('enlace')} /> : null,
    historial: isAdmin ? <HistorySection order={order} statusLabels={statusLabels} sectionProps={sectionState('historial')} /> : null,
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

  // Abre la sección (y en escritorio su pestaña) y la trae a la vista: las acciones rápidas.
  const goTo = (tabId: string, sectionId: string) => {
    if (tabIds.includes(tabId)) selectTab(tabId);
    openSection(sectionId);
    setTimeout(() => {
      document.querySelector(`[data-section="${sectionId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const openEmptyStickerModal = () => setStickerModal({ open: true, initialData: null });

  const handleAddWork = () => {
    goTo('trabajos', 'mano_obra');
    setAddLaborRequest((n) => n + 1);
  };

  const handleAuthorize = () => {
    goTo('trabajos', 'presupuesto');
    setAuthorizeRequest((n) => n + 1);
  };

  const quickActionsNode = (
    <OrderQuickActions
      order={order}
      detail={detail}
      isAdmin={isAdmin}
      goTo={goTo}
      onAddWork={handleAddWork}
      onAuthorize={handleAuthorize}
      onOpenStickerModal={openEmptyStickerModal}
      // El diálogo vive en la lista de tareas: con «Tareas» plegada se abría invisible (y desde el
      // 04/11/2026 su trampa se habría comido el «atrás»). Primero se abre la sección.
      onReportFinding={() => {
        goTo('tareas', 'tareas');
        setReportRequest((n) => n + 1);
      }}
    />
  );

  const renderTab = (tabId: string) => (
    <>
      <OrderTabTop
        tabId={tabId}
        order={order}
        detail={detail}
        statusLabels={statusLabels}
        isAdmin={isAdmin}
        isMobile={isMobile}
        findings={findings}
        unassignedCount={unassignedCount}
        techWaitsAuthorization={techWaitsAuthorization}
        quickActions={quickActionsNode}
        goTo={goTo}
        onOpenSection={openSection}
        onSelectTab={selectTab}
        onSetPrefill={setPrefill}
        onRegisterAuthorization={handleAuthorize}
      />
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
        <OrderHeader
          order={order}
          detail={detail}
          statusLabels={statusLabels}
          pdfLanguage={pdfLanguage}
          onChangePdfLanguage={setPdfLanguage}
          techWaitsAuthorization={techWaitsAuthorization}
          isMobile={isMobile}
          quickActions={quickActionsNode}
        />

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

      <OrderDialogs
        order={order}
        detail={detail}
        isAdmin={isAdmin}
        orderSede={orderSede}
        pdfLanguage={pdfLanguage}
        showInsuranceModal={showInsuranceModal}
        onCloseInsuranceModal={() => setShowInsuranceModal(false)}
        stickerModal={stickerModal}
        onCloseStickerModal={() => setStickerModal({ open: false })}
        onReviewTasks={() => goTo(isAdmin ? 'trabajos' : 'tareas', isAdmin ? 'mano_obra' : 'tareas')}
      />
    </div>
  );
}
