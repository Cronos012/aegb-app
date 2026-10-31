import { useSyncExternalStore } from 'react'

/**
 * L'appli installable : le service worker, le bandeau « Nouvelle version »,
 * le bouton « Installer l'appli » et l'état du réseau.
 */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type PwaState = {
  /** Une nouvelle version est prête : le bandeau propose de recharger. */
  updateReady: boolean
  /** Android et PC (Chrome, Edge) : l'installation se propose d'un bouton. */
  canInstall: boolean
  online: boolean
}

let state: PwaState = {
  updateReady: false,
  canInstall: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}
const listeners = new Set<() => void>()
let waiting: ServiceWorker | null = null
let registration: ServiceWorkerRegistration | null = null
let installPrompt: InstallPrompt | null = null
let reloadOnChange = false

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/** Un appui sur une notification, l'appli déjà ouverte : le service worker demande d'ouvrir ce lien. */
let opener: ((link: string) => void) | null = null
export function onOpenLink(fn: (link: string) => void) {
  opener = fn
  return () => {
    if (opener === fn) opener = null
  }
}

export function registerServiceWorker() {
  if (typeof window === 'undefined') return
  window.addEventListener('online', () => set({ online: true }))
  window.addEventListener('offline', () => set({ online: false }))
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt = e as InstallPrompt
    set({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    set({ canInstall: false })
  })

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: string; link?: string } | null
    if (data?.type === 'ouvrir' && typeof data.link === 'string' && data.link.startsWith('/')) opener?.(data.link)
  })
  // Seulement après « Recharger » : la toute première installation ne recharge pas la page.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadOnChange) window.location.reload()
  })

  const base = import.meta.env.BASE_URL
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then((reg) => {
      registration = reg
      const ready = (w: ServiceWorker | null) => {
        if (w && navigator.serviceWorker.controller) {
          waiting = w
          set({ updateReady: true })
        }
      }
      const track = (w: ServiceWorker | null) => {
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed') ready(w)
        })
      }
      if (reg.waiting) ready(reg.waiting)
      track(reg.installing)
      reg.addEventListener('updatefound', () => track(reg.installing))
      // Une nouvelle version se cherche toutes les heures, et au retour dans l'appli.
      const check = () => reg.update().catch(() => undefined)
      setInterval(check, 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    })
    .catch(() => undefined)
}

/** « Version de l'appli » : cherche tout de suite une nouvelle version. Rend vrai s'il y en a une. */
export async function checkForUpdate(): Promise<boolean> {
  if (state.updateReady) return true
  if (!registration) return false
  await registration.update().catch(() => undefined)
  // La nouvelle version s'installe en arrière-plan : le bandeau apparaît dès qu'elle est prête.
  await new Promise((r) => setTimeout(r, 1500))
  return state.updateReady || !!registration.installing || !!registration.waiting
}

/** La date de cette version de l'appli, posée à la construction. */
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : new Date().toISOString()

export function applyUpdate() {
  if (!waiting) {
    window.location.reload()
    return
  }
  reloadOnChange = true
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

/** Ouvre la question « Installer l'appli » du navigateur. Rend vrai si la personne accepte. */
export async function promptInstall(): Promise<boolean> {
  if (!installPrompt) return false
  const prompt = installPrompt
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  installPrompt = null
  set({ canInstall: false })
  return outcome === 'accepted'
}

/** L'appli est ouverte depuis l'écran d'accueil (installée), pas dans le navigateur. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export type Platform = 'android' | 'iphone' | 'ordinateur' | 'autre'

export function platform(ua = navigator.userAgent, touch = navigator.maxTouchPoints): Platform {
  if (/android/i.test(ua)) return 'android'
  // Un iPad récent se présente comme un Mac, mais il a un écran tactile.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && touch > 1)) return 'iphone'
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'ordinateur'
  return 'autre'
}

/** « Android · Chrome », « iPhone · Safari », « Windows · Edge »… pour la liste des appareils. */
export function deviceLabel(ua = navigator.userAgent, touch = navigator.maxTouchPoints): string {
  const p = platform(ua, touch)
  const system =
    p === 'android' ? 'Android' : p === 'iphone' ? (/ipad/i.test(ua) || /macintosh/i.test(ua) ? 'iPad' : 'iPhone') : /windows/i.test(ua) ? 'Windows' : /macintosh/i.test(ua) ? 'Mac' : /cros/i.test(ua) ? 'Chromebook' : /linux/i.test(ua) ? 'Linux' : 'Appareil'
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /samsungbrowser/i.test(ua)
      ? 'Samsung Internet'
      : /opr\//i.test(ua)
        ? 'Opera'
        : /firefox|fxios/i.test(ua)
          ? 'Firefox'
          : /crios|chrome/i.test(ua)
            ? 'Chrome'
            : /safari/i.test(ua)
              ? 'Safari'
              : 'Navigateur'
  return `${system} · ${browser}`
}
