import { useSyncExternalStore } from 'react'

const QUERY = '(min-width: 1024px)'

function subscribe(callback: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

/** Vrai sur ordinateur (écran large) : l'appli passe à la mise en page PC. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false)
}
