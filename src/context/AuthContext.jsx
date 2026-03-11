import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAuthMe,
  loginAuthUser,
  logoutAuthSession,
  registerAuthUser,
  setPublicSchedulesAuthToken,
} from '../utils/publicSchedulesApi';

const AuthContext = createContext(null);

const EMPTY_PERMISSIONS = Object.freeze({
  isApproved: false,
  canEditSchedules: false,
  canManageFolders: false,
  canManageUsers: false,
});

const normalizePermissions = (value) => {
  if (!value || typeof value !== 'object') return EMPTY_PERMISSIONS;
  return {
    isApproved: !!value.isApproved,
    canEditSchedules: !!value.canEditSchedules,
    canManageFolders: !!value.canManageFolders,
    canManageUsers: !!value.canManageUsers,
  };
};

const normalizeUser = (value) => {
  if (!value || typeof value !== 'object') return null;
  const email = String(value.email || '').trim().toLowerCase();
  if (!email) return null;
  return {
    id: String(value.id || '').trim(),
    email,
    status: String(value.status || '').trim().toLowerCase(),
    isAdmin: !!value.isAdmin,
    requestedAt: Number(value.requestedAt) || null,
    approvedAt: Number(value.approvedAt) || null,
    approvedByEmail: String(value.approvedByEmail || '').trim().toLowerCase(),
    lastLoginAt: Number(value.lastLoginAt) || null,
    createdAt: Number(value.createdAt) || null,
    updatedAt: Number(value.updatedAt) || null,
  };
};

export function AuthProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [permissions, setPermissions] = useState(EMPTY_PERMISSIONS);
  const sessionRequestIdRef = useRef(0);
  const authUserRef = useRef(null);
  const permissionsRef = useRef(EMPTY_PERMISSIONS);

  const applyAuthState = useCallback((nextUser, nextPermissions) => {
    authUserRef.current = nextUser;
    permissionsRef.current = nextPermissions;
    setAuthUser(nextUser);
    setPermissions(nextPermissions);
  }, []);

  const clearAuthState = useCallback(() => {
    setPublicSchedulesAuthToken('');
    applyAuthState(null, EMPTY_PERMISSIONS);
  }, [applyAuthState]);

  const refreshSession = useCallback(async () => {
    const requestId = ++sessionRequestIdRef.current;
    try {
      const data = await getAuthMe();
      if (requestId !== sessionRequestIdRef.current) {
        return { authenticated: !!authUserRef.current, user: authUserRef.current };
      }
      if (!data?.authenticated) {
        clearAuthState();
        return { authenticated: false, user: null };
      }

      const user = normalizeUser(data.user);
      const nextPermissions = normalizePermissions(data.permissions);
      if (!user) {
        clearAuthState();
        return { authenticated: false, user: null };
      }

      applyAuthState(user, nextPermissions);
      return { authenticated: true, user };
    } catch (error) {
      if (requestId !== sessionRequestIdRef.current) {
        return { authenticated: !!authUserRef.current, user: authUserRef.current };
      }

      const status = Number(error?.status);
      if (status === 401 || status === 403) {
        clearAuthState();
        return { authenticated: false, user: null };
      }

      return { authenticated: !!authUserRef.current, user: authUserRef.current };
    }
  }, [applyAuthState, clearAuthState]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      await refreshSession();
      if (!cancelled) setIsLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  const signIn = useCallback(
    async ({ email, password }) => {
      const requestId = ++sessionRequestIdRef.current;
      const data = await loginAuthUser({ email, password });
      if (requestId !== sessionRequestIdRef.current) {
        return {
          user: authUserRef.current,
          permissions: permissionsRef.current,
          expiresAt: Number(data?.expiresAt) || null,
        };
      }
      const token = String(data?.token || '').trim();
      if (token) setPublicSchedulesAuthToken(token);

      const user = normalizeUser(data.user);
      const nextPermissions = normalizePermissions(data.permissions);
      if (!user) throw new Error('로그인 사용자 정보가 올바르지 않습니다.');

      applyAuthState(user, nextPermissions);
      return { user, permissions: nextPermissions, expiresAt: Number(data?.expiresAt) || null };
    },
    [applyAuthState],
  );

  const signUp = useCallback(async ({ email, password }) => {
    const data = await registerAuthUser({ email, password });
    return data;
  }, []);

  const signOut = useCallback(async () => {
    const requestId = ++sessionRequestIdRef.current;
    try {
      await logoutAuthSession();
    } catch {
      // ignore logout request failures and clear local session anyway
    } finally {
      if (requestId === sessionRequestIdRef.current) {
        clearAuthState();
      }
    }
  }, [clearAuthState]);

  const value = useMemo(() => {
    const isAuthenticated = !!authUser;
    return {
      isLoading,
      authUser,
      permissions,
      isAuthenticated,
      isAdmin: isAuthenticated && !!authUser?.isAdmin,
      signIn,
      signUp,
      signOut,
      refreshSession,
    };
  }, [isLoading, authUser, permissions, signIn, signUp, signOut, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
};
