import { createContext } from 'react';
import type { AuthUser, Role } from '@ues/shared';

/**
 * The context object lives in its own module, separate from the provider component.
 *
 * React Fast Refresh can only hot-reload a module that exports components and nothing
 * else. Keeping the context and the hook here means editing the provider does not force
 * a full page reload and lose application state mid-development. (This is what the
 * `react-refresh/only-export-components` lint rule is warning about.)
 */

export type AuthState = {
  user: AuthUser | null;
  /** True while the start-up session restore is still running. */
  isInitialising: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
};

export const AuthContext = createContext<AuthState | null>(null);
