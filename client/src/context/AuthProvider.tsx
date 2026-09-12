import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthUser, Role } from '@ues/shared';
import * as authApi from '@/api/auth';
import { ColdStartNotice } from '@/components/ColdStartNotice';
import { AuthContext, type AuthState } from './auth-context';

/**
 * Owns the signed-in user for the whole application.
 *
 * On mount it tries to restore a session from the httpOnly refresh cookie. Until that
 * resolves the app is "initialising" rather than "signed out" — without that distinction
 * every reload would flash the login page before the user reappeared.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitialising, setIsInitialising] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    void authApi.restoreSession().then((restored) => {
      // Guards against a state update after unmount, which React 19 StrictMode makes
      // easy to hit because effects run twice in development.
      if (cancelled) return;
      setUser(restored);
      setIsInitialising(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const signedIn = await authApi.login(email, password);
    setUser(signedIn);
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    // Every cached query belongs to the user who just left. Without this, the next
    // person to sign in on the same tab sees the previous user's data until it refetches
    // — which in a multi-tenant system means one college's data shown to another.
    queryClient.clear();
  }, [queryClient]);

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      isInitialising,
      isAuthenticated: user !== null,
      login,
      logout,
      hasRole,
    }),
    [user, isInitialising, login, logout, hasRole],
  );

  return (
    <AuthContext value={value}>
      {children}
      {/*
        Attached to the session restore because that is the first request any visitor
        makes. If it is still running after a few seconds the API is almost certainly
        asleep, and saying so is better than appearing to hang.
      */}
      <ColdStartNotice isWaiting={isInitialising} />
    </AuthContext>
  );
}
