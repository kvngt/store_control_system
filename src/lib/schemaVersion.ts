import { supabase } from './supabase';

/**
 * Guards against the app and its database drifting apart.
 *
 * The failure this exists for: a build was deployed whose migrations had never
 * been pushed. The Comisiones screen, deleting a sede and sending a report all
 * broke, each with a different message, none of which said "the database is
 * behind". Somebody had to read three error strings and work backwards to one
 * missing `supabase db push`.
 *
 * The expected version is derived from the migrations folder at build time
 * rather than written down by hand, so it cannot be forgotten: adding a
 * migration file is what moves it.
 */
declare const __SCHEMA_VERSION__: string | undefined;

/**
 * The newest migration present in the source tree this bundle was built from,
 * stamped in by `vite.config.ts`.
 *
 * `typeof` rather than a bare read: under Vitest the constant is not defined,
 * and an undeclared identifier would throw. An empty value turns the check off
 * instead, which is the right behaviour when there is nothing to compare.
 */
export const EXPECTED_SCHEMA_VERSION =
  typeof __SCHEMA_VERSION__ === 'string' ? __SCHEMA_VERSION__ : '';

export type SchemaStatus =
  /** The database carries every migration this build knows about. */
  | { state: 'ok' }
  /** Migrations are missing: features in this build will fail at the button. */
  | { state: 'database-behind'; expected: string; actual: string }
  /**
   * The database is ahead. Harmless far more often than not — someone pushed
   * migrations and this browser tab is still on the previous bundle — but worth
   * saying, because a stale tab is the other half of the same confusion.
   */
  | { state: 'app-behind'; expected: string; actual: string }
  /** Nothing to compare, so nothing to claim. */
  | { state: 'unknown' };

/**
 * Asks the database which migration it is on and compares.
 *
 * Versions are 14-digit timestamps, so a plain string comparison orders them
 * correctly and needs no parsing.
 */
export async function checkSchemaVersion(): Promise<SchemaStatus> {
  if (!EXPECTED_SCHEMA_VERSION) return { state: 'unknown' };

  let actual: string;
  try {
    const { data, error } = await supabase.rpc('app_schema_version');
    if (error) {
      const code = (error as { code?: string }).code;
      // `app_schema_version` is itself introduced by a migration, so a database
      // that predates it answers "no such function". That is not a failure to
      // check — it is the drift, reported by its own absence.
      if (code === 'PGRST202' || code === '42883') {
        return { state: 'database-behind', expected: EXPECTED_SCHEMA_VERSION, actual: '—' };
      }
      throw error;
    }
    actual = (data as string | null) ?? '';
  } catch {
    // Offline, or the request was refused. A connectivity problem must not be
    // reported to the shop as a version problem.
    return { state: 'unknown' };
  }

  if (!actual) return { state: 'unknown' };
  if (actual === EXPECTED_SCHEMA_VERSION) return { state: 'ok' };
  return actual < EXPECTED_SCHEMA_VERSION
    ? { state: 'database-behind', expected: EXPECTED_SCHEMA_VERSION, actual }
    : { state: 'app-behind', expected: EXPECTED_SCHEMA_VERSION, actual };
}
