import { describe, it, expect } from 'vitest';
import { EMAIL_RE, isOptionalEmailValid, isValidEmail } from './email';

describe('email validation', () => {
  it('acepta correos válidos incluyendo subdominios y más', () => {
    expect(EMAIL_RE.test('ana+taller@restorify.us')).toBe(true);
    expect(isValidEmail('  juan@sub.dominio.mx  ')).toBe(true);
  });

  it('rechaza TLD de 1 letra, espacios o formatos incompletos', () => {
    expect(isValidEmail('juan@dominio.c')).toBe(false);
    expect(isValidEmail('juan@dominio')).toBe(false);
    expect(isValidEmail('sin-arroba.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('permite vacío cuando el correo es opcional', () => {
    expect(isOptionalEmailValid('')).toBe(true);
    expect(isOptionalEmailValid('   ')).toBe(true);
    expect(isOptionalEmailValid(null)).toBe(true);
    expect(isOptionalEmailValid('malo@ejemplo.x')).toBe(false);
  });
});
