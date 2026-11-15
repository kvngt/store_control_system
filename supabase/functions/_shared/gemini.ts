// Cliente compartido de Gemini para pedir respuestas JSON estructuradas desde las edge functions.
import { type FetchFn, fetchConTope } from './http.ts';

// El modelo se elige con GEMINI_MODEL: Google retira modelos (el `gemini-1.5-flash` que estaba
// aquí ya no existe) y cambiarlo no debe exigir un despliegue.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export interface GeminiJsonRequest {
  apiKey: string;
  model?: string;
  systemInstruction: string;
  userText: string;
  timeoutMs?: number;
}

export type GeminiJsonResult =
  | { ok: true; texto: string }
  | { ok: false; status: number; detalle: string };

export async function pedirJsonAGemini(
  fetchFn: FetchFn,
  { apiKey, model, systemInstruction, userText, timeoutMs }: GeminiJsonRequest,
): Promise<GeminiJsonResult> {
  const resolvedModel = model || DEFAULT_GEMINI_MODEL;
  const prompt = {
    contents: [{
      parts: [{ text: userText }],
    }],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  // La llave va en el encabezado, no en la URL, para que no quede en los registros de nadie.
  const res = await fetchConTope(
    fetchFn,
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(prompt),
    },
    timeoutMs,
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      detalle: `Gemini HTTP ${res.status}: ${errText.slice(0, 300)}`,
    };
  }

  const body = await res.json().catch(() => ({}));
  const texto = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof texto !== 'string' || !texto) {
    return {
      ok: false,
      status: res.status,
      detalle: 'Gemini no devolvió texto en el formato esperado.',
    };
  }

  return { ok: true, texto };
}
