// Traduce la nota corta del sticker de próximo servicio al idioma pedido (es o en).
// Solo un administrador autenticado puede llamar esta función. No toca la base de datos.
import {
  type AdminCallerDeps,
  corsHeaders,
  defaultAdminCallerDeps,
  jsonResponse,
  readJsonBody,
  resolveAdminCaller,
} from '../_shared/caller.ts';
import { DEFAULT_GEMINI_MODEL, pedirJsonAGemini } from '../_shared/gemini.ts';
import { type FetchFn } from '../_shared/http.ts';

export type { FetchFn };

export interface Deps extends Required<AdminCallerDeps> {
  fetch: FetchFn;
}

export function defaultDeps(): Deps {
  return {
    ...defaultAdminCallerDeps(),
    fetch: (input, init) => globalThis.fetch(input, init),
  };
}

export async function handler(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await resolveAdminCaller(req, 'traducir textos', deps);
    if (auth instanceof Response) return auth;

    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
    const idioma = body.idioma;

    if (!texto || texto.length > 300 || (idioma !== 'es' && idioma !== 'en')) {
      return jsonResponse({ error: 'Parámetros inválidos: se requiere texto (1 a 300 caracteres) e idioma ("es" o "en").' }, 400);
    }

    const apiKey = deps.getEnv('GEMINI_API_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY no configurada.', code: 'not_configured' }, 503);
    }

    const model = deps.getEnv('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
    const targetLang = idioma === 'en' ? 'inglés' : 'español';

    let gemini: Awaited<ReturnType<typeof pedirJsonAGemini>>;
    try {
      gemini = await pedirJsonAGemini(deps.fetch, {
        apiKey,
        model,
        systemInstruction: `Eres un traductor técnico de un taller automotriz. Traduce la siguiente nota corta de un sticker de servicio al idioma ${targetLang}. Si la nota ya está en ese idioma o es una marca/término propio, devuélvela igual. Devuelve estrictamente un objeto JSON con la forma {"texto": "..."}. No incluyas markdown ni explicaciones adicionales.`,
        userText: texto,
        timeoutMs: 8000,
      });
    } catch (fetchErr) {
      return jsonResponse({ error: `Error de conexión con Gemini: ${(fetchErr as Error).message || fetchErr}` }, 502);
    }

    if (!gemini.ok) {
      return jsonResponse({ error: gemini.detalle }, 502);
    }

    let resultTexto = '';
    try {
      const parsed = JSON.parse(gemini.texto);
      resultTexto = typeof parsed.texto === 'string' ? parsed.texto.trim() : '';
    } catch {
      return jsonResponse({ error: 'Respuesta JSON inválida de Gemini.' }, 502);
    }

    if (!resultTexto) {
      return jsonResponse({ error: 'Gemini devolvió una traducción vacía.' }, 502);
    }

    return jsonResponse({ texto: resultTexto.slice(0, 300) }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || 'Error inesperado.' }, 500);
  }
}

