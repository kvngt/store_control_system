// Dobles simples escritos a mano para probar las Edge Functions sin tocar red ni Supabase.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AdminCallerDeps } from './caller.ts';

export interface FromFilter {
  op: 'eq' | 'in';
  col: string;
  val: unknown;
}

export interface FromQuery {
  table: string;
  action: 'select' | 'insert' | 'update' | 'delete';
  columns?: string;
  selectOptions?: { count?: string; head?: boolean };
  payload?: unknown;
  filters: FromFilter[];
  singleMode?: 'single' | 'maybeSingle';
}

export interface RpcCall {
  fn: string;
  args?: Record<string, unknown>;
}

export interface AuthCall {
  method: 'getUser' | 'admin.createUser' | 'admin.updateUserById' | 'admin.deleteUser';
  args: unknown[];
}

export interface StorageCall {
  bucket: string;
  method: 'remove' | 'createSignedUrls';
  paths: string[];
  expiresIn?: number;
}

export interface QueryResult {
  data?: unknown;
  error?: { message: string; status?: number } | null;
  count?: number | null;
}

export interface FakeSupabaseHandlers {
  rpc?: (fn: string, args?: Record<string, unknown>) => QueryResult | Promise<QueryResult>;
  from?: (query: FromQuery) => QueryResult | undefined | Promise<QueryResult | undefined>;
  getUser?: () => { data: { user: { id: string } | null }; error: { message?: string; status?: number } | null } | Promise<{ data: { user: { id: string } | null }; error: { message?: string; status?: number } | null }>;
  createUser?: (attrs: Record<string, unknown>) => { data: { user: { id: string } | null }; error: { message: string } | null } | Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  updateUserById?: (id: string, attrs: Record<string, unknown>) => { data?: unknown; error: { message: string } | null } | Promise<{ data?: unknown; error: { message: string } | null }>;
  deleteUser?: (id: string) => { data?: unknown; error: { message: string } | null } | Promise<{ data?: unknown; error: { message: string } | null }>;
  storageRemove?: (bucket: string, paths: string[]) => { data?: unknown; error: { message: string } | null } | Promise<{ data?: unknown; error: { message: string } | null }>;
  createSignedUrls?: (
    bucket: string,
    paths: string[],
    expiresIn: number,
  ) => { data: { path: string | null; signedUrl: string | null }[] | null; error: { message: string } | null } | Promise<{ data: { path: string | null; signedUrl: string | null }[] | null; error: { message: string } | null }>;
}

export function createFakeSupabase(handlers: FakeSupabaseHandlers = {}) {
  const calls = {
    rpc: [] as RpcCall[],
    from: [] as FromQuery[],
    auth: [] as AuthCall[],
    storage: [] as StorageCall[],
  };

  const client = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.rpc.push({ fn, args });
      if (handlers.rpc) return await handlers.rpc(fn, args);
      return { data: null, error: null };
    },
    from: (table: string) => {
      const state: FromQuery = {
        table,
        action: 'select',
        filters: [],
      };
      let hasExplicitAction = false;
      let recorded = false;

      const execute = async (): Promise<QueryResult> => {
        if (!recorded) {
          recorded = true;
          calls.from.push({ ...state, filters: [...state.filters] });
        }
        if (handlers.from) {
          const result = await handlers.from(state);
          if (result !== undefined) return result;
        }
        return { data: null, error: null, count: null };
      };

      const builder = {
        select(columns?: string, options?: { count?: string; head?: boolean }) {
          if (!hasExplicitAction) {
            state.action = 'select';
            hasExplicitAction = true;
          }
          state.columns = columns;
          state.selectOptions = options;
          return builder;
        },
        insert(payload: unknown) {
          state.action = 'insert';
          hasExplicitAction = true;
          state.payload = payload;
          return builder;
        },
        update(payload: unknown) {
          state.action = 'update';
          hasExplicitAction = true;
          state.payload = payload;
          return builder;
        },
        delete() {
          state.action = 'delete';
          hasExplicitAction = true;
          return builder;
        },
        eq(col: string, val: unknown) {
          state.filters.push({ op: 'eq', col, val });
          return builder;
        },
        in(col: string, val: unknown) {
          state.filters.push({ op: 'in', col, val });
          return builder;
        },
        single() {
          state.singleMode = 'single';
          return builder;
        },
        maybeSingle() {
          state.singleMode = 'maybeSingle';
          return builder;
        },
        then<TResult1 = QueryResult, TResult2 = never>(
          onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
          return execute().then(onfulfilled, onrejected);
        },
      };

      return builder;
    },
    auth: {
      getUser: async () => {
        calls.auth.push({ method: 'getUser', args: [] });
        if (handlers.getUser) return await handlers.getUser();
        return { data: { user: null }, error: null };
      },
      admin: {
        createUser: async (attrs: Record<string, unknown>) => {
          calls.auth.push({ method: 'admin.createUser', args: [attrs] });
          if (handlers.createUser) return await handlers.createUser(attrs);
          return { data: { user: { id: 'created-user-id' } }, error: null };
        },
        updateUserById: async (id: string, attrs: Record<string, unknown>) => {
          calls.auth.push({ method: 'admin.updateUserById', args: [id, attrs] });
          if (handlers.updateUserById) return await handlers.updateUserById(id, attrs);
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async (id: string) => {
          calls.auth.push({ method: 'admin.deleteUser', args: [id] });
          if (handlers.deleteUser) return await handlers.deleteUser(id);
          return { data: { user: null }, error: null };
        },
      },
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          calls.storage.push({ bucket, method: 'remove', paths: [...paths] });
          if (handlers.storageRemove) return await handlers.storageRemove(bucket, paths);
          return { data: [], error: null };
        },
        createSignedUrls: async (paths: string[], expiresIn: number) => {
          calls.storage.push({ bucket, method: 'createSignedUrls', paths: [...paths], expiresIn });
          if (handlers.createSignedUrls) {
            return await handlers.createSignedUrls(bucket, paths, expiresIn);
          }
          return {
            data: paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${p}` })),
            error: null,
          };
        },
      }),
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    calls,
  };
}

export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyText: string | null;
  bodyJson: unknown;
}

export function createFakeFetch(
  handler: (call: FetchCall) => Response | Promise<Response> = () => new Response('{}', { status: 200 }),
) {
  const calls: FetchCall[] = [];
  const fetchFn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';
    const headers: Record<string, string> = {};
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
    }
    const bodyText = typeof init?.body === 'string' ? init.body : null;
    let bodyJson: unknown = undefined;
    if (bodyText !== null) {
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {
        // cuerpo no JSON
      }
    }
    const call: FetchCall = { url, method, headers, bodyText, bodyJson };
    calls.push(call);
    return await handler(call);
  };
  return { fetchFn, calls };
}

export function createAdminTestDeps(
  handlers: FakeSupabaseHandlers = {},
  env: Record<string, string | undefined> = {},
) {
  const fake = createFakeSupabase({
    getUser: () => ({ data: { user: { id: 'admin-1' } }, error: null }),
    ...handlers,
    from: async (q) => {
      if (handlers.from) {
        const res = await handlers.from(q);
        if (res !== undefined) return res;
      }
      if (q.table === 'perfiles' && q.action === 'select' && q.columns === 'rol') {
        return { data: { rol: 'admin' }, error: null };
      }
      return { data: null, error: null, count: null };
    },
  });

  const envMap: Record<string, string | undefined> = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    ...env,
  };

  const clientCalls: Array<{ url: string; key: string; hasAuth: boolean }> = [];

  const deps: Required<AdminCallerDeps> = {
    createClient: (url, key, options) => {
      clientCalls.push({
        url,
        key,
        hasAuth: Boolean(options?.global?.headers?.Authorization),
      });
      return fake.client;
    },
    getEnv: (key) => envMap[key],
  };

  return { deps, fake, clientCalls };
}
