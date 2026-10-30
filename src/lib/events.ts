import { useQuery } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { euros, functionError } from './dues'
import { capitalize, day, hour } from './elections'
import type { MemberType } from './format'
import { useAction } from './queries'
import { supabase } from './supabase'

/* ----------------------------------------------------------------------------
   Les événements (lot 6). Tout vient des fonctions events_list, event_view et
   event_people (membre), events_admin et event_admin (bureau), en JSON.
---------------------------------------------------------------------------- */

export type EventStatus = 'brouillon' | 'publie' | 'annule'
export type Face = { id: string; first_name: string; last_name: string; avatar_path: string | null }

export type EventCard = {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  online: boolean
  place: string | null
  photo_path: string | null
  capacity: number | null
  member_price_cents: number
  guest_price_cents: number | null
  up_to_date_only: boolean
  status: EventStatus
  assembly_id: string | null
  post_id: string | null
  cancel_reason: string | null
  going: number
  waiting: number
  faces: Face[]
  /** Ma place : inscrit, ou sur la liste d'attente avec mon rang. */
  mine: { status: 'inscrit' | 'attente'; rank: number | null } | null
  paid: boolean
}

export type EventDetail = EventCard & {
  description: string
  link: string | null
  pay_in_app: boolean
  pay_on_site: boolean
  published_at: string | null
  dues_ok: boolean
  assembly: {
    kind: 'ordinaire' | 'extraordinaire'
    convocation: 1 | 2
    status: string
    vote_opens_at: string
    vote_closes_at: string
    items: string[]
  } | null
  payment: { method: string; amount_cents: number; paid_on: string | null } | null
  pending_payment: string | null
}

export type EventPerson = {
  id: string
  first_name: string
  last_name: string
  avatar_path: string | null
  formation: string | null
  school: string | null
  member_type: MemberType
  me: boolean
}

export type AdminCard = EventCard & { present: number; paid_count: number }

export type AdminPerson = Omit<EventPerson, 'me'> & {
  status: 'inscrit' | 'attente'
  registered_at: string
  walk_in: boolean
  present: boolean
  checked_at: string | null
  dues_status: 'a_jour' | 'retard' | 'pas_due' | 'pas_encore' | null
  payment: { id: string; method: string; amount_cents: number; paid_on: string | null; recorded_by_name: string | null } | null
}

export type Refund = {
  payment: string
  member_id: string | null
  member_name: string
  method: string
  amount_cents: number
  paid_on: string | null
  ledger_id: number | null
  ledger_number: number | null
}

export type AdminEvent = AdminCard & {
  description: string
  link: string | null
  pay_in_app: boolean
  pay_on_site: boolean
  public_site: boolean
  published_at: string | null
  reminded_at: string | null
  cancelled_at: string | null
  created_by_name: string
  created_at: string
  updated_by_name: string | null
  people: AdminPerson[]
  refunds: Refund[]
}

/* ----------------------------------------------------------------------------
   Lectures
---------------------------------------------------------------------------- */

export function useEvents(enabled = true) {
  const { session } = useSession()
  return useQuery({
    queryKey: ['evenements', 'liste', session?.user.id],
    enabled: enabled && !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('events_list')
      if (error) throw error
      return (data ?? []) as unknown as EventCard[]
    },
  })
}

export function useEvent(id: string | undefined) {
  const { session } = useSession()
  return useQuery({
    queryKey: ['evenements', 'detail', id, session?.user.id],
    enabled: !!id && !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('event_view', { p_id: id! })
      if (error) throw error
      return data as unknown as EventDetail
    },
  })
}

export function useEventPeople(id: string | undefined) {
  return useQuery({
    queryKey: ['evenements', 'participants', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('event_people', { p_id: id! })
      if (error) throw error
      return data as unknown as { going: EventPerson[]; waiting: EventPerson[] }
    },
  })
}

export type PublicEvent = Pick<EventCard, 'id' | 'title' | 'starts_at' | 'ends_at' | 'online' | 'place' | 'photo_path'>

/** Les événements que le bureau montre sur le site : titre, date, lieu et photo, jamais les participants. */
export function usePublicEvents() {
  return useQuery({
    queryKey: ['evenements', 'site'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_events')
      if (error) throw error
      return (data ?? []) as unknown as PublicEvent[]
    },
  })
}

export function useEventsAdmin(enabled = true) {
  return useQuery({
    queryKey: ['evenements', 'bureau'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('events_admin')
      if (error) throw error
      return (data ?? []) as unknown as AdminCard[]
    },
  })
}

export function useEventAdmin(id: string | undefined) {
  return useQuery({
    queryKey: ['evenements', 'bureau', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('event_admin', { p_id: id! })
      if (error) throw error
      return data as unknown as AdminEvent
    },
  })
}

export function useEventPayment(id: string | undefined) {
  return useQuery({
    queryKey: ['evenements', 'paiement', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('event_payment_status', { p_payment: id! })
      if (error) throw error
      return data as unknown as { id: string; status: 'en_attente' | 'confirme' | 'echec' | 'annule'; amount_cents: number; event: string; title: string } | null
    },
  })
}

/* ----------------------------------------------------------------------------
   Actions
---------------------------------------------------------------------------- */

const REFRESH = [['evenements'], ['fil'], ['messages'], ['bureau']]

export type EventDraft = {
  title: string
  description: string
  starts_at: string
  ends_at: string | null
  online: boolean
  place: string | null
  link: string | null
  photo_path: string | null
  capacity: number | null
  member_price_cents: number
  guest_price_cents: number | null
  pay_in_app: boolean
  pay_on_site: boolean
  up_to_date_only: boolean
  public_site: boolean
}

export function useEventActions() {
  return {
    join: useAction((id: string) => supabase.rpc('join_event', { p_id: id }), REFRESH),
    leave: useAction((id: string) => supabase.rpc('leave_event', { p_id: id }), REFRESH),
    save: useAction((v: { id: string; data: EventDraft; publish: boolean }) => supabase.rpc('save_event', { p_id: v.id, p_data: v.data, p_publish: v.publish }), REFRESH),
    cancel: useAction((v: { id: string; reason: string }) => supabase.rpc('cancel_event', { p_id: v.id, p_reason: v.reason }), REFRESH),
    checkIn: useAction((v: { event: string; member: string; present: boolean }) => supabase.rpc('check_in', { p_event: v.event, p_member: v.member, p_present: v.present }), REFRESH),
    cash: useAction((v: { event: string; member: string }) => supabase.rpc('record_event_payment', { p_event: v.event, p_member: v.member, p_method: 'especes' }), [...REFRESH, ['tresorerie']]),
  }
}

/** Ouvre le paiement d'une place chez HelloAsso et renvoie l'adresse où aller. */
export async function startEventPayment(eventId: string): Promise<string> {
  const started = await supabase.rpc('start_event_payment', { p_id: eventId })
  if (started.error) throw started.error
  const payment = (started.data as { id: string }).id
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`
  const { data, error } = await supabase.functions.invoke('helloasso', { body: { action: 'checkout', payment, base } })
  if (error) throw await functionError(error)
  return (data as { redirectUrl: string }).redirectUrl
}

/* ----------------------------------------------------------------------------
   Libellés
---------------------------------------------------------------------------- */

const TZ = 'Europe/Paris'

function parts(date: string | Date) {
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short' }).formatToParts(new Date(date))
  return {
    day: f.find((p) => p.type === 'day')?.value ?? '',
    month: (f.find((p) => p.type === 'month')?.value ?? '').toUpperCase(),
  }
}

/** Le jour et le mois de la petite pastille : « 5 », « DÉC. ». */
export function badgeParts(date: string | Date) {
  return parts(date)
}

export function eventEnd(e: Pick<EventCard, 'starts_at' | 'ends_at'>): Date {
  return e.ends_at ? new Date(e.ends_at) : new Date(new Date(e.starts_at).getTime() + 4 * 3600_000)
}

export function isPast(e: Pick<EventCard, 'starts_at' | 'ends_at'>, now = Date.now()): boolean {
  return eventEnd(e).getTime() <= now
}

export function hasStarted(e: Pick<EventCard, 'starts_at'>, now = Date.now()): boolean {
  return new Date(e.starts_at).getTime() <= now
}

/** « Samedi 5 décembre, 19 h à 23 h » */
export function whenLong(e: Pick<EventCard, 'starts_at' | 'ends_at'>): string {
  const start = capitalize(day(e.starts_at))
  if (!e.ends_at) return `${start}, ${hour(e.starts_at)}`
  if (day(e.ends_at) !== day(e.starts_at)) return `${start}, ${hour(e.starts_at)}, au ${day(e.ends_at)}, ${hour(e.ends_at)}`
  return `${start}, ${hour(e.starts_at)} à ${hour(e.ends_at)}`
}

/** « Samedi, 19 h » cette semaine, « Samedi 5 décembre, 19 h » plus loin. */
export function whenShort(e: Pick<EventCard, 'starts_at'>, now = Date.now()): string {
  const days = (new Date(e.starts_at).getTime() - now) / 86_400_000
  const weekday = capitalize(new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long' }).format(new Date(e.starts_at)))
  return days >= 0 && days < 6 ? `${weekday}, ${hour(e.starts_at)}` : `${capitalize(day(e.starts_at))}, ${hour(e.starts_at)}`
}

export function whereShort(e: Pick<EventCard, 'online' | 'place'>): string {
  return e.online ? 'en ligne' : (e.place ?? '')
}

/** « 5 € », ou rien quand c'est gratuit. */
export function priceLabel(e: Pick<EventCard, 'member_price_cents'>): string | null {
  return e.member_price_cents > 0 ? euros(e.member_price_cents) : null
}

/** « Samedi, 19 h · Maison de l'étudiant · 5 € » */
export function cardLine(e: EventCard, now = Date.now()): string {
  return [whenShort(e, now), whereShort(e), priceLabel(e)].filter(Boolean).join(' · ')
}

export function isFull(e: Pick<EventCard, 'capacity' | 'going'>): boolean {
  return e.capacity != null && e.going >= e.capacity
}

/** « 80 participants », « 15 sur 22 places », « 41 en salle » */
export function countLine(e: EventCard): string {
  if (e.assembly_id) return `${e.going} en salle`
  if (e.capacity != null && !isFull(e)) return `${e.going} sur ${e.capacity} places`
  return `${e.going} participant${e.going > 1 ? 's' : ''}`
}

/** « 1re », « 5e » */
export function rank(n: number): string {
  return n === 1 ? '1re' : `${n}e`
}

/** « Fatoumata, Mamadou et 78 autres y vont » */
export function goingLine(e: EventCard, uid: string | undefined): string {
  const others = e.faces.filter((f) => f.id !== uid)
  const meGoing = e.mine?.status === 'inscrit'
  const total = e.going - (meGoing ? 1 : 0)
  if (total <= 0) return meGoing ? 'Tu es la seule personne inscrite pour l’instant' : 'Personne pour l’instant'
  const names = others.slice(0, 2).map((f) => f.first_name)
  const rest = total - names.length
  const who = rest > 0 ? `${names.join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}` : names.length === 2 ? `${names[0]} et ${names[1]}` : names[0]
  return `${meGoing ? 'Toi, ' : ''}${who} ${total + (meGoing ? 1 : 0) > 1 ? 'y vont' : 'y va'}`
}

/** Le lien d'un plan pour l'adresse. */
export function mapUrl(place: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(place)}`
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function icsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
}

type IcsEvent = Pick<EventDetail, 'id' | 'title' | 'starts_at' | 'ends_at' | 'online' | 'place'> & { description?: string }

/** Un fichier .ics, pour ajouter un ou plusieurs événements à l'agenda du téléphone. */
export function downloadIcs(list: IcsEvent[], name?: string) {
  const events = list.flatMap((e) =>
    [
      'BEGIN:VEVENT',
      `UID:${e.id}@aegb`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(new Date(e.starts_at))}`,
      `DTEND:${icsDate(eventEnd(e))}`,
      `SUMMARY:${icsText(e.title)}`,
      e.online ? 'LOCATION:En ligne' : e.place ? `LOCATION:${icsText(e.place)}` : '',
      e.description ? `DESCRIPTION:${icsText(e.description.slice(0, 900))}` : '',
      'END:VEVENT',
    ].filter(Boolean),
  )
  const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AEGB//Evenements//FR', ...events, 'END:VCALENDAR'].join('\r\n')
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const base = name ?? list[0]?.title ?? 'evenements'
  a.href = url
  a.download = `${base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'evenement'}.ics`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** « vendredi » : le jour du rappel, la veille à 18 h. */
export function reminderDay(e: Pick<EventCard, 'starts_at'>): string {
  const before = new Date(new Date(e.starts_at).getTime() - 86_400_000)
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long' }).format(before)
}
