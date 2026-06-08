import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authAPI, setApiSession, userAPI } from '../services/api';
import { unregisterPushDevice } from '../services/notifications';
import { storage } from '../services/storage';
import { AuthSession, SamvaadUser } from '../types/api';

interface AuthContextValue {
  ready: boolean;
  session: AuthSession | null;
  user: SamvaadUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, firstName: string, lastName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateStatus: (status: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeSession(data: any): AuthSession {
  const token = data?.token || data?.accessToken || data?.jwt || data?.data?.token;
  const rawUser = data?.user || data?.data?.user || data;
  const user: SamvaadUser = {
    ...rawUser,
    id: rawUser?.id || rawUser?.userId,
    displayName: rawUser?.displayName || `${rawUser?.firstName || ''} ${rawUser?.lastName || ''}`.trim() || rawUser?.email,
    avatarUrl: rawUser?.avatarUrl || rawUser?.profilePictureUrl,
  };

  if (!token || !user?.id) {
    throw new Error('Authentication response did not include a token and user.');
  }

  return { token, user };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    storage.getSession()
      .then((saved) => {
        setSession(saved);
        setApiSession(saved);
      })
      .finally(() => setReady(true));
  }, []);

  const persist = async (next: AuthSession | null) => {
    setSession(next);
    setApiSession(next);
    await storage.setSession(next);
  };

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    session,
    user: session?.user || null,
    isAuthenticated: Boolean(session?.token),
    login: async (email, password) => {
      const response = await authAPI.login(email, password);
      await persist(normalizeSession(response.data));
    },
    register: async (email, firstName, lastName, password) => {
      const response = await authAPI.register(email, firstName, lastName, password);
      await persist(normalizeSession(response.data));
    },
    logout: async () => {
      await unregisterPushDevice().catch(() => undefined);
      await persist(null);
    },
    refreshProfile: async () => {
      const response = await userAPI.getProfile();
      if (session) {
        await persist({ ...session, user: response.data });
      }
    },
    updateStatus: async (status) => {
      const response = await userAPI.updateStatus(status);
      if (session) {
        await persist({ ...session, user: { ...session.user, ...(response.data || {}), status } });
      }
    },
  }), [ready, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}
