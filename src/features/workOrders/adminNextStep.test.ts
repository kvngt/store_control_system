import { describe, expect, it } from 'vitest';
import { adminNextStep, type AdminNextStepOrder } from './adminNextStep';

const line = (estado: 'borrador' | 'pendiente' | 'aprobado' | 'rechazado') => ({ estado });

const baseOrder = (overrides: Partial<AdminNextStepOrder> = {}): AdminNextStepOrder => ({
  estatus: 'recepcion',
  lista_para_entregar_en: null,
  retirada_sin_reparar: false,
  firma_ruta: 'firmas/o1.png',
  labor_items: [line('aprobado')],
  repuestos: [],
  ...overrides,
});

describe('adminNextStep (A-04)', () => {
  it('retorna null si la orden es nula o no tiene estatus', () => {
    expect(adminNextStep(null)).toBeNull();
    expect(adminNextStep(undefined)).toBeNull();
    expect(adminNextStep({})).toBeNull();
  });

  it('retorna null para orden entregada aunque falte trabajo o firma', () => {
    expect(
      adminNextStep({
        estatus: 'entregado',
        firma_ruta: null,
        labor_items: [],
        repuestos: [line('borrador')],
      })
    ).toBeNull();
  });

  it('en finalizado con lista_para_entregar_en retorna deliver si canDeliver no es false', () => {
    const order = baseOrder({
      estatus: 'finalizado',
      lista_para_entregar_en: '2026-11-24T10:00:00Z',
    });
    expect(adminNextStep(order)).toBe('deliver');
    expect(adminNextStep(order, { canDeliver: true })).toBe('deliver');
    expect(adminNextStep(order, { canDeliver: false })).toBeNull();
  });

  it('en finalizado sin lista_para_entregar_en y no retirada retorna markReady', () => {
    expect(
      adminNextStep(
        baseOrder({
          estatus: 'finalizado',
          lista_para_entregar_en: null,
          retirada_sin_reparar: false,
        })
      )
    ).toBe('markReady');
  });

  it('en finalizado retirada sin reparar sin lista_para_entregar_en retorna null', () => {
    expect(
      adminNextStep(
        baseOrder({
          estatus: 'finalizado',
          lista_para_entregar_en: null,
          retirada_sin_reparar: true,
        })
      )
    ).toBeNull();
  });

  it('precedencia en estados abiertos (recepcion, en_proceso, espera_autorizacion): sin trabajo -> addWork', () => {
    for (const estatus of ['recepcion', 'en_proceso', 'espera_autorizacion']) {
      expect(
        adminNextStep(
          baseOrder({
            estatus,
            labor_items: [],
            firma_ruta: null,
            repuestos: [line('borrador')],
          })
        )
      ).toBe('addWork');
    }
  });

  it('precedencia en estados abiertos: con trabajo y sin firma -> sign (si canSign !== false)', () => {
    for (const estatus of ['recepcion', 'en_proceso', 'espera_autorizacion']) {
      const order = baseOrder({
        estatus,
        labor_items: [line('borrador')],
        firma_ruta: null,
      });
      expect(adminNextStep(order)).toBe('sign');
      expect(adminNextStep(order, { canSign: true })).toBe('sign');
    }
  });

  it('si no puede firmar (canSign: false) y hay algo borrador/pendiente, pasa a authorize', () => {
    const order = baseOrder({
      estatus: 'recepcion',
      labor_items: [line('borrador')],
      firma_ruta: null,
    });
    expect(adminNextStep(order, { canSign: false })).toBe('authorize');
  });

  it('con trabajo y firma, borrador o pendiente en mano de obra o repuestos -> authorize', () => {
    expect(
      adminNextStep(
        baseOrder({
          estatus: 'recepcion',
          labor_items: [line('borrador')],
        })
      )
    ).toBe('authorize');

    expect(
      adminNextStep(
        baseOrder({
          estatus: 'espera_autorizacion',
          labor_items: [line('aprobado')],
          repuestos: [line('pendiente')],
        })
      )
    ).toBe('authorize');
  });

  it('con trabajo aprobado/rechazado, con firma y sin pendientes -> null', () => {
    expect(
      adminNextStep(
        baseOrder({
          estatus: 'en_proceso',
          labor_items: [line('aprobado')],
          repuestos: [line('rechazado')],
        })
      )
    ).toBeNull();
  });
});
