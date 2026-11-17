// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, ADMIN_USER, SEDE_CENTRO } from '../../../../test/renderWithProviders';
import type { WorkOrder } from '../../../../types/database';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import InspectionSection from './InspectionSection';

vi.mock('../../../inspection/PointInspection', () => ({ default: () => null }));
vi.mock('../../../media/MediaCaptureBar', () => ({ default: () => null }));
vi.mock('../../../media/MediaGallery', () => ({ default: () => null }));
vi.mock('../../DamageDiagramEditor', () => ({ default: () => null }));

const noop = () => {};
const asyncNoop = async () => {};
const asyncFalse = async () => false;

function makeOrder(notas: string): WorkOrder {
  return {
    id: 'ord-1',
    numero_orden: 'OT-2026-0001',
    sede_id: SEDE_CENTRO.id,
    cliente_id: 'cli-1',
    vehiculo_id: 'veh-1',
    tipo_trabajo: 'mecanica',
    estatus: 'en_proceso',
    millas_ingreso: 1000,
    nivel_gasolina: '1/2',
    inspeccion_360_notas: notas,
    fecha_ingreso: '2026-10-01T00:00:00Z',
    fecha_estimada_entrega: '2026-10-10',
    porcentaje_avance: 0,
    total_labor: 0,
    montos: { total_repuestos: 0, total_general: 0, deposito_inicial: 0 },
    creado_por: ADMIN_USER.id,
    creado_en: '2026-10-01T00:00:00Z',
    asignaciones: [],
    media: [],
    con_seguro: false,
  };
}

function makeDetail(order: WorkOrder): WorkOrderDetailApi {
  return {
    order,
    orderSede: SEDE_CENTRO,
    loading: false,
    loadError: '',
    notFound: false,
    busy: false,
    error: '',
    isAdmin: true,
    isDelivered: false,
    isComplete: false,
    canEdit: true,
    canResign: false,
    canSign: false,
    canEditProgress: true,
    canCompleteLabor: true,
    canCompleteLaborItem: () => true,
    canDeliver: false,
    canArchive: false,
    isArchived: false,
    canEditLines: true,
    canSendReport: false,
    canProgramNextService: false,
    canSuggestNextService: false,
    canWithdraw: false,
    canMarkReady: false,
    isReadyForPickup: false,
    canRegisterAdvance: false,
    refresh: asyncNoop,
    statusEpoch: 0,
    progressDraft: '0',
    setProgressDraft: noop,
    commitProgress: noop,
    changeStatus: asyncNoop,
    markReadyForPickup: asyncNoop,
    readyNotifyOpen: false,
    closeReadyNotify: noop,
    toggleArchived: asyncNoop,
    updateInsurance: asyncNoop,
    savingDamageMarks: false,
    updateDamageMarks: asyncNoop,
    savingSignature: false,
    saveSignature: asyncNoop,
    commissionEstimate: null,
    lockedLaborIds: new Set(),
    paidPools: new Set(),
    approveCommission: asyncFalse,
    delivering: false,
    startDelivery: noop,
    cancelDelivery: noop,
    finishDelivery: asyncNoop,
    withdrawing: false,
    startWithdrawal: noop,
    cancelWithdrawal: noop,
    finishWithdrawal: asyncNoop,
    advancing: false,
    startAdvance: noop,
    cancelAdvance: noop,
    finishAdvance: asyncNoop,
    applyDiscount: asyncNoop,
    open: asyncNoop,
    close: noop,
    requestedTab: null,
    userId: ADMIN_USER.id,
    technicians: [],
    orderOperators: [],
    laborTimes: [],
    toggleLaborComplete: asyncNoop,
    addLabor: asyncFalse,
    updateLabor: asyncFalse,
    removeLabor: asyncNoop,
    assignLaborTechnician: asyncNoop,
    changeLaborSpecialty: asyncNoop,
    startClock: asyncNoop,
    stopClock: asyncNoop,
    correctTime: asyncNoop,
    deleteTime: asyncNoop,
    addPart: asyncFalse,
    updatePart: asyncFalse,
    removePart: asyncNoop,
    setPartOrderState: asyncNoop,
    addAssignment: asyncNoop,
    setAssignmentInSplit: asyncNoop,
    removeAssignment: asyncNoop,
    publishingProgress: null,
    toggleProgressVisibility: asyncNoop,
    confirmPublishProgress: asyncNoop,
    cancelPublishProgress: noop,
    addProgressUpdate: asyncFalse,
    removeProgressUpdate: asyncNoop,
    enqueueMedia: noop,
    addReceptionMedia: noop,
    toggleMediaVisibility: asyncNoop,
    deleteMedia: asyncNoop,
    pendingUploads: [],
    reportFinding: asyncFalse,
    quoteFinding: async () => null,
    discardFinding: asyncFalse,
    generatingPdf: false,
    generatePdf: asyncNoop,
    preparingShare: false,
    share: null,
    shareReport: asyncNoop,
    closeShare: noop,
  } satisfies WorkOrderDetailApi;
}

describe('InspectionSection', () => {
  const sectionProps = { sectionId: 'inspection', open: true, onToggle: noop };

  it('no pinta párrafo de notas cuando inspeccion_360_notas está vacío o solo tiene espacios', () => {
    const emptyOrder = makeOrder('');
    const { container, rerender } = renderWithProviders(
      <InspectionSection
        order={emptyOrder}
        detail={makeDetail(emptyOrder)}
        sectionProps={sectionProps}
        onQuotePointPrefill={noop}
      />
    );
    expect(container.querySelector('.card > p')).toBeNull();

    const blankOrder = makeOrder('   \n  ');
    rerender(
      <InspectionSection
        order={blankOrder}
        detail={makeDetail(blankOrder)}
        sectionProps={sectionProps}
        onQuotePointPrefill={noop}
      />
    );
    expect(container.querySelector('.card > p')).toBeNull();
  });

  it('pinta las notas de inspección cuando tienen texto', () => {
    const notedOrder = makeOrder('Rayón en puerta');
    const { container } = renderWithProviders(
      <InspectionSection
        order={notedOrder}
        detail={makeDetail(notedOrder)}
        sectionProps={sectionProps}
        onQuotePointPrefill={noop}
      />
    );
    expect(container.querySelector('.card > p')).not.toBeNull();
    expect(screen.getByText('Rayón en puerta')).toBeInTheDocument();
  });
});
