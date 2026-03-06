import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { AuthUser, LoginCredentials, RegisterCredentials } from '../types';
import { api, ApiRequestError } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => void;
  error: string | null;
  clearError: () => void;
}

// ── Contexte ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'auth_token';
const USER_KEY  = 'auth_user';

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialiser depuis le localStorage pour la persistance entre sessions
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? (JSON.parse(stored) as AuthUser) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vérifier que le token stocké est encore valide au montage
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && !user) {
      // Token présent mais pas d'utilisateur → tenter de récupérer le profil
      api.auth.me()
        .then(({ user: me }) => {
          setUser(me);
          localStorage.setItem(USER_KEY, JSON.stringify(me));
        })
        .catch(() => {
          // Token invalide ou expiré → nettoyer
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persistAuth = useCallback((token: string, authUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const { token, user: authUser } = await api.auth.login(credentials);
      persistAuth(token, authUser);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Erreur de connexion. Vérifiez votre réseau.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [persistAuth]);

  const register = useCallback(async (credentials: RegisterCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const { token, user: authUser } = await api.auth.register(credentials);
      persistAuth(token, authUser);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Erreur lors de la création du compte. Vérifiez votre réseau.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [persistAuth]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      error,
      clearError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l\'intérieur d\'un AuthProvider');
  }
  return ctx;
}
