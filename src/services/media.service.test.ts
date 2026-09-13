import { describe, it, expect } from 'vitest';
import { resumableEndpoint } from './media.service';

describe('resumableEndpoint', () => {
  it('usa el host directo de Storage para un proyecto de Supabase', () => {
    // Supabase lo recomienda para archivos grandes: evita un salto de proxy.
    expect(resumableEndpoint('https://abcdefghijkl.supabase.co')).toBe(
      'https://abcdefghijkl.storage.supabase.co/storage/v1/upload/resumable'
    );
  });

  it('usa la URL tal cual con un dominio propio o en local', () => {
    expect(resumableEndpoint('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321/storage/v1/upload/resumable');
    expect(resumableEndpoint('https://api.reinventa.shop')).toBe('https://api.reinventa.shop/storage/v1/upload/resumable');
  });
});
