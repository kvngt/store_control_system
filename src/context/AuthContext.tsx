import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { UserProfile, Sede } from '../types/database';

interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  currentSede: Sede | null;
  allSedes: Sede[];
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  setCurrentSede: (sede: Sede | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [allSedes, setAllSedes] = useState<Sede[]>([]);
  const [currentSede, setCurrentSedeState] = useState<Sede | null>(null);
  const [loading, setLoading] = useState(true);

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
      return { success: false, error: error.message };
    }
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('restorify_sede_id');
  }, []);

  const setCurrentSede = useCallback((sede: Sede | null) => {
    setCurrentSedeState(sede);
    if (sede) {
      localStorage.setItem('restorify_sede_id', sede.id);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        currentSede,
        allSedes,
        login,
        logout,
        setCurrentSede,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
