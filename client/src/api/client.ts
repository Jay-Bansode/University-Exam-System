import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorCode, ApiResponse } from '@ues/shared';
import { API_BASE_URL } from '@/config/env';
import { clearAccessToken, getAccessToken, setAccessToken } from './token-store';

/**
 * The single axios instance every request goes through.
 *
 * Two jobs beyond plain axios:
 *   1. Unwrap the `{ success, data }` envelope so callers receive `data` directly.
 *   2. Turn every failure — HTTP error, network drop, timeout — into one `ApiError`
 *      type, so UI code has exactly one error shape to render.
 *
 * The auth refresh interceptor is added in Phase 1, once tokens exist.
 */

export class ApiError extends Error {
  readonly code: ApiErrorCode | 'NETWORK' | 'TIMEOUT';
  readonly status: number | undefined;
  readonly details: Record<string, string[]> | undefined;

  constructor(
    code: ApiErrorCode | 'NETWORK' | 'TIMEOUT',
    message: string,
    status?: number,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True while the API is unreachable, which on Render usually means it is asleep. */
  get isConnectivityProblem(): boolean {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT';
  }
}

export const http = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  // Sends and accepts the refresh-token cookie. Paired with the server's exact-origin
  // CORS allowlist, since browsers reject a wildcard origin on credentialed requests.
  withCredentials: true,
  // Render's free tier sleeps after 15 minutes and takes roughly a minute to wake, so
  // the usual few-second timeout would abort every first request of the day.
  timeout: 90_000,
  headers: { 'Content-Type': 'application/json' },
});

/** Attaches the in-memory access token to every outgoing request. */
http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Silent token refresh.
 *
 * Access tokens last 15 minutes, so an active session will hit an expired token
 * mid-use. Rather than dumping the user back at the login page, a 401 with code
 * `TOKEN_EXPIRED` triggers one refresh attempt and the original request is replayed.
 *
 * Two details that are easy to get wrong:
 *
 *   - **Only one refresh in flight.** If four requests expire together, four parallel
 *     refresh calls would rotate the token four times, and rotation treats a reused
 *     token as theft — logging the user out. So the first caller starts the refresh and
 *     the rest await the same promise.
 *   - **Retry once, never loop.** The replayed request is flagged, so a second 401
 *     propagates instead of refreshing forever.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= (async () => {
    try {
      const response = await axios.post<ApiResponse<{ accessToken: string }>>(
        `${API_BASE_URL}/api/auth/refresh`,
        {},
        { withCredentials: true, timeout: 90_000 },
      );

      if (!response.data.success) throw new Error('Refresh rejected');

      const { accessToken } = response.data.data;
      setAccessToken(accessToken);
      return accessToken;
    } finally {
      // Cleared whether it succeeded or failed, so a later attempt is not stuck holding
      // a settled promise.
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!(error instanceof AxiosError) || !error.response || !error.config) {
      throw error;
    }

    const config = error.config as RetriableConfig;
    const body = error.response.data as ApiResponse<unknown> | undefined;
    const code = body && body.success === false ? body.error.code : null;

    const isExpired = error.response.status === 401 && code === 'TOKEN_EXPIRED';
    // The refresh endpoint itself must never trigger a refresh.
    const isRefreshCall = config.url?.includes('/auth/refresh');

    if (!isExpired || config._retried || isRefreshCall) {
      throw error;
    }

    config._retried = true;

    try {
      await refreshAccessToken();
    } catch {
      // The refresh cookie is gone or revoked: the session is genuinely over.
      clearAccessToken();
      throw error;
    }

    return http.request(config);
  },
);

function toApiError(error: unknown): ApiError {
  if (error instanceof AxiosError) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ApiError('TIMEOUT', 'The server took too long to respond.');
    }

    if (!error.response) {
      return new ApiError('NETWORK', 'Could not reach the server.');
    }

    const body = error.response.data as ApiResponse<unknown> | undefined;
    if (body && body.success === false) {
      return new ApiError(
        body.error.code,
        body.error.message,
        error.response.status,
        body.error.details,
      );
    }

    return new ApiError(
      'INTERNAL',
      `Request failed with status ${error.response.status}.`,
      error.response.status,
    );
  }

  return new ApiError(
    'INTERNAL',
    error instanceof Error ? error.message : 'Unknown error',
  );
}

/** Performs a request and returns the unwrapped payload, or throws an `ApiError`. */
export async function apiRequest<T>(
  config: Parameters<typeof http.request>[0],
): Promise<T> {
  try {
    const response = await http.request<ApiResponse<T>>(config);
    const body = response.data;

    if (!body.success) {
      throw new ApiError(
        body.error.code,
        body.error.message,
        response.status,
        body.error.details,
      );
    }

    return body.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw toApiError(error);
  }
}

export const api = {
  get: <T>(url: string) => apiRequest<T>({ method: 'GET', url }),
  post: <T>(url: string, data?: unknown) => apiRequest<T>({ method: 'POST', url, data }),
  patch: <T>(url: string, data?: unknown) =>
    apiRequest<T>({ method: 'PATCH', url, data }),
  put: <T>(url: string, data?: unknown) => apiRequest<T>({ method: 'PUT', url, data }),
  delete: <T>(url: string) => apiRequest<T>({ method: 'DELETE', url }),
};
