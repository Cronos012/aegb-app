// Fonction serveur « helloasso » : le paiement des cotisations par carte.
//
// L'appli l'appelle pour ouvrir le paiement chez HelloAsso (checkout) et pour
// savoir s'il a abouti (verify). HelloAsso l'appelle aussi à chaque paiement
// (notification). Dans tous les cas, un paiement n'est confirmé qu'après une
// vérification directe auprès d'HelloAsso : ni le téléphone ni la
// notification ne suffisent. Le montant vient toujours de la base.
//
// Ce fichier ne dépend pas de Deno : index.ts lui fournit la base et le réseau,
// les tests (handler.test.ts) des imitations.

export type Mode = 'sandbox' | 'production'

export interface Config {
  clientId?: string
  clientSecret?: string
  org?: string
  mode: Mode
  /** Adresses de l'appli acceptées pour le retour après paiement. */
  appUrls: string[]
}

export interface Deps {
  config: Config
  fetch: typeof fetch
  /** L'identifiant du membre connecté, ou null si le jeton n'est pas valable. */
  userFromToken: (token: string) => Promise<string | null>
  /** Appelle une fonction de la base avec la clé serveur. */
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>
  now?: () => Date
}

type PaymentStatus = 'en_attente' | 'confirme' | 'echec' | 'annule'

interface Payment {
  id: string
  member_id: string | null
  status: PaymentStatus
  method: string
  amount_cents: number
  label: string
  checkout_intent_id: number | null
  created_at: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

interface HelloAssoPayment {
  amount?: number
  state?: string
  date?: string
}

interface HelloAssoIntent {
  id: number
  redirectUrl?: string
  metadata?: Record<string, unknown>
  order?: {
    id: number
    date?: string
    amount?: { total?: number }
    payments?: HelloAssoPayment[]
  }
}

const API: Record<Mode, string> = {
  sandbox: 'https://api.helloasso-sandbox.com',
  production: 'https://api.helloasso.com',
}

const DEFAULT_APP_URL = 'https://cronos012.github.io/aegb-app/'
const LOCAL_APP_URLS = ['http://localhost:5173/', 'http://127.0.0.1:5173/']

/** Un paiement par carte jamais fini est abandonné au bout de 2 heures. */
const ABANDON_MS = 2 * 60 * 60 * 1000
const PAID_STATES = new Set(['Authorized', 'Processed'])

const NOT_READY =
  "Le paiement par carte n'est pas encore branché. Tu peux régler en espèces, par virement ou par chèque auprès de la trésorerie."

class Fail extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

class ApiError extends Error {
  status: number
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

/** Lit les réglages dans les variables d'environnement de la fonction. */
export function readConfig(env: (name: string) => string | undefined): Config {
  const mode: Mode = env('HELLOASSO_ENV') === 'production' ? 'production' : 'sandbox'
  const listed = (env('APP_URLS') ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .map(withSlash)
  const appUrls = [...new Set([DEFAULT_APP_URL, ...listed, ...(mode === 'sandbox' ? LOCAL_APP_URLS : [])])]
  return {
    clientId: env('HELLOASSO_CLIENT_ID') || undefined,
    clientSecret: env('HELLOASSO_CLIENT_SECRET') || undefined,
    org: env('HELLOASSO_ORG') || undefined,
    mode,
    appUrls,
  }
}

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** La date du paiement, à l'heure de Brest (AAAA-MM-JJ). */
export function parisDate(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

const NAME = /^\p{L}[\p{L}' -]*\p{L}$/u

/** Le payeur prérempli chez HelloAsso, seulement avec des noms qu'il accepte. */
export function payerFor(p: Pick<Payment, 'first_name' | 'last_name' | 'email'>): Record<string, string> | undefined {
  const payer: Record<string, string> = {}
  if (p.email) payer.email = p.email
  const first = p.first_name?.trim() ?? ''
  const last = p.last_name?.trim() ?? ''
  if (NAME.test(first) && NAME.test(last) && first.toLowerCase() !== last.toLowerCase()) {
    payer.firstName = first
    payer.lastName = last
  }
  return Object.keys(payer).length > 0 ? payer : undefined
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  })
}

export function createHandler(deps: Deps) {
  const { config } = deps
  const now = deps.now ?? (() => new Date())
  const ready = Boolean(config.clientId && config.clientSecret && config.org)
  let cachedToken: { value: string; until: number } | null = null

  async function token(): Promise<string> {
    if (cachedToken && cachedToken.until > now().getTime() + 60_000) return cachedToken.value
    const res = await deps.fetch(`${API[config.mode]}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId ?? '',
        client_secret: config.clientSecret ?? '',
      }).toString(),
    })
    if (!res.ok) {
      console.error('HelloAsso : connexion refusée', res.status, await res.text())
      throw new Fail(502, "HelloAsso refuse la connexion de l'appli. Préviens la trésorerie.")
    }
    const body = (await res.json()) as { access_token: string; expires_in?: number }
    cachedToken = { value: body.access_token, until: now().getTime() + (body.expires_in ?? 1800) * 1000 }
    return body.access_token
  }

  async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T | null> {
    const res = await deps.fetch(`${API[config.mode]}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await token()}`,
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 404) return null
    if (!res.ok) throw new ApiError(res.status, await res.text())
    return (await res.json()) as T
  }

  async function loadPayment(id: string): Promise<Payment | null> {
    return (await deps.rpc('helloasso_payment', { p_payment: id })) as Payment | null
  }

  /** Ouvre le paiement chez HelloAsso et renvoie l'adresse où envoyer le membre. */
  async function checkout(userId: string, body: Record<string, unknown>) {
    if (!isUuid(body.payment)) throw new Fail(400, 'Paiement inconnu.')
    const base = typeof body.base === 'string' ? withSlash(body.base) : ''
    if (!config.appUrls.includes(base)) throw new Fail(400, "Cette adresse de l'appli n'est pas reconnue.")
    const p = await loadPayment(body.payment)
    if (!p || p.member_id !== userId || p.method !== 'carte') throw new Fail(404, "Ce paiement n'existe pas.")
    if (p.status !== 'en_attente') throw new Fail(409, 'Ce paiement est déjà terminé. Recommence depuis « Payer ma cotisation ».')

    // L'identifiant du paiement est dans le chemin : HelloAsso ajoute ses
    // propres paramètres (checkoutIntentId, code, orderId) à la fin.
    const back = `${base}app/cotisation/retour/${p.id}`
    const intent = {
      totalAmount: p.amount_cents,
      initialAmount: p.amount_cents,
      itemName: `Cotisation AEGB, ${p.label}`.slice(0, 250),
      backUrl: `${base}app/cotisation/payer`,
      errorUrl: back,
      returnUrl: back,
      containsDonation: false,
      payer: payerFor(p),
      metadata: { paiement: p.id },
    }
    const path = `/v5/organizations/${encodeURIComponent(config.org ?? '')}/checkout-intents`
    let created: HelloAssoIntent | null
    try {
      created = await api<HelloAssoIntent>('POST', path, intent)
    } catch (error) {
      // HelloAsso refuse parfois un payeur prérempli : on réessaie sans.
      if (!(error instanceof ApiError) || error.status !== 400 || !intent.payer) throw error
      console.warn('HelloAsso : payeur refusé, nouvel essai sans', error.message)
      created = await api<HelloAssoIntent>('POST', path, { ...intent, payer: undefined })
    }
    if (!created?.id || !created.redirectUrl) throw new Fail(502, "HelloAsso n'a pas ouvert le paiement. Réessaie dans un instant.")
    await deps.rpc('helloasso_attach', { p_payment: p.id, p_intent: created.id })
    return { redirectUrl: created.redirectUrl }
  }

  /**
   * Demande à HelloAsso où en est le paiement et met la base à jour.
   * intentId : le paiement ouvert chez HelloAsso, si la notification le donne.
   */
  async function settle(p: Payment, intentId: number | null): Promise<PaymentStatus> {
    if (p.status === 'confirme' || p.status === 'annule') return p.status
    const id = intentId ?? p.checkout_intent_id
    if (id) {
      const intent = await api<HelloAssoIntent>(
        'GET',
        `/v5/organizations/${encodeURIComponent(config.org ?? '')}/checkout-intents/${id}`,
      )
      const order = intent?.order
      if (intent && String(intent.metadata?.paiement ?? '') === p.id && order) {
        const paid = (order.payments ?? []).filter((x) => PAID_STATES.has(x.state ?? ''))
        const received = order.amount?.total ?? paid.reduce((sum, x) => sum + (x.amount ?? 0), 0)
        if (paid.length > 0 && received >= p.amount_cents) {
          await deps.rpc('helloasso_confirm', {
            p_payment: p.id,
            p_reference: String(order.id),
            p_paid_on: parisDate(paid[0].date ?? order.date),
          })
          return 'confirme'
        }
        if (paid.length > 0) {
          console.error('HelloAsso : montant reçu différent', p.id, received, p.amount_cents)
        }
      }
    }
    if (p.status === 'en_attente' && now().getTime() - new Date(p.created_at).getTime() > ABANDON_MS) {
      await deps.rpc('helloasso_fail', { p_payment: p.id })
      return 'echec'
    }
    return p.status
  }

  async function verify(userId: string, body: Record<string, unknown>) {
    if (!isUuid(body.payment)) throw new Fail(400, 'Paiement inconnu.')
    const p = await loadPayment(body.payment)
    if (!p || p.member_id !== userId || p.method !== 'carte') throw new Fail(404, "Ce paiement n'existe pas.")
    return { status: await settle(p, null) }
  }

  /** Notification d'HelloAsso : jamais crue sur parole, toujours revérifiée. */
  async function notification(body: Record<string, unknown>) {
    const data = (body.data ?? {}) as Record<string, unknown>
    const metadata = (body.metadata ?? data.metadata ?? {}) as Record<string, unknown>
    const paymentId = metadata.paiement
    if (!ready || !isUuid(paymentId)) return { ok: true }
    const p = await loadPayment(paymentId)
    if (!p || p.method !== 'carte') return { ok: true }
    const intentId = Number(data.checkoutIntentId)
    return { ok: true, status: await settle(p, Number.isInteger(intentId) && intentId > 0 ? intentId : null) }
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST') return json(405, { error: 'Méthode non prise en charge.' })
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return json(400, { error: 'Demande illisible.' })
    }
    if (!body || typeof body !== 'object') return json(400, { error: 'Demande illisible.' })

    try {
      if ('eventType' in body) return json(200, await notification(body))

      const header = req.headers.get('authorization') ?? ''
      const userId = header.startsWith('Bearer ') ? await deps.userFromToken(header.slice(7)) : null
      if (!userId) return json(401, { error: 'Reconnecte-toi pour payer ta cotisation.' })

      switch (body.action) {
        case 'status':
          return json(200, { ready, mode: config.mode })
        case 'checkout':
          if (!ready) return json(503, { error: NOT_READY })
          return json(200, await checkout(userId, body))
        case 'verify':
          if (!ready) return json(503, { error: NOT_READY })
          return json(200, await verify(userId, body))
        default:
          return json(400, { error: 'Action inconnue.' })
      }
    } catch (error) {
      if (error instanceof Fail) return json(error.status, { error: error.message })
      console.error('helloasso', error)
      return json(502, { error: "Le paiement n'a pas pu être vérifié. Réessaie dans un instant." })
    }
  }
}
