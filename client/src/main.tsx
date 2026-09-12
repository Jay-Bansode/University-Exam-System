import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/index.css';

/**
 * React Query owns all server state: fetching, caching, retries, and staleness.
 *
 * The alternative is a `useEffect` plus `useState` per request, which is where most
 * hand-rolled React data layers end up duplicating loading flags and stale-response
 * races. Configuring it once here keeps that logic out of components entirely.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetching on every window focus is noisy, and on Render's free tier it can
      // trigger a cold start just because the user switched tabs.
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: 1,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root was not found in index.html');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
