import { describe, expect, it } from 'vitest';
import { computeOrderPermissions, type PermissionsOrderInput, type PermissionsUserInput } from './permissions';

const admin: PermissionsUserInput = { id: 'admin-1', rol: 'admin' };
const tech1: PermissionsUserInput = { id: 'tech-1', rol: 'mecanico' };
const tech2: PermissionsUserInput = { id: 'tech-2', rol: 'pintor' };

const makeOrder = (overrides: Partial<PermissionsOrderInput> = {}): PermissionsOrderInput => ({
  estatus: 'en_proceso',
  asignaciones: [{ usuario_id: 'tech-1' }],
  archivada_en: null,
  lista_para_entregar_en: null,
  labor_items: [{ estado: 'aprobado' }],
  ...overrides,
});

describe('computeOrderPermissions', () => {
  it('denies everything safely when order or user is null', () => {
    const perms = computeOrderPermissions(null, null);
    expect(perms.isAdmin).toBe(false);
    expect(perms.isAssignedToMe).toBe(false);
    expect(perms.canEdit).toBe(false);
    expect(perms.canSign).toBe(false);
    expect(perms.canDeliver).toBe(false);
    expect(perms.canEditLines).toBe(false);
    expect(perms.canSendReport).toBe(false);
    expect(perms.canSuggestNextService).toBe(false);
    expect(perms.canCompleteLaborItem({ asignado_a: null })).toBe(false);

    const adminNoOrder = computeOrderPermissions(null, admin);
    expect(adminNoOrder.isAdmin).toBe(true);
    expect(adminNoOrder.canEdit).toBe(true);
    expect(adminNoOrder.canSign).toBe(true);
    expect(adminNoOrder.canArchive).toBe(false);
    expect(adminNoOrder.canResign).toBe(false);
  });

  it('grants admin full editing, signature, lines, delivery, and status flags by status', () => {
    const recepcion = computeOrderPermissions(makeOrder({ estatus: 'recepcion' }), admin);
    expect(recepcion.canEdit).toBe(true);
    expect(recepcion.canResign).toBe(true);
    expect(recepcion.canSign).toBe(true);
    expect(recepcion.canEditProgress).toBe(true);
    expect(recepcion.canEditLines).toBe(true);
    expect(recepcion.canSendReport).toBe(true);
    expect(recepcion.canProgramNextService).toBe(true);
    expect(recepcion.canSuggestNextService).toBe(false);
    expect(recepcion.canDeliver).toBe(true);
    expect(recepcion.canWithdraw).toBe(true);
    expect(recepcion.canRegisterAdvance).toBe(true);
    expect(recepcion.canMarkReady).toBe(false);
    expect(recepcion.canArchive).toBe(false);

    const finalizado = computeOrderPermissions(makeOrder({ estatus: 'finalizado' }), admin);
    expect(finalizado.isComplete).toBe(true);
    expect(finalizado.isDelivered).toBe(false);
    expect(finalizado.canEditProgress).toBe(false);
    expect(finalizado.canMarkReady).toBe(true);
    expect(finalizado.isReadyForPickup).toBe(false);
    expect(finalizado.canResign).toBe(false);

    const ready = computeOrderPermissions(
      makeOrder({ estatus: 'finalizado', lista_para_entregar_en: '2026-10-10T10:00:00Z' }),
      admin
    );
    expect(ready.canMarkReady).toBe(false);
    expect(ready.isReadyForPickup).toBe(true);

    const deliveredArchived = computeOrderPermissions(
      makeOrder({ estatus: 'entregado', archivada_en: '2026-10-11T10:00:00Z' }),
      admin
    );
    expect(deliveredArchived.isDelivered).toBe(true);
    expect(deliveredArchived.isComplete).toBe(true);
    expect(deliveredArchived.canArchive).toBe(true);
    expect(deliveredArchived.isArchived).toBe(true);
    expect(deliveredArchived.canWithdraw).toBe(false);
    expect(deliveredArchived.canRegisterAdvance).toBe(false);
    expect(deliveredArchived.canEdit).toBe(true);
  });

  it('restricts assigned technician to workshop progress, unassigned/own labor, and next-service suggestions', () => {
    const active = computeOrderPermissions(makeOrder({ estatus: 'en_proceso' }), tech1);
    expect(active.isAdmin).toBe(false);
    expect(active.isAssignedToMe).toBe(true);
    expect(active.canEdit).toBe(true);
    expect(active.canEditProgress).toBe(true);
    expect(active.canCompleteLabor).toBe(true);
    expect(active.canSuggestNextService).toBe(true);
    expect(active.canEditLines).toBe(false);
    expect(active.canSign).toBe(false);
    expect(active.canResign).toBe(false);
    expect(active.canDeliver).toBe(false);
    expect(active.canWithdraw).toBe(false);
    expect(active.canRegisterAdvance).toBe(false);
    expect(active.canSendReport).toBe(false);
    expect(active.canProgramNextService).toBe(false);
    expect(active.canMarkReady).toBe(false);
    expect(active.canArchive).toBe(false);

    expect(active.canCompleteLaborItem({ asignado_a: null })).toBe(true);
    expect(active.canCompleteLaborItem({ asignado_a: 'tech-1' })).toBe(true);
    expect(active.canCompleteLaborItem({ asignado_a: 'tech-2' })).toBe(false);

    const finalized = computeOrderPermissions(makeOrder({ estatus: 'finalizado' }), tech1);
    expect(finalized.canEdit).toBe(true);
    expect(finalized.canEditProgress).toBe(false);
    expect(finalized.canSuggestNextService).toBe(true);

    const delivered = computeOrderPermissions(makeOrder({ estatus: 'entregado' }), tech1);
    expect(delivered.canEdit).toBe(false);
    expect(delivered.canEditProgress).toBe(false);
    expect(delivered.canCompleteLabor).toBe(false);
    expect(delivered.canCompleteLaborItem({ asignado_a: 'tech-1' })).toBe(false);
    expect(delivered.canSuggestNextService).toBe(false);
  });

  it('locks down an unassigned technician and lets admin complete any item', () => {
    const unassigned = computeOrderPermissions(makeOrder({ estatus: 'en_proceso' }), tech2);
    expect(unassigned.isAssignedToMe).toBe(false);
    expect(unassigned.canEdit).toBe(false);
    expect(unassigned.canEditProgress).toBe(false);
    expect(unassigned.canCompleteLabor).toBe(false);
    expect(unassigned.canSuggestNextService).toBe(false);
    expect(unassigned.canCompleteLaborItem({ asignado_a: null })).toBe(false);
    expect(unassigned.canCompleteLaborItem({ asignado_a: 'tech-2' })).toBe(false);

    const adminPerms = computeOrderPermissions(makeOrder({ estatus: 'entregado' }), admin);
    expect(adminPerms.canCompleteLaborItem({ asignado_a: 'tech-2' })).toBe(true);
  });

  it('disables progress for assigned technician when nothing is authorized (B-02)', () => {
    const noApproved = computeOrderPermissions(
      makeOrder({ estatus: 'recepcion', labor_items: [{ estado: 'borrador' }], repuestos: [], repuestos_resumen: [] }),
      tech1
    );
    expect(noApproved.canEdit).toBe(true);
    expect(noApproved.canEditProgress).toBe(false);

    const adminNoApproved = computeOrderPermissions(
      makeOrder({ estatus: 'recepcion', labor_items: [], repuestos: [] }),
      admin
    );
    expect(adminNoApproved.canEditProgress).toBe(true);

    const partApproved = computeOrderPermissions(
      makeOrder({ estatus: 'en_proceso', labor_items: [], repuestos_resumen: [{ estado: 'aprobado' }] }),
      tech1
    );
    expect(partApproved.canEditProgress).toBe(true);
  });
});
