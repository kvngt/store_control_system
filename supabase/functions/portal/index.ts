// Punto de entrada de la edge function `portal`: solo arranca el servidor.
// La lógica vive en handler.ts, que es lo que importan las pruebas (index.test.ts). Las
// dependencias (cliente de Supabase, fetch, variables) se crean una vez al arrancar, como antes.
import { defaultDeps, handler } from './handler.ts';

const deps = defaultDeps();

Deno.serve((req) => handler(req, deps));
