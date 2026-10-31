import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY manquent : copie .env.example en .env.local.')
}

const REMEMBER_KEY = 'aegb.resterConnecte'

function quietly<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

function remember(): boolean {
  return quietly(() => localStorage.getItem(REMEMBER_KEY) !== '0', true)
}

/** Faux sur un ordinateur partagé (« Rester connecté » décoché) : rien n'y est gardé. */
export function isRemembered(): boolean {
  return remember()
}

/** « Rester connecté sur cet ordinateur » : sinon la session s'arrête à la fermeture du navigateur. */
export function setRememberMe(value: boolean) {
  quietly(() => localStorage.setItem(REMEMBER_KEY, value ? '1' : '0'), undefined)
}

const sessionStore = {
  getItem: (k: string) => quietly(() => (remember() ? localStorage : sessionStorage).getItem(k), null),
  setItem: (k: string, v: string) => quietly(() => (remember() ? localStorage : sessionStorage).setItem(k, v), undefined),
  removeItem: (k: string) =>
    quietly(() => {
      localStorage.removeItem(k)
      sessionStorage.removeItem(k)
    }, undefined),
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: sessionStore,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Adresse de l'appli, utilisée dans les liens envoyés par email. */
export function appUrl(path: string): string {
  return new URL(import.meta.env.BASE_URL + path.replace(/^\//, ''), window.location.origin).toString()
}
