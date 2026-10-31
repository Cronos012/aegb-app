import { describe, expect, it } from 'vitest'
import { createHandler, drain, plan, type Deps, type Group, type Item } from './handler.ts'
import { b64urlDecode, b64urlEncode, buildPushRequest, encryptPayload, generateVapidKeys, vapidAuthorization } from './webpush.ts'

const decoder = new TextDecoder()

async function importSenderKeys(privateKey: string, publicKey: string): Promise<CryptoKeyPair> {
  const pub = b64urlDecode(publicKey)
  const jwk = { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)) }
  return {
    privateKey: await crypto.subtle.importKey('jwk', { ...jwk, d: privateKey }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  }
}

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

/** Ce que fait le navigateur à l'arrivée : déchiffrer avec sa clé privée. */
async function decrypt(body: Uint8Array, receiver: CryptoKeyPair, auth: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const senderPublic = body.slice(21, 21 + idlen)
  const cipher = body.slice(21 + idlen)
  const receiverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', receiver.publicKey))
  const sender = await crypto.subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: sender }, receiver.privateKey, 256))
  const enc = new TextEncoder()
  const join = (...p: Uint8Array[]) => {
    const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0))
    let i = 0
    for (const x of p) {
      out.set(x, i)
      i += x.length
    }
    return out
  }
  const prkKey = await hmac(auth, shared)
  const ikm = await hmac(prkKey, join(enc.encode('WebPush: info\0'), receiverPublic, senderPublic, new Uint8Array([1])))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, join(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, join(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher))
  expect(plain[plain.length - 1]).toBe(2)
  return decoder.decode(plain.slice(0, -1))
}

async function newReceiver() {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const p256dh = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)))
  return { keys, auth, p256dh, authKey: b64urlEncode(auth) }
}

describe('chiffrement (RFC 8291)', () => {
  it("donne exactement l'exemple de la RFC 8291", async () => {
    const senderKeys = await importSenderKeys(
      'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    )
    const body = await encryptPayload(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      { salt: b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'), senderKeys },
    )
    expect(b64urlEncode(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    )
  })

  it('se déchiffre avec la clé du navigateur', async () => {
    const r = await newReceiver()
    const body = await encryptPayload(new TextEncoder().encode('{"title":"Awa Diallo","body":"Tu viens ce soir ?"}'), { p256dh: r.p256dh, auth: r.authKey })
    expect(await decrypt(body, r.keys, r.auth)).toBe('{"title":"Awa Diallo","body":"Tu viens ce soir ?"}')
  })

  it('refuse une notification trop longue', async () => {
    const r = await newReceiver()
    await expect(encryptPayload(new Uint8Array(5000), { p256dh: r.p256dh, auth: r.authKey })).rejects.toThrow('trop longue')
  })
})

describe('signature VAPID (RFC 8292)', () => {
  it('signe pour le service du navigateur, vérifiable avec la clé publique', async () => {
    const keys = await generateVapidKeys()
    expect(b64urlDecode(keys.publicKey)).toHaveLength(65)
    expect(b64urlDecode(keys.privateKey)).toHaveLength(32)
    const now = Date.UTC(2026, 10, 15, 10)
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://cronos012.github.io/aegb-app/', now)
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(match).not.toBeNull()
    const [, head, claims, sig, k] = match!
    expect(k).toBe(keys.publicKey)
    expect(JSON.parse(decoder.decode(b64urlDecode(head)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(decoder.decode(b64urlDecode(claims)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: now / 1000 + 12 * 3600,
      sub: 'https://cronos012.github.io/aegb-app/',
    })
    const pub = await crypto.subtle.importKey('raw', b64urlDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlDecode(sig), new TextEncoder().encode(`${head}.${claims}`))
    expect(valid).toBe(true)
  })

  it('prépare la requête avec les bons en-têtes', async () => {
    const keys = await generateVapidKeys()
    const r = await newReceiver()
    const req = await buildPushRequest({ endpoint: 'https://web.push.apple.com/xyz', p256dh: r.p256dh, auth: r.authKey }, { title: 'AEGB' }, keys, 'https://x.test/', {
      urgency: 'high',
      topic: 'abc',
    })
    expect(req.url).toBe('https://web.push.apple.com/xyz')
    expect(req.init.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: '86400', Urgency: 'high', Topic: 'abc' })
    expect(await decrypt(req.init.body, r.keys, r.auth)).toBe('{"title":"AEGB"}')
  })
})

function item(over: Partial<Item>): Item {
  return { id: 1, device_id: null, category: 'prives', tag: 'conv:1', title: 'Awa Diallo', body: 'Salut', link: '/app/messages/1', quiet: false, ...over }
}

describe('ce qui part pour un membre', () => {
  it('une notification par conversation, la plus récente', () => {
    const out = plan([item({ id: 1, body: 'Un' }), item({ id: 2, body: 'Deux' }), item({ id: 3, tag: 'publication:9', category: 'reactions', title: 'Coumba', body: 'a réagi' })])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ ids: [1, 2], body: 'Deux', urgency: 'high' })
    expect(out[1]).toMatchObject({ ids: [3], urgency: 'normal' })
  })

  it('après les heures calmes, une seule notification', () => {
    const out = plan([
      item({ id: 1, quiet: true }),
      item({ id: 2, quiet: true, tag: 'conv:2' }),
      item({ id: 3, quiet: true, category: 'annonces', tag: 'notification:5' }),
    ])
    expect(out).toEqual([
      {
        ids: [1, 2, 3],
        title: 'AEGB',
        body: 'Pendant les heures calmes : 2 messages et 1 notification.',
        link: '/app/notifications',
        tag: 'heures-calmes',
        deviceId: null,
        urgency: 'normal',
      },
    ])
    expect(plan([item({ id: 1, quiet: true }), item({ id: 2, quiet: true })])[0]).toMatchObject({ body: 'Pendant les heures calmes : 2 messages.', link: '/app/messages' })
    // Une seule : elle part telle quelle.
    expect(plan([item({ id: 1, quiet: true })])[0]).toMatchObject({ ids: [1], body: 'Salut' })
  })

  it("l'essai part seulement vers son appareil", () => {
    const out = plan([item({ id: 1, category: 'essai', tag: 'essai', device_id: 'd1' })])
    expect(out[0]).toMatchObject({ deviceId: 'd1', urgency: 'high' })
  })
})

describe('la fonction serveur', () => {
  it('envoie, retire les abonnements disparus et marque la file', async () => {
    const keys = await generateVapidKeys()
    const r1 = await newReceiver()
    const r2 = await newReceiver()
    const groups: Group[] = [
      {
        member_id: 'b',
        badge: 3,
        items: [item({ id: 10, body: 'Tu viens ?' }), item({ id: 11, category: 'essai', tag: 'essai', device_id: 'd2', title: 'AEGB', body: 'Essai' })],
        devices: [
          { id: 'd1', endpoint: 'https://push.test/1', p256dh: r1.p256dh, auth: r1.authKey },
          { id: 'd2', endpoint: 'https://push.test/2', p256dh: r2.p256dh, auth: r2.authKey },
        ],
      },
    ]
    const calls: { name: string; args?: Record<string, unknown> }[] = []
    const received: { url: string; text: string }[] = []
    let claims = 0
    const deps: Deps = {
      keys,
      subject: 'https://x.test/',
      rpc: async (name, args) => {
        calls.push({ name, args })
        if (name === 'push_claim') return claims++ === 0 ? groups : []
        return null
      },
      fetch: async (url, init) => {
        const r = url.endsWith('/1') ? r1 : r2
        received.push({ url, text: await decrypt(init.body as Uint8Array, r.keys, r.auth) })
        return new Response(null, { status: url.endsWith('/1') ? 201 : 410 })
      },
    }
    expect(await drain(deps)).toEqual({ sent: 1, gone: 1, members: 1 })
    // d2 a disparu au premier envoi : l'essai ne lui est pas envoyé.
    expect(received).toHaveLength(2)
    expect(JSON.parse(received.find((x) => x.url.endsWith('/1'))!.text)).toEqual({
      title: 'Awa Diallo',
      body: 'Tu viens ?',
      link: '/app/messages/1',
      tag: 'conv:1',
      badge: 3,
    })
    expect(calls.filter((c) => c.name === 'push_device_result')).toEqual([
      { name: 'push_device_result', args: { p_device: 'd1', p_ok: true, p_gone: false } },
      { name: 'push_device_result', args: { p_device: 'd2', p_ok: false, p_gone: true } },
    ])
    expect(calls.find((c) => c.name === 'push_done')?.args).toEqual({ p_ids: [10, 11] })
  })

  it('donne la clé publique, et ne fait rien sans clés', async () => {
    const keys = await generateVapidKeys()
    const deps: Deps = { keys, subject: 'x', rpc: async () => [], fetch: async () => new Response(null) }
    const res = await createHandler(deps)(new Request('https://f.test/push'))
    expect(await res.json()).toEqual({ publicKey: keys.publicKey })
    const none = await createHandler({ ...deps, keys: null })(new Request('https://f.test/push', { method: 'POST' }))
    expect(none.status).toBe(503)
  })
})
