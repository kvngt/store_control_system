import { describe, it, expect } from 'vitest';
import { buildCustomerShareMessage, customerCanReceiveEmail, staffPortalUrl } from './portalShare';

describe('portalShare', () => {
  it('staffPortalUrl agrega ?vista=taller sin duplicarlo', () => {
    expect(staffPortalUrl('')).toBe('');
    expect(staffPortalUrl('https://restorifyauto.net/r/abc')).toBe('https://restorifyauto.net/r/abc?vista=taller');
    expect(staffPortalUrl('https://restorifyauto.net/r/abc?x=1')).toBe('https://restorifyauto.net/r/abc?x=1&vista=taller');
    expect(staffPortalUrl('https://restorifyauto.net/r/abc?vista=taller')).toBe('https://restorifyauto.net/r/abc?vista=taller');
  });

  it('customerCanReceiveEmail verifica correo válido y acepta_correos', () => {
    expect(customerCanReceiveEmail({ email: 'marta@example.com', acepta_correos: true })).toBe(true);
    expect(customerCanReceiveEmail({ email: 'marta@example.com', acepta_correos: false })).toBe(false);
    expect(customerCanReceiveEmail({ email: '', acepta_correos: true })).toBe(false);
    expect(customerCanReceiveEmail(null)).toBe(false);
  });

  it('buildCustomerShareMessage formatea en el idioma del cliente y limpia comas si falta el nombre', () => {
    const esMsg = buildCustomerShareMessage(
      { numero_orden: 'RO-12', cliente: { nombre: 'Marta Pérez', idioma: 'es' } },
      'https://restorifyauto.net/r/tok'
    );
    expect(esMsg).toContain('Marta');
    expect(esMsg).toContain('RO-12');
    expect(esMsg).toContain('https://restorifyauto.net/r/tok');

    const enMsg = buildCustomerShareMessage(
      { numero_orden: 'RO-12', cliente: { nombre: '', idioma: 'en' } },
      'https://restorifyauto.net/r/tok'
    );
    expect(enMsg).not.toContain(' ,');
    expect(enMsg).toContain('RO-12');
  });
});
