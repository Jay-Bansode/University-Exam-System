import axios from 'axios';
import type { AuthUser, DemoAccount, LoginResponse } from '@ues/shared';
import { api, http } from './client';
import { API_BASE_URL } from '@/config/env';
import { clearAccessToken, setAccessToken } from './token-store';

/**
 * Auth calls. Each one keeps the in-memory access token in step with the server, so no
 * component ever handles a token directly.
 */

export async function login(email: string, password: string): Promise<AuthUser> {
  const result = await api.post<LoginResponse>('/auth/login', { email, password });
  setAccessToken(result.accessToken);
  return result.user;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    // Cleared even if the request fails. A network error must not leave the UI showing
    // a signed-in state the user has already asked to end.
    clearAccessToken();
  }
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const result = await api.get<{ user: AuthUser }>('/auth/me');
  return result.user;
}

export async function fetchDemoAccounts(): Promise<DemoAccount[]> {
  const result = await api.get<{ accounts: DemoAccount[] }>('/auth/demo-accounts');
  return result.accounts;
}

/**
 * Exchanges the httpOnly refresh cookie for a fresh access token on start-up.
 *
 * Uses a bare axios call rather than the shared instance on purpose: the shared
 * instance's response interceptor reacts to a 401 by refreshing, and a 401 *from* the
 * refresh endpoint would then recurse. Failure here is expected and ordinary — it just
 * means nobody is signed in.
 */
export async function restoreSession(): Promise<AuthUser | null> {
  try {
    const response = await axios.post<{
      success: boolean;
      data: { accessToken: string };
    }>(
      `${API_BASE_URL}/api/auth/refresh`,
      {},
      { withCredentials: true, timeout: 90_000 },
    );

    if (!response.data.success) return null;

    setAccessToken(response.data.data.accessToken);
    return await fetchCurrentUser();
  } catch {
    clearAccessToken();
    return null;
  }
}

/** Exposed so the health check can share the configured instance. */
export { http };
