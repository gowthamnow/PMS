import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { api } from './api';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  loginWithGoogle: (data: { credential?: string; email?: string; full_name?: string; avatar_url?: string }) => Promise<any>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const TOKEN_STORAGE_KEY = 'pms_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchCurrentUser = useCallback(async () => {
    const currentToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const profile = await api.auth.me();
      setUser(profile);
    } catch (error) {
      console.error('Failed to fetch authenticated user profile:', error);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = async (usernameOrEmail: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const data: any = await api.auth.login(usernameOrEmail, password);
      const accessToken = data.access_token;
      if (accessToken) {
        localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
        setToken(accessToken);
      }
      if (data.user) {
        setUser(data.user);
      } else {
        const profile = await api.auth.me();
        setUser(profile);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (authData: { credential?: string; email?: string; full_name?: string; avatar_url?: string }): Promise<any> => {
    setIsLoading(true);
    try {
      const data: any = await api.auth.googleLogin(authData);
      if (data.status === 'pending_approval' || !data.approved) {
        if (data.lobby_token) {
          sessionStorage.setItem('pms_lobby_token', data.lobby_token);
        }
        return data;
      }
      const accessToken = data.access_token;
      if (accessToken) {
        localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
        setToken(accessToken);
      }
      if (data.user) {
        setUser(data.user);
      } else {
        const profile = await api.auth.me();
        setUser(profile);
      }
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    api.auth.logout().catch(() => {});
  };

  const refreshUser = async () => {
    try {
      const profile = await api.auth.me();
      setUser(profile);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    loginWithGoogle,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
