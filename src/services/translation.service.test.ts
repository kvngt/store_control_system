import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: { getSession: mocks.getSession, refreshSession: mocks.refreshSession },
  },
}));

const { translateText, translationService } = await import('./translation.service');

const session = (access_token: string | null) => ({
  data: { session: access_token ? { access_token } : null },
});

describe('translationService (E8)', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.getSession.mockReset().mockResolvedValue(session('jwt-vigente'));
    mocks.refreshSession.mockReset().mockResolvedValue(session(null));
  });

  it('invoca traducir-texto con el texto e idioma y devuelve el texto traducido', async () => {
    mocks.invoke.mockResolvedValue({
      data: { texto: 'Synthetic oil' },
      error: null,
    });

    const resultado = await translateText('Aceite sintético', 'en');
    expect(resultado).toBe('Synthetic oil');
    expect(mocks.invoke).toHaveBeenCalledWith('traducir-texto', {
      body: { texto: 'Aceite sintético', idioma: 'en' },
      headers: { Authorization: 'Bearer jwt-vigente' },
    });
  });

  it('lanza error cuando la edge function responde con error', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(JSON.stringify({ error: 'GEMINI_API_KEY no configurada.', code: 'not_configured' }), { status: 503 }),
      }),
    });

    await expect(translationService.translateText('Frenos', 'en')).rejects.toThrow();
  });
});
