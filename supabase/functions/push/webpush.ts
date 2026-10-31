// Web Push sans bibliothèque : le chiffrement du message (RFC 8291) et la
// signature VAPID (RFC 8292), avec Web Crypto seulement. Le même code tourne
// chez Supabase (Deno) et dans les essais (Node).

const encoder = new TextEncoder()

export interface VapidKeys {
  /** La clé publique, 65 octets en base64url : c'est elle que l'appli donne au navigateur. */
  publicKey: string
  /** La clé privée (d), 32 octets en base64url. Elle reste dans les secrets de Supabase. */
  privateKey: string
}

export interface PushSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

const ONE = new Uint8Array([1])
export const RECORD_SIZE = 4096

/**
 * Chiffre un message pour un abonnement (aes128gcm, un seul bloc).
 * salt et senderKeys ne servent qu'aux essais : sinon ils sont tirés au hasard.
 */
export async function encryptPayload(
  payload: Uint8Array,
  subscription: Pick<PushSubscription, 'p256dh' | 'auth'>,
  options: { salt?: Uint8Array; senderKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  if (payload.length + 17 > RECORD_SIZE) throw new Error('Notification trop longue.')
  const receiverPublic = b64urlDecode(subscription.p256dh)
  const authSecret = b64urlDecode(subscription.auth)
  const senderKeys =
    options.senderKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeys.publicKey))
  const receiverKey = await crypto.subtle.importKey('raw', receiverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey }, senderKeys.privateKey, 256))

  const prkKey = await hmac(authSecret, shared)
  const keyInfo = concat(encoder.encode('WebPush: info\0'), receiverPublic, senderPublic)
  const ikm = await hmac(prkKey, concat(keyInfo, ONE))
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, concat(encoder.encode('Content-Encoding: aes128gcm\0'), ONE))).slice(0, 16)
  const nonce = (await hmac(prk, concat(encoder.encode('Content-Encoding: nonce\0'), ONE))).slice(0, 12)

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 2 : dernier (et seul) bloc, sans remplissage.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))

  const header = new Uint8Array(16 + 4 + 1 + senderPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = senderPublic.length
  header.set(senderPublic, 21)
  return concat(header, cipher)
}

/** L'en-tête Authorization signé avec la clé du serveur, valable 12 heures. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const audience = new URL(endpoint).origin
  const head = b64urlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(encoder.encode(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })))
  const pub = b64urlDecode(keys.publicKey)
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), d: keys.privateKey, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${head}.${claims}`)))
  return `vapid t=${head}.${claims}.${b64urlEncode(signature)}, k=${keys.publicKey}`
}

/** Un nom court (32 caractères) pour qu'un service remplace une notification pas encore livrée. */
export async function topicFor(tag: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(tag)))
  return b64urlEncode(digest).slice(0, 32)
}

export interface PushRequest {
  url: string
  init: { method: 'POST'; headers: Record<string, string>; body: Uint8Array }
}

/** La requête à envoyer au service de notifications du navigateur. */
export async function buildPushRequest(
  subscription: PushSubscription,
  payload: unknown,
  keys: VapidKeys,
  subject: string,
  options: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string; now?: number } = {},
): Promise<PushRequest> {
  const body = await encryptPayload(encoder.encode(JSON.stringify(payload)), subscription)
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(subscription.endpoint, keys, subject, options.now),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(options.ttl ?? 86400),
    Urgency: options.urgency ?? 'normal',
  }
  if (options.topic) headers.Topic = options.topic
  return { url: subscription.endpoint, init: { method: 'POST', headers, body } }
}

/** Une paire de clés VAPID neuve (le workflow GitHub s'en sert une seule fois). */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { publicKey: b64urlEncode(publicKey), privateKey: jwk.d as string }
}
