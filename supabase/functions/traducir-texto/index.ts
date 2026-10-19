// Traduce la nota corta del sticker de próximo servicio al idioma pedido (es o en).
// Solo un administrador autenticado puede llamar esta función. No toca la base de datos.
import { corsHeaders, jsonResponse, resolveAdminCaller } from '../_shared/caller.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await resolveAdminCaller(req, 'traducir textos');
    if (auth instanceof Response) return auth;

    const body = await req.json().catch(() => ({}));
    const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
    const idioma = body.idioma;

    if (!texto || texto.length > 300 || (idioma !== 'es' && idioma !== 'en')) {
      return jsonResponse({ error: 'Parámetros inválidos: se requiere texto (1 a 300 caracteres) e idioma ("es" o "en").' }, 400);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return jsonResponse({ error: 'GEMINI_API_KEY no configurada.', code: 'not_configured' }, 503);
    }

    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';
    const targetLang = idioma === 'en' ? 'inglés' : 'español';

    const prompt = {
      contents: [{
        parts: [{ text: texto }]
      }],
      systemInstruction: {
        parts: [{
          text: `Eres un traductor técnico de un taller automotriz. Traduce la siguiente nota corta de un sticker de servicio al idioma ${targetLang}. Si la nota ya está en ese idioma o es una marca/término propio, devuélvela igual. Devuelve estrictamente un objeto JSON con la forma {"texto": "..."}. No incluyas markdown ni explicaciones adicionales.`
        }]
      },
      generationConfig: {
        responseMimeType: 'application/json'
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(prompt),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      return jsonResponse({ error: `Error de conexión con Gemini: ${(fetchErr as Error).message || fetchErr}` }, 502);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return jsonResponse({ error: `Gemini HTTP ${res.status}: ${errText.slice(0, 300)}` }, 502);
    }

    const resJson = await res.json().catch(() => ({}));
    const rawContent = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      return jsonResponse({ error: 'Gemini no devolvió texto en el formato esperado.' }, 502);
    }

    let resultTexto = '';
    try {
      const parsed = JSON.parse(rawContent);
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
});
