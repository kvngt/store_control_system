// Corre la suite e2e (Playwright) contra el Supabase LOCAL, nunca contra el proyecto real.
//
//   npx supabase start            (o el stack local que ya tengas corriendo)
//   npm run test:e2e:local        (argumentos extra van a Playwright: -- e2e/login.spec.ts)
//
// Qué hace:
// 1. Toma la URL y las llaves del stack local (`supabase status`). Si tu stack responde en otro
//    puerto que el de `supabase/config.toml`, pásalo: E2E_SUPABASE_URL=http://127.0.0.1:44321.
//    Se niega a seguir si la URL no es de esta máquina.
// 2. Crea (o pone al día) las cuentas de prueba con una contraseña nueva en cada corrida: admin,
//    mecánico y pintor de una sede, y un admin de otra. Las contraseñas no se guardan en ningún lado.
// 3. Levanta la app con Vite apuntando a esa base, en su propio puerto (5174), para no reutilizar
//    un servidor de desarrollo que apunte al proyecto real, y corre Playwright con las cuentas.
//
// Con esto la suite puede crear, entregar y cobrar sin tocar datos reales.
import { spawn } from 'node:child_process';
import { ensureTestAccounts, localStack } from './lib/local-stack.mjs';

const stack = await localStack();
const { apiUrl, anonKey } = stack;
const { password, cuentas, sedes } = await ensureTestAccounts(stack);

const port = process.env.E2E_PORT || '5174';
const baseUrl = `http://localhost:${port}`;
const childEnv = {
  ...process.env,
  // Vite da prioridad a lo que ya está en el entorno sobre `.env.local`: la app habla con la base local.
  VITE_SUPABASE_URL: apiUrl,
  VITE_SUPABASE_ANON_KEY: anonKey,
  E2E_BASE_URL: baseUrl,
  E2E_LOCAL_STACK: '1',
  ...Object.fromEntries(cuentas.flatMap((c) => [[`E2E_${c.key}_EMAIL`, c.email], [`E2E_${c.key}_PASSWORD`, password]])),
};

console.log(`e2e contra ${apiUrl} · app en ${baseUrl} · sedes: ${sedes.map((s) => s.nombre).join(', ')}`);
const args = ['playwright', 'test', ...process.argv.slice(2)];
const child = spawn('npx', args, { stdio: 'inherit', env: childEnv, shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 1));
