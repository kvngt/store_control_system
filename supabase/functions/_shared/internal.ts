// Autenticación de las funciones internas (las que llama la propia base con
// pg_net y pg_cron, nunca el navegador).
//
// Se despliegan con `verify_jwt = false` (ver supabase/config.toml) y se
// protegen con un secreto compartido: la base lo lee de Vault
// (`restorify_functions_secret`) y la función lo compara con el suyo
// (`RESTORIFY_FUNCTIONS_SECRET`). Un JWT no sirve aquí — pg_cron no tiene
// sesión de nadie.

/** Comparación en tiempo constante: no filtra por cuánto tarda cuántos caracteres coinciden. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorizedInternalCall(req: Request): boolean {
  const expected = Deno.env.get('RESTORIFY_FUNCTIONS_SECRET');
  const received = req.headers.get('x-restorify-secret');
  // Sin secreto configurado la función no atiende a nadie, en vez de a todos.
  if (!expected || !received) return false;
  return safeEqual(expected, received);
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
