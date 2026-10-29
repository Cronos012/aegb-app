import { beforeEach, describe, expect, it } from 'vitest'
import { createHandler, parisDate, payerFor, readConfig, type Config } from './handler.ts'

const AWA = '11111111-1111-4111-8111-111111111111'
const BAKARY = '22222222-2222-4222-8222-222222222222'
const PAY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BASE = 'https://cronos012.github.io/aegb-app/'
const NOW = new Date('2026-11-15T10:00:00Z')

const config: Config = {
  clientId: 'id',
  clientSecret: 'secret',
  org: 'aegb-brest',
  mode: 'sandbox',
  appUrls: [BASE],
}

interface Call {
  url: string
  method: string
  body?: unknown
}

let payment: Record<string, unknown>
let rpcCalls: { name: string; args: Record<string, unknown> }[]
let httpCalls: Call[]
let intent: Record<string, unknown> | null
let refusePayer: boolean

beforeEach(() => {
  payment = {
    id: PAY,
    member_id: AWA,
    status: 'en_attente',
    method: 'carte',
    amount_cents: 1500,
    label: 'Septembre à novembre 2026',
    checkout_intent_id: null,
    created_at: '2026-11-15T09:50:00Z',
    first_name: 'Awa',
    last_name: 'Diallo',
    email: 'awa@exemple.fr',
  }
  rpcCalls = []
  httpCalls = []
  intent = null
  refusePayer = false
})

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input)
  const method = init?.method ?? 'GET'
  const raw = init?.body ? String(init.body) : undefined
  httpCalls.push({ url, method, body: raw && raw.startsWith('{') ? JSON.parse(raw) : raw })
  if (url.endsWith('/oauth2/token')) return reply(200, { access_token: 'jeton', expires_in: 1800 })
  if (method === 'POST' && url.endsWith('/checkout-intents')) {
    const body = JSON.parse(raw ?? '{}') as { payer?: unknown }
    if (refusePayer && body.payer) return reply(400, { errors: [{ message: 'payer invalide' }] })
    return reply(200, { id: 4242, redirectUrl: 'https://www.helloasso-sandbox.com/paiement/4242' })
  }
  if (method === 'GET' && url.includes('/checkout-intents/')) return intent ? reply(200, intent) : reply(404, {})
  return reply(500, {})
}

function handler(overrides: Partial<Config> = {}) {
  return createHandler({
    config: { ...config, ...overrides },
    fetch: fakeFetch,
    userFromToken: async (token) => ({ 'jeton-awa': AWA, 'jeton-bakary': BAKARY })[token] ?? null,
    rpc: async (name, args) => {
      rpcCalls.push({ name, args })
      if (name === 'helloasso_payment') return args.p_payment === PAY ? payment : null
      if (name === 'helloasso_attach') payment.checkout_intent_id = args.p_intent
      if (name === 'helloasso_confirm') payment.status = 'confirme'
      if (name === 'helloasso_fail') payment.status = 'echec'
      return null
    },
    now: () => NOW,
  })
}

function post(body: unknown, token?: string) {
  return new Request('https://x.supabase.co/functions/v1/helloasso', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

function paidIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 4242,
    metadata: { paiement: PAY },
    order: {
      id: 98765,
      date: '2026-11-15T23:30:00+00:00',
      amount: { total: 1500 },
      payments: [{ amount: 1500, state: 'Authorized', date: '2026-11-15T23:30:00+00:00' }],
    },
    ...overrides,
  }
}

describe('ouvrir le paiement', () => {
  it('crée le paiement chez HelloAsso avec le montant de la base', async () => {
    const res = await handler()(post({ action: 'checkout', payment: PAY, base: BASE }, 'jeton-awa'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ redirectUrl: 'https://www.helloasso-sandbox.com/paiement/4242' })
    const created = httpCalls.find((c) => c.method === 'POST' && c.url.endsWith('/checkout-intents'))
    expect(created?.url).toBe('https://api.helloasso-sandbox.com/v5/organizations/aegb-brest/checkout-intents')
    expect(created?.body).toMatchObject({
      totalAmount: 1500,
      initialAmount: 1500,
      itemName: 'Cotisation AEGB, Septembre à novembre 2026',
      returnUrl: `${BASE}app/cotisation/retour/${PAY}`,
      errorUrl: `${BASE}app/cotisation/retour/${PAY}`,
      backUrl: `${BASE}app/cotisation/payer`,
      containsDonation: false,
      payer: { email: 'awa@exemple.fr', firstName: 'Awa', lastName: 'Diallo' },
      metadata: { paiement: PAY },
    })
    expect(rpcCalls).toContainEqual({ name: 'helloasso_attach', args: { p_payment: PAY, p_intent: 4242 } })
  })

  it('réessaie sans payeur prérempli si HelloAsso le refuse', async () => {
    refusePayer = true
    const res = await handler()(post({ action: 'checkout', payment: PAY, base: BASE }, 'jeton-awa'))
    expect(res.status).toBe(200)
    const tries = httpCalls.filter((c) => c.method === 'POST' && c.url.endsWith('/checkout-intents'))
    expect(tries).toHaveLength(2)
    expect((tries[1].body as { payer?: unknown }).payer).toBeUndefined()
  })

  it("refuse le paiement d'un autre membre", async () => {
    const res = await handler()(post({ action: 'checkout', payment: PAY, base: BASE }, 'jeton-bakary'))
    expect(res.status).toBe(404)
    expect(httpCalls).toHaveLength(0)
  })

  it('refuse sans connexion', async () => {
    const res = await handler()(post({ action: 'checkout', payment: PAY, base: BASE }))
    expect(res.status).toBe(401)
    const other = await handler()(post({ action: 'checkout', payment: PAY, base: BASE }, 'jeton-inconnu'))
    expect(other.status).toBe(401)
  })

  it('refuse une adresse de retour inconnue', async () => {
    const res = await handler()(post({ action: 'checkout', payment: PAY, base: 'https://pirate.example/' }, 'jeton-awa'))
    expect(res.status).toBe(400)
    expect(httpCalls).toHaveLength(0)
  })

  it('refuse un paiement déjà terminé', async () => {
    payment.status = 'confirme'
    const res = await handler()(post({ action: 'checkout', payment: PAY, base: BASE }, 'jeton-awa'))
    expect(res.status).toBe(409)
  })

  it("dit que la carte n'est pas branchée sans identifiants", async () => {
    const res = await handler({ clientId: undefined })(post({ action: 'checkout', payment: PAY, base: BASE }, 'jeton-awa'))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/pas encore branché/)
    const status = await handler({ clientId: undefined })(post({ action: 'status' }, 'jeton-awa'))
    expect(await status.json()).toEqual({ ready: false, mode: 'sandbox' })
  })
})

describe('vérifier le paiement', () => {
  it('confirme quand HelloAsso a reçu le bon montant', async () => {
    payment.checkout_intent_id = 4242
    intent = paidIntent()
    const res = await handler()(post({ action: 'verify', payment: PAY }, 'jeton-awa'))
    expect(await res.json()).toEqual({ status: 'confirme' })
    // Payé à 23 h 30 UTC le 15 : c'est déjà le 16 à Brest.
    expect(rpcCalls).toContainEqual({
      name: 'helloasso_confirm',
      args: { p_payment: PAY, p_reference: '98765', p_paid_on: '2026-11-16' },
    })
  })

  it('attend tant que HelloAsso n’a rien reçu', async () => {
    payment.checkout_intent_id = 4242
    intent = { id: 4242, metadata: { paiement: PAY } }
    const res = await handler()(post({ action: 'verify', payment: PAY }, 'jeton-awa'))
    expect(await res.json()).toEqual({ status: 'en_attente' })
    expect(rpcCalls.map((c) => c.name)).not.toContain('helloasso_confirm')
  })

  it('ne confirme pas un montant plus petit', async () => {
    payment.checkout_intent_id = 4242
    intent = paidIntent({
      order: { id: 1, amount: { total: 500 }, payments: [{ amount: 500, state: 'Authorized' }] },
    })
    const res = await handler()(post({ action: 'verify', payment: PAY }, 'jeton-awa'))
    expect(await res.json()).toEqual({ status: 'en_attente' })
  })

  it('ne confirme pas un paiement refusé', async () => {
    payment.checkout_intent_id = 4242
    intent = paidIntent({
      order: { id: 1, amount: { total: 1500 }, payments: [{ amount: 1500, state: 'Refused' }] },
    })
    const res = await handler()(post({ action: 'verify', payment: PAY }, 'jeton-awa'))
    expect(await res.json()).toEqual({ status: 'en_attente' })
  })

  it('abandonne un paiement jamais fini au bout de 2 heures', async () => {
    payment.created_at = '2026-11-15T07:00:00Z'
    const res = await handler()(post({ action: 'verify', payment: PAY }, 'jeton-awa'))
    expect(await res.json()).toEqual({ status: 'echec' })
    expect(rpcCalls).toContainEqual({ name: 'helloasso_fail', args: { p_payment: PAY } })
  })

  it("ne montre pas le paiement d'un autre membre", async () => {
    const res = await handler()(post({ action: 'verify', payment: PAY }, 'jeton-bakary'))
    expect(res.status).toBe(404)
  })
})

describe('notification HelloAsso', () => {
  it('revérifie auprès d’HelloAsso avant de confirmer', async () => {
    payment.checkout_intent_id = 4242
    intent = paidIntent()
    const res = await handler()(post({ eventType: 'Order', data: { id: 98765 }, metadata: { paiement: PAY } }))
    expect(res.status).toBe(200)
    expect(httpCalls.some((c) => c.method === 'GET' && c.url.endsWith('/checkout-intents/4242'))).toBe(true)
    expect(payment.status).toBe('confirme')
  })

  it('ignore une fausse notification', async () => {
    payment.checkout_intent_id = 4242
    intent = { id: 4242, metadata: { paiement: PAY } }
    const res = await handler()(
      post({ eventType: 'Order', data: { amount: { total: 1500 } }, metadata: { paiement: PAY } }),
    )
    expect(res.status).toBe(200)
    expect(payment.status).toBe('en_attente')
  })

  it('ignore un paiement HelloAsso lié à un autre paiement', async () => {
    intent = paidIntent({ metadata: { paiement: '33333333-3333-4333-8333-333333333333' } })
    await handler()(post({ eventType: 'Order', data: { checkoutIntentId: 4242 }, metadata: { paiement: PAY } }))
    expect(payment.status).toBe('en_attente')
  })

  it('rattrape un paiement abandonné que HelloAsso a finalement reçu', async () => {
    payment.status = 'echec'
    payment.checkout_intent_id = 4242
    intent = paidIntent()
    await handler()(post({ eventType: 'Order', data: {}, metadata: { paiement: PAY } }))
    expect(payment.status).toBe('confirme')
  })
})

describe('outils', () => {
  it('lit les réglages', () => {
    const env: Record<string, string> = { HELLOASSO_ENV: 'production', APP_URLS: 'https://aegb.fr' }
    const c = readConfig((name) => env[name])
    expect(c.mode).toBe('production')
    expect(c.appUrls).toEqual([BASE, 'https://aegb.fr/'])
    expect(readConfig(() => undefined).appUrls).toContain('http://localhost:5173/')
  })

  it('ne préremplit que des noms acceptés par HelloAsso', () => {
    expect(payerFor({ first_name: 'Cronos', last_name: null, email: 'c@exemple.fr' })).toEqual({ email: 'c@exemple.fr' })
    expect(payerFor({ first_name: 'Marie-Aïssatou', last_name: "N'Diaye", email: null })).toEqual({
      firstName: 'Marie-Aïssatou',
      lastName: "N'Diaye",
    })
    expect(payerFor({ first_name: 'A2', last_name: 'B', email: null })).toBeUndefined()
  })

  it('donne la date à Brest', () => {
    expect(parisDate('2026-11-15T23:30:00Z')).toBe('2026-11-16')
    expect(parisDate('2026-07-01T21:00:00Z')).toBe('2026-07-01')
    expect(parisDate(undefined)).toBeNull()
  })
})
