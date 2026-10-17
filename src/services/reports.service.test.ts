import { describe, it, expect } from 'vitest';
import { reportsService } from './reports.service';
import type { WorkOrder } from '../types/database';

describe('reportsService.buildMessage', () => {
  it('builds message in Spanish for Spanish speaking customer', () => {
    const order = {
      numero_orden: 'OT-001',
      cliente: {
        nombre: 'Carlos Perez',
        idioma: 'es',
      },
      vehiculo: {
        anio: 2021,
        marca: 'Toyota',
        modelo: 'Corolla',
      },
    } as unknown as WorkOrder;

    const message = reportsService.buildMessage(order, 'https://restorifyauto.net/r/token123', 'Taller Central');
    expect(message).toContain('Hola Carlos,');
    expect(message).toContain('OT-001');
    expect(message).toContain('(2021 Toyota Corolla)');
    expect(message).toContain('https://restorifyauto.net/r/token123');
    expect(message).toContain('Taller Central');
  });

  it('builds message in English for English speaking customer', () => {
    const order = {
      numero_orden: 'OT-002',
      cliente: {
        nombre: 'John Doe',
        idioma: 'en',
      },
      vehiculo: {
        anio: 2022,
        marca: 'Ford',
        modelo: 'F-150',
      },
    } as unknown as WorkOrder;

    const message = reportsService.buildMessage(order, 'https://restorifyauto.net/r/token456', 'Main Shop');
    expect(message).toContain('Hi John,');
    expect(message).toContain('OT-002');
    expect(message).toContain('(2022 Ford F-150)');
    expect(message).toContain('https://restorifyauto.net/r/token456');
    expect(message).toContain('Main Shop');
  });

  it('handles customer without name in Spanish and English', () => {
    const orderEs = {
      numero_orden: 'OT-003',
      cliente: {
        idioma: 'es',
      },
    } as unknown as WorkOrder;
    const msgEs = reportsService.buildMessage(orderEs, 'https://restorifyauto.net/r/tok');
    expect(msgEs).toContain('Hola,');

    const orderEn = {
      numero_orden: 'OT-004',
      cliente: {
        idioma: 'en',
      },
    } as unknown as WorkOrder;
    const msgEn = reportsService.buildMessage(orderEn, 'https://restorifyauto.net/r/tok');
    expect(msgEn).toContain('Hi,');
  });
});
