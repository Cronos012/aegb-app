import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { PersistQueryClientProvider, removeOldestQuery } from '@tanstack/react-query-persist-client'
import { App } from './App'
import { SessionProvider } from './auth/session'
import { ToastProvider } from './components/Toast'
import { BUILD_DATE, registerServiceWorker } from './lib/pwa'
import { isRemembered } from './lib/supabase'
import './index.css'

const DAY = 24 * 60 * 60 * 1000

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Gardé une semaine : sans réseau, l'appli montre les dernières pages vues.
      gcTime: 7 * DAY,
    },
  },
})

/**
 * Ce qui est gardé sur l'appareil pour ouvrir l'appli sans réseau : le fil,
 * les messages, les événements, la cotisation… Jamais les écrans du bureau,
 * et rien du tout sur un ordinateur partagé.
 */
const KEEP = new Set(['me', 'fil', 'messages', 'evenements', 'cotisation', 'documents', 'annuaire', 'profil', 'charte', 'assemblee', 'notifications', 'reglages'])

const persister = createSyncStoragePersister({
  key: 'aegb.pages',
  storage: isRemembered() ? window.localStorage : undefined,
  throttleTime: 2000,
  // Plus de place sur l'appareil : les pages les plus anciennes partent d'abord.
  retry: removeOldestQuery,
})

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * DAY,
        buster: BUILD_DATE,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === 'success' && KEEP.has(String(q.queryKey[0])),
        },
      }}
      // Les pages gardées s'affichent tout de suite, puis se mettent à jour.
      onSuccess={() => queryClient.invalidateQueries()}
    >
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <SessionProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </SessionProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
)
