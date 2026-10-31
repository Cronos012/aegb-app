// Crée les clés d'envoi des notifications (VAPID) et les écrit au format
// d'un fichier d'environnement, pour « supabase secrets set --env-file ».
// Le workflow ne s'en sert qu'une fois : changer les clés couperait les
// notifications de tous les appareils déjà abonnés. Rien n'est affiché.

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
const b64url = (bytes) => Buffer.from(bytes).toString('base64url')

process.stdout.write(`VAPID_PUBLIC_KEY=${b64url(raw)}\nVAPID_PRIVATE_KEY=${jwk.d}\n`)
