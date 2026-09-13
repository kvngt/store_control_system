// El reporte web del cliente: reinventa.shop/r/<token> lo pide aquí.
//
// Pública (verify_jwt = false): el cliente no tiene cuenta. Lo que la protege es el
// token — 64 hexadecimales imposibles de adivinar, revocable, con vencimiento — y
// que lo que devuelve lo arma `datos_portal` campo por campo en la base.
//
//   GET  ?token=<token>                                   → el reporte
//   POST { token, accion: 'preferencia_correos', acepta }  → alta o baja de correos
//
// La llave de servicio vive solo aquí. El navegador nunca la ve.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const TOKEN_RE = /^[0-9a-f]{64}$/;
const MEDIA_BUCKET = 'orden_media';
/** Suficiente para ver con calma; si la página queda abierta más, vuelve a pedir. */
const SIGNED_URL_TTL_SECONDS = 2 * 60 * 60;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      // Datos de una persona: ni caché compartida ni buscadores.
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

interface PortalMediaRow {
  id: string;
  tipo: string;
  origen: string;
  zona: string | null;
  ruta: string;
  ruta_miniatura: string | null;
  mime: string;
  duracion_seg: number | null;
  ancho: number | null;
  alto: number | null;
  creado_en: string;
}

interface PortalData {
  estado_enlace: 'ok' | 'no_encontrado' | 'revocado' | 'vencido';
  orden?: Record<string, unknown> & { firma_ruta?: string | null };
  multimedia?: PortalMediaRow[];
  [key: string]: unknown;
}

/** Cambia cada ruta de Storage por una URL firmada. Las rutas nunca salen. */
async function withSignedUrls(data: PortalData): Promise<PortalData> {
  const media = data.multimedia ?? [];
  const firma = data.orden?.firma_ruta ?? null;

  const paths = new Set<string>();
  for (const m of media) {
    paths.add(m.ruta);
    if (m.ruta_miniatura) paths.add(m.ruta_miniatura);
  }
  if (firma) paths.add(firma);

  const urls = new Map<string, string>();
  if (paths.size > 0) {
    const { data: signed, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
  }

  const { firma_ruta: _omit, ...orden } = data.orden ?? {};
  return {
    ...data,
    orden: { ...orden, firma_url: firma ? urls.get(firma) ?? null : null },
    // Un archivo cuya URL no se pudo firmar (se borró entre la consulta y la firma)
    // simplemente no se muestra.
    multimedia: media
      .filter((m) => urls.has(m.ruta))
      .map(({ ruta, ruta_miniatura, ...rest }) => ({
        ...rest,
        url: urls.get(ruta)!,
        miniatura_url: ruta_miniatura ? urls.get(ruta_miniatura) ?? null : null,
      })) as unknown as PortalMediaRow[],
    urls_vencen_en: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

async function handleGet(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!TOKEN_RE.test(token)) return respond({ estado_enlace: 'no_encontrado' }, 404);

  const { data, error } = await supabase.rpc('datos_portal', { p_token: token });
  if (error) {
    console.error('datos_portal', error.message);
    return respond({ error: 'No se pudo cargar el reporte.' }, 500);
  }

  const portal = data as PortalData;
  if (portal.estado_enlace === 'no_encontrado') return respond(portal, 404);
  if (portal.estado_enlace !== 'ok') return respond(portal, 410);

  try {
    return respond(await withSignedUrls(portal));
  } catch (err) {
    console.error('firmar URLs', err instanceof Error ? err.message : err);
    return respond({ error: 'No se pudo cargar el reporte.' }, 500);
  }
}

async function handlePost(req: Request): Promise<Response> {
  let body: { token?: unknown; accion?: unknown; acepta?: unknown };
  try {
    body = await req.json();
  } catch {
    return respond({ error: 'Solicitud inválida.' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token : '';
  if (!TOKEN_RE.test(token)) return respond({ ok: false }, 404);

  if (body.accion === 'preferencia_correos' && typeof body.acepta === 'boolean') {
    const { data, error } = await supabase.rpc('preferencia_correos_portal', {
      p_token: token,
      p_acepta: body.acepta,
    });
    if (error) {
      console.error('preferencia_correos_portal', error.message);
      return respond({ error: 'No se pudo guardar la preferencia.' }, 500);
    }
    const result = data as { ok: boolean };
    return respond(result, result.ok ? 200 : 404);
  }

  return respond({ error: 'Acción no válida.' }, 400);
}

Deno.serve(async (req) => {
  switch (req.method) {
    case 'OPTIONS':
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    case 'GET':
      return handleGet(req);
    case 'POST':
      return handlePost(req);
    default:
      return respond({ error: 'Método no permitido.' }, 405);
  }
});
