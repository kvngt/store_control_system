import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { UserProfile, Sede } from '../types/database';
import { AuthContext, type LoginResult } from './auth.context';
import { identifyUser } from '../lib/monitoring';
import { clearAllIntakeDrafts } from '../features/workOrders/intakeDraft';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [allSedes, setAllSedes] = useState<Sede[]>([]);
  const [currentSede, setCurrentSedeState] = useState<Sede | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const queryClient = useQueryClient();

  // Un error que llega a Sentry dice a quién le pasó; al cerrar sesión se olvida.
  useEffect(() => {
    identifyUser(user);
  }, [user]);
  // Quién es dueño de lo que hay en la caché de datos. En una tablet compartida, sin
  // esto, quien entraba después veía por un momento las órdenes y los montos que cargó
  // la persona anterior (un admin), hasta que llegaba su propia consulta.
  const cacheOwner = useRef<string | null>(null);

  const forgetCachedData = useCallback(() => {
    queryClient.clear();
    // El borrador de una orden a medias es de esta sesión: no se queda en el aparato (regla 8c).
    clearAllIntakeDrafts();
    cacheOwner.current = null;
  }, [queryClient]);

  const loadProfileAndSedes = useCallback(async (userId: string) => {
    if (cacheOwner.current && cacheOwner.current !== userId) forgetCachedData();
    cacheOwner.current = userId;
    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .single();

    // Una consulta que falló (sin señal en el taller, la base no respondió) no es
    // "esta cuenta no tiene perfil". Antes las dos cosas cerraban la sesión en la
    // pantalla: a media captura, el técnico caía al login y perdía lo escrito.
    // PGRST116 es la única respuesta que de verdad dice "no hay fila".
    if (perfilError && perfilError.code !== 'PGRST116') return;

    if (!perfil) {
      setUser(null);
      setAllSedes([]);
      setCurrentSedeState(null);
      // Una sesión sin perfil no sirve para nada y se quedaba guardada en el navegador.
      void supabase.auth.signOut({ scope: 'local' });
      return;
    }

    const { data: sedes, error: sedesError } = await supabase.from('sedes').select('*').order('nombre');
    // Igual que arriba: sin respuesta se conservan las sedes que ya había.
    if (sedesError) {
      setUser(perfil as UserProfile);
      return;
    }
    const sedesList = (sedes || []) as Sede[];

    setUser(perfil as UserProfile);
    setAllSedes(sedesList);

    const savedSedeId = localStorage.getItem('restorify_sede_id');
    const isAdmin = (perfil as UserProfile).rol === 'admin';
    const preferred = isAdmin ? sedesList.find((s) => s.id === savedSedeId) : undefined;
    const own = sedesList.find((s) => s.id === (perfil as UserProfile).sede_id);
    setCurrentSedeState(preferred || own || sedesList[0] || null);
  }, [forgetCachedData]);

  const refreshSedes = useCallback(async () => {
    const { data: sedes, error } = await supabase.from('sedes').select('*').order('nombre');
    // Una relectura que falla (sin red) no es "no hay sedes": se conserva lo que había, como en
    // loadProfileAndSedes. Antes dejaba el selector vacío y la sede actual en null (regla 10).
    if (error) return;
    const sedesList = (sedes || []) as Sede[];
    setAllSedes(sedesList);
    setCurrentSedeState((prev) =>
      prev ? sedesList.find((s) => s.id === prev.id) || sedesList[0] || null : prev
    );
  }, []);

  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    if (perfil) setUser(perfil as UserProfile);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session?.user) {
        loadProfileAndSedes(session.user.id).finally(() => active && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
      // Renovar el token (cada hora, y al volver a la pestaña) no cambia quién es
      // ni su perfil: no hace falta volver a pedirlo, y pedirlo con mala señal era
      // la forma más común de perder la sesión en pantalla.
      if (event === 'TOKEN_REFRESHED') return;
      if (session?.user) {
        loadProfileAndSedes(session.user.id);
      } else {
        setUser(null);
        setAllSedes([]);
        setCurrentSedeState(null);
        forgetCachedData();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfileAndSedes, forgetCachedData]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, error: { code: (error as { code?: string }).code, message: error.message } };
    }
    // Una cuenta de Auth sin fila en `perfiles` (creada a mano en el panel, o de un
    // empleado a medio borrar) entraba, la pantalla volvía al login y no decía nada:
    // parecía que el botón no funcionaba. Solo PGRST116 dice "no hay perfil"; si la
    // consulta falla por la red, se deja pasar y lo resuelve la carga normal.
    const { error: perfilError } = await supabase
      .from('perfiles')
      .select('id')
      .eq('id', data.user.id)
      .single();
    if (perfilError?.code === 'PGRST116') {
      await supabase.auth.signOut({ scope: 'local' });
      return { success: false, error: { code: 'no_profile' } };
    }
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    // Solo en este aparato: sin `scope: 'local'`, supabase-js cierra la sesión de la persona en
    // todos lados (su teléfono, la app instalada) y, al llegar SIGNED_OUT allá, se borra el
    // borrador del alta guardado en ese teléfono. El manual pide cerrar sesión en la tablet
    // compartida; eso no debe sacarla de su propio teléfono (revisión del 30/10/2026).
    await supabase.auth.signOut({ scope: 'local' });
    localStorage.removeItem('restorify_sede_id');
    setPasswordRecovery(false);
    forgetCachedData();
  }, [forgetCachedData]);

  const endPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const setCurrentSede = useCallback((sede: Sede | null) => {
    setCurrentSedeState(sede);
    if (sede) {
      localStorage.setItem('restorify_sede_id', sede.id);
    }
  }, []);

  // Every screen consumes this context, and an object literal rebuilt on each
  // render made all of them re-render whenever anything in the provider
  // changed — a keystroke in an unrelated child included. The callbacks are
  // already stable, so the value only changes when the session actually does.
  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      loading,
      currentSede,
      allSedes,
      login,
      logout,
      setCurrentSede,
      refreshSedes,
      refreshUser,
      passwordRecovery,
      endPasswordRecovery,
    }),
    [
      user,
      loading,
      currentSede,
      allSedes,
      login,
      logout,
      setCurrentSede,
      refreshSedes,
      refreshUser,
      passwordRecovery,
      endPasswordRecovery,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
