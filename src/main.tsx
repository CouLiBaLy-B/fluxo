import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { App } from './App';
import './index.css';

// Client react-query — configuration globale
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Les données restent fraîches 30 secondes
      staleTime: 30_000,
      // Réessaye 1 fois en cas d'erreur (sauf 4xx)
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.includes('HTTP 4')) return false;
        return failureCount < 1;
      },
      // Pas de refetch sur le focus de la fenêtre (évite les requêtes excessives)
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Élément #root introuvable dans le DOM');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
