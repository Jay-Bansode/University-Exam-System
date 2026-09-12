/**
 * Holds the access token in a module-scoped variable — in memory only.
 *
 * Deliberately **not** `localStorage` or a readable cookie. Anything stored there can be
 * read by any script on the page, so a single XSS bug hands an attacker a working token.
 * A module variable dies with the tab, which is the whole point.
 *
 * "But then the user is signed out on refresh" — they are not. The httpOnly refresh
 * cookie survives, and the app exchanges it for a new access token on start-up. The
 * long-lived credential stays somewhere JavaScript cannot reach it, and the short-lived
 * one is re-derived on demand.
 */

let accessToken: string | null = null;

/** Notified whenever the token changes, so React state can follow it. */
type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) listener(token);
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

export function onAccessTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
