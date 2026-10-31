import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { deviceLabel, isStandalone, platform } from './pwa'

/**
 * Cet appareil et ses notifications. Chaque téléphone ou PC a son
 * identifiant, gardé dans le navigateur : il apparaît dans la liste des
 * appareils connectés, et il s'abonne à part aux notifications.
 */

const DEVICE_KEY = 'aegb.appareil'

function readId(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY)
  } catch {
    return null
  }
}

let memoryId: string | null = null

export function deviceId(): string {
  const stored = readId()
  if (stored) return stored
  memoryId ??= crypto.randomUUID()
  try {
    localStorage.setItem(DEVICE_KEY, memoryId)
  } catch {
    // Navigation privée : l'identifiant vit le temps de la session.
  }
  return memoryId
}

function newDeviceId() {
  memoryId = crypto.randomUUID()
  try {
    localStorage.setItem(DEVICE_KEY, memoryId)
  } catch {
    // Rien à garder.
  }
}

/**
 * ok : les notifications peuvent s'activer ici. installer : sur iPhone,
 * seulement une fois l'appli sur l'écran d'accueil. non : ce navigateur ne
 * sait pas les recevoir.
 */
export type PushSupport = 'ok' | 'installer' | 'non'

export function pushSupport(): PushSupport {
  if (platform() === 'iphone' && !isStandalone()) return 'installer'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'non'
  return 'ok'
}

export function permission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

let publicKey: Promise<string> | null = null

/** La clé publique du serveur, donnée par la fonction « push ». */
function serverKey(): Promise<string> {
  publicKey ??= fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
  })
    .then(async (res) => {
      const body = (await res.json()) as { publicKey?: string; error?: string }
      if (!res.ok || !body.publicKey) throw new Error(body.error ?? 'Les notifications ne sont pas encore prêtes.')
      return body.publicKey
    })
    .catch((e: unknown) => {
      publicKey = null
      throw e
    })
  return publicKey
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok' || import.meta.env.DEV) return null
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  return (await reg?.pushManager.getSubscription()) ?? null
}

async function saveSubscription(sub: PushSubscription | null) {
  const json = sub?.toJSON()
  const { error } = await supabase.rpc('save_push_device', {
    p_id: deviceId(),
    p_endpoint: json?.endpoint ?? null,
    p_p256dh: json?.keys?.p256dh ?? null,
    p_auth: json?.keys?.auth ?? null,
  })
  if (error) throw error
}

/* ----------------------------------------------------------------------------
   L'état de cet appareil, pour la carte « Activer » et les réglages
---------------------------------------------------------------------------- */

export type PushStatus = {
  support: PushSupport
  permission: NotificationPermission | 'unsupported'
  /** null : pas encore vérifié. */
  subscribed: boolean | null
}

let status: PushStatus | null = null
const listeners = new Set<() => void>()

function readStatus(): PushStatus {
  status ??= { support: pushSupport(), permission: permission(), subscribed: null }
  return status
}

function setStatus(patch: Partial<PushStatus>) {
  status = { ...readStatus(), ...patch }
  listeners.forEach((l) => l())
}

async function refreshStatus() {
  const sub = await currentSubscription().catch(() => null)
  setStatus({ support: pushSupport(), permission: permission(), subscribed: !!sub })
}

export function usePushStatus(): PushStatus {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    readStatus,
    readStatus,
  )
  useEffect(() => {
    if (value.subscribed === null) refreshStatus()
  }, [value.subscribed])
  return value
}

export type EnableResult = 'ok' | 'refuse' | 'installer' | 'non'

/** « Activer » : la question du téléphone, puis l'abonnement de cet appareil. */
export async function enablePush(): Promise<EnableResult> {
  const support = pushSupport()
  if (support !== 'ok') return support
  const answer = await Notification.requestPermission()
  setStatus({ permission: answer })
  if (answer !== 'granted') return 'refuse'
  if (import.meta.env.DEV) throw new Error("Les notifications marchent seulement dans l'appli publiée.")
  const reg = await navigator.serviceWorker.ready
  const key = await serverKey()
  let sub = await reg.pushManager.getSubscription()
  // Un abonnement fait avec une autre clé ne recevrait rien.
  if (sub && sub.options.applicationServerKey) {
    const current = new Uint8Array(sub.options.applicationServerKey)
    const wanted = fromB64url(key)
    if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
      await sub.unsubscribe()
      sub = null
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(key) })
  await saveSubscription(sub)
  setStatus({ subscribed: true })
  return 'ok'
}

/** Coupe les notifications sur cet appareil seulement. */
export async function disablePush() {
  const sub = await currentSubscription()
  await sub?.unsubscribe().catch(() => undefined)
  await saveSubscription(null)
  setStatus({ subscribed: false })
}

export type DeviceSync = { revoked: boolean; push: boolean }

/**
 * À chaque ouverture : l'appareil se signale. S'il a été retiré depuis un
 * autre appareil, il doit se déconnecter. Son abonnement est renvoyé, car
 * le navigateur peut le changer de lui-même.
 */
export async function syncDevice(): Promise<DeviceSync> {
  const touch = async () => {
    const { data, error } = await supabase.rpc('touch_device', { p_id: deviceId(), p_platform: platform(), p_label: deviceLabel() })
    if (error) throw error
    return data as unknown as { revoked: boolean; other: boolean; push: boolean }
  }
  let result = await touch()
  if (result.other) {
    newDeviceId()
    result = await touch()
  }
  if (result.revoked) return { revoked: true, push: false }
  const sub = permission() === 'granted' ? await currentSubscription().catch(() => null) : null
  setStatus({ permission: permission(), subscribed: !!sub })
  if (sub) {
    await saveSubscription(sub).catch(() => undefined)
    return { revoked: false, push: true }
  }
  if (result.push) await saveSubscription(null).catch(() => undefined)
  return { revoked: false, push: false }
}

/** Avant la déconnexion : l'appareil quitte la liste et ne reçoit plus rien. */
export async function forgetDevice() {
  const sub = await currentSubscription().catch(() => null)
  await sub?.unsubscribe().catch(() => undefined)
  await supabase.rpc('forget_device', { p_id: deviceId() })
  newDeviceId()
  setStatus({ subscribed: false })
}

/** Le nombre sur l'icône de l'appli, sur les appareils qui le permettent. */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  if (!nav.setAppBadge) return
  ;(count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.())?.catch(() => undefined)
}
