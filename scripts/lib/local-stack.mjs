// Utilidades compartidas para scripts que corren contra el Supabase LOCAL.
//
// Toma URL y llaves de `supabase status` (o E2E_SUPABASE_* si el stack usa otro puerto),
// rechaza cualquier URL que no sea de esta máquina, comprueba que Auth responde, y
// asegura las dos sedes y cuatro cuentas de prueba con contraseña nueva por corrida.
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

function statusEnv() {
  try {
    return execSync('npx -y supabase@3 status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

export async function localStack() {
  const env = statusEnv();
  const pick = (name) => new RegExp(`^${name}="?([^"\\r\\n]+)"?`, 'm').exec(env)?.[1];

  const apiUrl = (process.env.E2E_SUPABASE_URL || pick('API_URL') || '').replace(/\/+$/, '');
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY || pick('ANON_KEY');
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || pick('SERVICE_ROLE_KEY');

  if (!apiUrl || !anonKey || !serviceKey) {
    console.error('No encontré el Supabase local. Levántalo con `npx supabase start` (o pasa E2E_SUPABASE_URL y las llaves).');
    process.exit(1);
  }
  if (!LOCAL.test(apiUrl)) {
    console.error(`E2E_SUPABASE_URL=${apiUrl} no es de esta máquina: esta suite solo corre contra la base local.`);
    process.exit(1);
  }
  try {
    await fetch(`${apiUrl}/auth/v1/health`, { headers: { apikey: anonKey } });
  } catch {
    console.error(`El Supabase local no responde en ${apiUrl}. Si tu stack usa otro puerto, pásalo con E2E_SUPABASE_URL.`);
    process.exit(1);
  }

  const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  async function rest(path, init = {}) {
    const res = await fetch(`${apiUrl}${path}`, { ...init, headers: { ...admin, ...(init.headers ?? {}) } });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${text.slice(0, 300)}`);
    return body;
  }

  return { apiUrl, anonKey, serviceKey, rest };
}

export async function ensureTestAccounts({ rest }) {
  // Dos sedes: las que ya haya, o se crean.
  let sedes = await rest('/rest/v1/sedes?select=id,nombre&order=fecha_creacion.asc&limit=2');
  for (let i = sedes.length; i < 2; i++) {
    const [nueva] = await rest('/rest/v1/sedes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ nombre: `PWTEST Sede ${i + 1}`, direccion: 'Local' }),
    });
    sedes.push(nueva);
  }

  const password = `Pw-${randomBytes(12).toString('base64url')}`;
  const definiciones = [
    { key: 'ADMIN', email: 'e2e-admin@restorify.test', rol: 'admin', nombre: 'PWTEST Admin', sede: sedes[0].id },
    { key: 'MECHANIC', email: 'e2e-mecanico@restorify.test', rol: 'mecanico', nombre: 'PWTEST Mecánico', sede: sedes[0].id },
    { key: 'PAINTER', email: 'e2e-pintor@restorify.test', rol: 'pintor', nombre: 'PWTEST Pintor', sede: sedes[0].id },
    { key: 'BRANCH_ADMIN', email: 'e2e-admin-b@restorify.test', rol: 'admin', nombre: 'PWTEST Admin B', sede: sedes[1].id },
  ];

  const existentes = (await rest('/auth/v1/admin/users?per_page=1000')).users ?? [];
  const cuentas = [];
  for (const c of definiciones) {
    let user = existentes.find((u) => u.email === c.email);
    if (user) {
      user = await rest(`/auth/v1/admin/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ password }) });
    } else {
      user = await rest('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: c.email, password, email_confirm: true }),
      });
    }
    await rest('/rest/v1/perfiles?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: user.id, nombre_completo: c.nombre, rol: c.rol, sede_id: c.sede, email: c.email }),
    });
    cuentas.push({ ...c, id: user.id });
  }

  return { password, cuentas, sedes };
}

/**
 * Asegura al menos una sede y crea o pone al día las cuentas indicadas en la primera sede,
 * con una contraseña aleatoria nueva por corrida.
 */
export async function ensureAccountsInFirstSede({ rest }, definitions, { defaultSede } = {}) {
  let sedes = await rest('/rest/v1/sedes?select=id,nombre&order=fecha_creacion.asc&limit=1');
  if (sedes.length === 0) {
    const [nueva] = await rest('/rest/v1/sedes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        nombre: defaultSede?.nombre ?? 'Restorify Demo',
        direccion: defaultSede?.direccion ?? 'Local',
        telefono: defaultSede?.telefono ?? '+14105550100',
      }),
    });
    sedes.push(nueva);
  }

  const sede = sedes[0];
  const password = `Dm-${randomBytes(12).toString('base64url')}`;
  const existentes = (await rest('/auth/v1/admin/users?per_page=1000')).users ?? [];
  const cuentas = [];

  for (const c of definitions) {
    let user = existentes.find((u) => (u.email || '').toLowerCase() === c.email.toLowerCase());
    if (user) {
      user = await rest(`/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ password }),
      });
    } else {
      user = await rest('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: c.email, password, email_confirm: true }),
      });
    }
    await rest('/rest/v1/perfiles?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: user.id,
        nombre_completo: c.nombre,
        rol: c.rol,
        sede_id: sede.id,
        email: c.email,
      }),
    });
    cuentas.push({ ...c, id: user.id, sede_id: sede.id });
  }

  return { password, cuentas, sede };
}
