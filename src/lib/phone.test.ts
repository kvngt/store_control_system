import { describe, it, expect } from 'vitest';
import { isOptionalEmailValid, isValidEmail } from './email';
import { formatPhone, looksIncomplete, parsePhone, telUrl, toE164, toWhatsAppNumber, whatsAppUrl } from './phone';
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

  // Antes se contaban los dígitos también con "+", y un número internacional de diez dígitos
  // recibía el 1 de EE. UU. encima: WhatsApp abría otro número.
  it('un número con + no recibe el prefijo de EE. UU. aunque sea corto', () => {
    expect(toWhatsAppNumber('+53 5123 4567')).toBe('5351234567');
    expect(toWhatsAppNumber('+5351234567')).toBe('5351234567');
  });
});

describe('país del teléfono', () => {
  it('guarda en formato internacional', () => {
    expect(toE164('US', '(512) 555-0100')).toBe('+15125550100');
    expect(toE164('MX', '55 1234 5678')).toBe('+525512345678');
    expect(toE164('GT', '5123-4567')).toBe('+50251234567');
  });

  it('sin número no guarda un "+1" suelto', () => {
    // Un "+1" a solas pasaría el "requerido" del formulario sin haber teléfono.
    expect(toE164('US', '')).toBe('');
    expect(toE164('MX', '  ')).toBe('');
  });

  it('lee el país de vuelta del número guardado', () => {
    expect(parsePhone('+525512345678')).toEqual({ iso: 'MX', national: '5512345678' });
    expect(parsePhone('+50251234567')).toEqual({ iso: 'GT', national: '51234567' });
    expect(parsePhone('+15125550100')).toEqual({ iso: 'US', national: '5125550100' });
  });

  // Comparten el +1 con EE. UU.: el código de área es lo que los distingue.
  it('distingue Puerto Rico y República Dominicana por el código de área', () => {
    expect(parsePhone('+17875550100').iso).toBe('PR');
    expect(parsePhone('+18095550100').iso).toBe('DO');
    expect(parsePhone('+15125550100').iso).toBe('US');
  });

  it('un número guardado antes del selector se lee como de EE. UU. sin reescribirlo', () => {
    expect(parsePhone('3015550123')).toEqual({ iso: 'US', national: '3015550123' });
    expect(parsePhone('1-301-555-0123')).toEqual({ iso: 'US', national: '3015550123' });
    expect(parsePhone('')).toEqual({ iso: 'US', national: '' });
  });

  it('ida y vuelta sin perder nada', () => {
    for (const [iso, national] of [['US', '5125550100'], ['MX', '5512345678'], ['CU', '51234567'], ['DO', '8095550100']]) {
      expect(parsePhone(toE164(iso, national))).toEqual({ iso, national });
    }
  });

  it('se lee con formato en pantalla', () => {
    expect(formatPhone('+15125550100')).toBe('+1 (512) 555-0100');
    expect(formatPhone('+525512345678')).toBe('+52 55 1234 5678');
    expect(formatPhone('+50251234567')).toBe('+502 5123 4567');
  });

  // "55550899" no es un número de EE. UU.: formatearlo sería inventarle el país.
  it('un número viejo sin + se muestra tal cual', () => {
    expect(formatPhone('55550899')).toBe('55550899');
    expect(formatPhone(null)).toBe('');
  });

  it('avisa si un número de +1 no tiene diez dígitos', () => {
    expect(looksIncomplete('US', '512555010')).toBe(true);
    expect(looksIncomplete('US', '5125550100')).toBe(false);
    expect(looksIncomplete('US', '')).toBe(false);
    // Otros países tienen largos distintos; ahí no se adivina.
    expect(looksIncomplete('GT', '51234567')).toBe(false);
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
