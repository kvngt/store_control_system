import { describe, it, expect } from 'vitest';
import { isOptionalEmailValid, isValidEmail } from './email';
import { telUrl, toWhatsAppNumber, whatsAppUrl } from './phone';
import { tokenFromPath } from '../portal/path';

describe('phone', () => {
  it('pone código de país a un número local para wa.me', () => {
    expect(toWhatsAppNumber('(512) 555-0100')).toBe('15125550100');
    expect(toWhatsAppNumber('+504 9876 5432')).toBe('50498765432');
    expect(toWhatsAppNumber('')).toBeNull();
  });

  it('arma el enlace de WhatsApp, o el selector de contactos sin número', () => {
    expect(whatsAppUrl('512 555 0100', 'Hola')).toBe('https://wa.me/15125550100?text=Hola');
    expect(whatsAppUrl(null, 'Hola')).toBe('https://wa.me/?text=Hola');
  });

  it('solo ofrece llamar a algo que parece un teléfono', () => {
    expect(telUrl('+1 (512) 555-0100')).toBe('tel:+15125550100');
    expect(telUrl('123')).toBeNull();
    expect(telUrl(null)).toBeNull();
  });
});

describe('email', () => {
  it('acepta algo@algo.algo y rechaza el error de dedo', () => {
    expect(isValidEmail('marta@example.com')).toBe(true);
    expect(isValidEmail('marta@example')).toBe(false);
    expect(isValidEmail('marta example.com')).toBe(false);
  });

  it('deja el correo vacío (es opcional) pero no uno mal escrito', () => {
    expect(isOptionalEmailValid('')).toBe(true);
    expect(isOptionalEmailValid('   ')).toBe(true);
    expect(isOptionalEmailValid('marta@')).toBe(false);
  });
});

describe('tokenFromPath', () => {
  it('saca el token de /r/<token> solo si tiene la forma de uno', () => {
    const token = 'ab12'.repeat(16);
    expect(tokenFromPath(`/r/${token}`)).toBe(token);
    expect(tokenFromPath(`/r/${token}/`)).toBe(token);
    expect(tokenFromPath('/r/corto')).toBeNull();
    expect(tokenFromPath(`/work-orders/${token}`)).toBeNull();
  });
});
