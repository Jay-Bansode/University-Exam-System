import { useContext } from 'react';
import { AuthContext, type AuthState } from '@/context/auth-context';

/**
 * Reads the auth context, and fails loudly if the provider is missing.
 *
 * Returning `null` instead would push an optional check into every component and turn a
 * wiring mistake into a scatter of confusing null errors far from the cause.
 */
export function useAuth(): AuthState {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }

  return context;
}
