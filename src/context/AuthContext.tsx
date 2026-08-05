import React, { createContext, useContext, useState, useCallback } from 'react';
import type { UserProfile, Sede } from '../types/database';
import { mockUsers, mockSedes } from '../services/mockData';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  currentSede: Sede | null;
  allSedes: Sede[];
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  setCurrentSede: (sede: Sede | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('restorify_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [currentSede, setCurrentSedeState] = useState<Sede | null>(() => {
    const saved = localStorage.getItem('restorify_sede');
    return saved ? JSON.parse(saved) : mockSedes[0] || null;
  });

  const login = useCallback(async (email: string, _password: string): Promise<boolean> => {
    // Mock login — find user by email
    const found = mockUsers.find(u => u.email === email);
    if (found) {
      setUser(found);
      localStorage.setItem('restorify_user', JSON.stringify(found));
      const sede = mockSedes.find(s => s.id === found.sede_id) || mockSedes[0];
      setCurrentSedeState(sede);
      localStorage.setItem('restorify_sede', JSON.stringify(sede));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('restorify_user');
    localStorage.removeItem('restorify_sede');
  }, []);

  const setCurrentSede = useCallback((sede: Sede | null) => {
    setCurrentSedeState(sede);
    if (sede) {
      localStorage.setItem('restorify_sede', JSON.stringify(sede));
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        currentSede,
        allSedes: mockSedes,
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
