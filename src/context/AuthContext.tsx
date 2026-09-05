import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { UserProfile, Sede } from '../types/database';
import { AuthContext, type LoginResult } from './auth.context';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [allSedes, setAllSedes] = useState<Sede[]>([]);
  const [currentSede, setCurrentSedeState] = useState<Sede | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const loadProfileAndSedes = useCallback(async (userId: string) => {
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!perfil) {
      setUser(null);
      setAllSedes([]);
      setCurrentSedeState(null);
      return;
    }

    const { data: sedes } = await supabase.from('sedes').select('*').order('nombre');
    const sedesList = (sedes || []) as Sede[];

    setUser(perfil as UserProfile);
    setAllSedes(sedesList);

    const savedSedeId = localStorage.getItem('restorify_sede_id');
    const isAdmin = (perfil as UserProfile).rol === 'admin';
    const preferred = isAdmin ? sedesList.find((s) => s.id === savedSedeId) : undefined;
    const own = sedesList.find((s) => s.id === (perfil as UserProfile).sede_id);
    setCurrentSedeState(preferred || own || sedesList[0] || null);
  }, []);

  const refreshSedes = useCallback(async () => {
    const { data: sedes } = await supabase.from('sedes').select('*').order('nombre');
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
      if (session?.user) {
        loadProfileAndSedes(session.user.id);
      } else {
        setUser(null);
        setAllSedes([]);
        setCurrentSedeState(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfileAndSedes]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, error: { code: (error as { code?: string }).code, message: error.message } };
    }
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('restorify_sede_id');
    setPasswordRecovery(false);
  }, []);

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
