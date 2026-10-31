// La fonction serveur « push » : la base l'appelle (sans rien lui confier)
// quand des notifications attendent. Elle prend la file, l'envoie aux
// appareils, puis dit à la base ce qui est parti et quels abonnements
// n'existent plus. Un appel de trop ne fait rien de plus : la file ne se
// prend qu'une fois.
//
// GET rend la clé publique, que l'appli donne au navigateur pour s'abonner.

import { buildPushRequest, topicFor, type PushSubscription, type VapidKeys } from './webpush.ts'

export interface Item {
  id: number
  device_id: string | null
  category: string
  tag: string
  title: string
  body: string
  link: string
  quiet: boolean
}

export interface Device extends PushSubscription {
  id: string
}

export interface Group {
  member_id: string
  badge: number
  items: Item[]
  devices: Device[]
}

export interface Message {
  ids: number[]
  title: string
  body: string
  link: string
  tag: string
  deviceId: string | null
  urgency: 'normal' | 'high'
}

export interface Deps {
  keys: VapidKeys | null
  subject: string
  rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>
  fetch: (url: string, init: RequestInit) => Promise<Response>
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const MESSAGES = new Set(['prives', 'groupes'])

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`
}

/**
 * Ce qui part pour un membre. Pendant les heures calmes, tout a attendu :
 * une seule notification arrive au réveil. Sinon, une par tag (la plus
 * récente), puisque l'appareil remplace celle de même tag.
 */
export function plan(items: Item[]): Message[] {
  const out: Message[] = []
  const quiet = items.filter((i) => i.quiet && !i.device_id)
  const rest = items.filter((i) => !(i.quiet && !i.device_id))
  if (quiet.length > 1) {
    const messages = quiet.filter((i) => MESSAGES.has(i.category)).length
    const others = quiet.length - messages
    const parts = [messages ? plural(messages, 'message') : '', others ? plural(others, 'notification') : ''].filter(Boolean)
    out.push({
      ids: quiet.map((i) => i.id),
      title: 'AEGB',
      body: `Pendant les heures calmes : ${parts.join(' et ')}.`,
      link: others ? '/app/notifications' : '/app/messages',
      tag: 'heures-calmes',
      deviceId: null,
      urgency: 'normal',
    })
  } else {
    rest.unshift(...quiet)
  }

  const byTag = new Map<string, Item[]>()
  for (const item of rest) {
    const key = `${item.tag}|${item.device_id ?? ''}`
    byTag.set(key, [...(byTag.get(key) ?? []), item])
  }
  for (const list of byTag.values()) {
    const last = list[list.length - 1]
    out.push({
      ids: list.map((i) => i.id),
      title: last.title,
      body: last.body,
      link: last.link,
      tag: last.tag,
      deviceId: last.device_id,
      urgency: MESSAGES.has(last.category) || last.category === 'essai' ? 'high' : 'normal',
    })
  }
  return out
}

type Outcome = 'ok' | 'gone' | 'failed'

function outcomeOf(status: number): Outcome {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 404 || status === 410) return 'gone'
  return 'failed'
}

async function sendGroup(deps: Deps, keys: VapidKeys, group: Group) {
  const results = new Map<string, Outcome>()
  let sent = 0
  for (const message of plan(group.items)) {
    const devices = group.devices.filter((d) => !message.deviceId || d.id === message.deviceId)
    const topic = await topicFor(message.tag)
    await Promise.all(
      devices.map(async (device) => {
        if (results.get(device.id) === 'gone') return
        let outcome: Outcome = 'failed'
        try {
          const req = await buildPushRequest(
            device,
            { title: message.title, body: message.body, link: message.link, tag: message.tag, badge: group.badge },
            keys,
            deps.subject,
            { urgency: message.urgency, topic },
          )
          const res = await deps.fetch(req.url, req.init as RequestInit)
          outcome = outcomeOf(res.status)
          await res.body?.cancel()
        } catch {
          outcome = 'failed'
        }
        if (outcome === 'ok') sent++
        const before = results.get(device.id)
        if (outcome === 'gone' || before === undefined || (before === 'failed' && outcome === 'ok')) results.set(device.id, outcome)
      }),
    )
  }
  for (const device of group.devices) {
    const outcome = results.get(device.id)
    if (outcome) await deps.rpc('push_device_result', { p_device: device.id, p_ok: outcome === 'ok', p_gone: outcome === 'gone' })
  }
  await deps.rpc('push_done', { p_ids: group.items.map((i) => i.id) })
  return { sent, gone: [...results.values()].filter((o) => o === 'gone').length }
}

/** Vide la file : quelques tours au plus, au cas où elle se remplit pendant l'envoi. */
export async function drain(deps: Deps): Promise<{ sent: number; gone: number; members: number }> {
  const total = { sent: 0, gone: 0, members: 0 }
  if (!deps.keys) return total
  for (let round = 0; round < 5; round++) {
    const groups = ((await deps.rpc('push_claim', { p_limit: 300 })) ?? []) as Group[]
    if (groups.length === 0) break
    for (let i = 0; i < groups.length; i += 10) {
      const results = await Promise.all(groups.slice(i, i + 10).map((g) => sendGroup(deps, deps.keys!, g)))
      for (const r of results) {
        total.sent += r.sent
        total.gone += r.gone
        total.members++
      }
    }
  }
  return total
}

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (req.method === 'GET') {
      if (!deps.keys) return json({ error: 'Les clés des notifications ne sont pas encore en place.' }, 503)
      return json({ publicKey: deps.keys.publicKey })
    }
    if (req.method !== 'POST') return json({ error: 'Méthode non prise en charge.' }, 405)
    if (!deps.keys) return json({ error: 'Les clés des notifications ne sont pas encore en place.' }, 503)
    try {
      return json(await drain(deps))
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }
}

export function readKeys(env: (name: string) => string | undefined): VapidKeys | null {
  const publicKey = env('VAPID_PUBLIC_KEY')
  const privateKey = env('VAPID_PRIVATE_KEY')
  return publicKey && privateKey ? { publicKey, privateKey } : null
}
