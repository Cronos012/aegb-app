import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { useSession } from '../auth/session'
import type { Enums, Tables } from './database.types'
import { TYPE_PLURALS, type MemberType } from './format'
import { BUREAU, useMe } from './queries'
import { supabase } from './supabase'

export type PayMethod = Enums<'pay_method'>
export type Payment = Tables<'dues_payments'>
export type Receipt = Tables<'dues_receipts'>
export type DuesSettings = Tables<'dues_settings'>
/** discreet : écriture signée « Le bureau » pour les autres ; seul le titulaire du poste d'admin numérique en voit l'auteur. */
export type LedgerEntry = Tables<'ledger_entries'> & { discreet?: boolean }

export type MonthState = 'paye' | 'retard' | 'en_cours' | 'a_venir' | 'pas_du'
export type DuesStatus = 'a_jour' | 'retard' | 'pas_due' | 'pas_encore'
export type DuesMonth = { month: string; state: MonthState; amount_cents: number | null; payment_id: string | null }

/** Où en est la cotisation d'un membre, calculé par la base (fonction dues_state). */
export type DuesState = {
  member_id: string
  first_name: string
  member_type: MemberType
  paying: boolean
  status: DuesStatus
  today: string
  current_month: string
  exercise_start: string
  horizon: string
  start_month: string
  dues_from: string | null
  monthly_cents: number
  solidarity_months: number
  late: string[]
  late_cents: number
  first_unpaid: string | null
  paid_until: string | null
  solidarity_suspended: boolean
  months: DuesMonth[]
}

/* ----------------------------------------------------------------------------
   Mise en forme. Les dates de la base arrivent en « AAAA-MM-JJ » : on les lit
   telles quelles, sans fuseau horaire, pour ne jamais décaler d'un jour.
---------------------------------------------------------------------------- */

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTHS_SHORT = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']
const MONTHS_LETTER = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  return [y, m, d]
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** « Sept. » */
export function monthShort(month: string): string {
  return MONTHS_SHORT[parts(month)[1] - 1]
}

/** « S » */
export function monthLetter(month: string): string {
  return MONTHS_LETTER[parts(month)[1] - 1]
}

/** « septembre » */
export function monthName(month: string): string {
  return MONTHS[parts(month)[1] - 1]
}

/** « septembre 2026 » */
export function monthYearLabel(month: string): string {
  const [y, m] = parts(month)
  return `${MONTHS[m - 1]} ${y}`
}

/** « 31 décembre 2026 », « 1er mars 2027 » */
export function frenchDay(day: string): string {
  const [y, m, d] = parts(day)
  return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`
}

/** « 28 oct. » */
export function shortDay(day: string): string {
  const [, m, d] = parts(day)
  return `${d} ${MONTHS_SHORT[m - 1].toLowerCase()}`
}

/** Le dernier jour du mois. */
export function endOfMonth(month: string): string {
  const [y, m] = parts(month)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

/** Le 1er du mois, d mois plus tard (ou plus tôt). */
export function addMonths(month: string, d: number): string {
  const [y, m] = parts(month)
  const date = new Date(Date.UTC(y, m - 1 + d, 1))
  return date.toISOString().slice(0, 10)
}

/** « 2026-2027 » */
export function exerciseLabel(start: string): string {
  const y = parts(start)[0]
  return `${y}-${y + 1}`
}

/** Comme la base : « Septembre et octobre 2026 », « Octobre à décembre 2026 », « Septembre 2026 à mars 2027 ». */
export function monthsLabel(months: string[]): string {
  const list = [...new Set(months.map((m) => m.slice(0, 7)))].sort().map((m) => `${m}-01`)
  const n = list.length
  if (!n) return ''
  const first = list[0]
  const last = list[n - 1]
  const [fy, fm] = parts(first)
  const [ly, lm] = parts(last)
  if (n === 1) return capitalize(`${MONTHS[fm - 1]} ${fy}`)
  const join = n === 2 ? ' et ' : ' à '
  if ((ly - fy) * 12 + lm - fm + 1 === n) {
    return capitalize(fy === ly ? `${MONTHS[fm - 1]}${join}${MONTHS[lm - 1]} ${ly}` : `${MONTHS[fm - 1]} ${fy}${join}${MONTHS[lm - 1]} ${ly}`)
  }
  const items = list.map((m, i) => {
    const [y, mo] = parts(m)
    const next = list[i + 1]
    return MONTHS[mo - 1] + (!next || parts(next)[0] !== y ? ` ${y}` : '')
  })
  return capitalize(`${items.slice(0, -1).join(', ')} et ${items[n - 1]}`)
}

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const EUR_ROUND = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** 1500 → « 15 € », 1550 → « 15,50 € ». */
export function euros(cents: number): string {
  return (cents % 100 === 0 ? EUR_ROUND : EUR).format(cents / 100)
}

/** Toujours avec les centimes : « 15,00 € ». */
export function eurosExact(cents: number): string {
  return EUR.format(cents / 100)
}

/** Pour le journal : « +15,00 € », « −120,00 € ». */
export function signedEuros(cents: number): string {
  return `${cents < 0 ? '−' : '+'}${EUR.format(Math.abs(cents) / 100)}`
}

export const METHOD_LABELS: Record<PayMethod, string> = {
  carte: 'Carte',
  especes: 'Espèces',
  virement: 'Virement',
  cheque: 'Chèque',
}

/** « par carte », « en espèces » */
export const METHOD_PHRASES: Record<PayMethod, string> = {
  carte: 'par carte',
  especes: 'en espèces',
  virement: 'par virement',
  cheque: 'par chèque',
}

/** Les moyens du journal financier, HelloAsso compris. */
export const LEDGER_METHODS: Record<string, string> = {
  helloasso: 'HelloAsso',
  especes: 'Espèces',
  virement: 'Virement',
  cheque: 'Chèque',
  carte: 'Carte',
  prelevement: 'Prélèvement',
}

export const LEDGER_CATEGORIES: Record<string, string> = {
  cotisation: 'Cotisation',
  evenements: 'Événements',
  dons: 'Dons',
  subventions: 'Subventions',
  fonctionnement: 'Fonctionnement',
  banque: 'Banque',
  ouverture: 'Solde de départ',
  correction: 'Correction',
  autre: 'Autre',
}

export const REVERSE_REASONS: { value: string; label: string; detail: string }[] = [
  { value: 'montant', label: 'Montant erroné', detail: 'La somme saisie n’est pas la bonne.' },
  { value: 'membre', label: 'Mauvais membre', detail: 'Le paiement a été noté pour quelqu’un d’autre.' },
  { value: 'mois', label: 'Mauvais mois', detail: 'Les mois couverts ne sont pas les bons.' },
  { value: 'rembourse', label: 'Paiement remboursé', detail: 'L’argent a été rendu au membre.' },
  { value: 'autre', label: 'Autre motif', detail: 'Explique-le dans les précisions.' },
]

/** Les mois qu'un paiement jusqu'à « until » couvrirait : les mois en retard, puis ceux à venir, sans ceux déjà payés. */
export function monthsUntil(state: DuesState, until: string): string[] {
  const set = new Set<string>(state.late)
  for (const m of state.months) {
    if ((m.state === 'en_cours' || m.state === 'a_venir') && m.month >= (state.first_unpaid ?? m.month)) set.add(m.month)
  }
  return [...set].filter((m) => m <= until).sort()
}

/** Les mois qu'on peut choisir comme « jusqu'à » pour payer. */
export function payableMonths(state: DuesState): string[] {
  return state.months.filter((m) => m.state !== 'paye' && m.state !== 'pas_du' && (!state.first_unpaid || m.month >= state.first_unpaid)).map((m) => m.month)
}

/** Le mois proposé par défaut : tout le retard, ou le prochain mois à payer. */
export function defaultUntil(state: DuesState): string | null {
  if (state.late.length) return state.late[state.late.length - 1]
  return payableMonths(state)[0] ?? null
}

/* ----------------------------------------------------------------------------
   Lectures
---------------------------------------------------------------------------- */

export function useMyDues() {
  const { session } = useSession()
  return useQuery({
    queryKey: ['cotisation', 'moi', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_dues')
      if (error) throw error
      return data as unknown as DuesState
    },
  })
}

export function useDuesSettings() {
  return useQuery({
    queryKey: ['cotisation', 'reglages'],
    queryFn: async () => {
      const { data, error } = await supabase.from('dues_settings').select('*').single()
      if (error) throw error
      return data
    },
  })
}

/** Les paiements terminés d'un membre (le sien, ou n'importe lequel pour la trésorerie). */
export function usePayments(memberId: string | undefined) {
  return useQuery({
    queryKey: ['cotisation', 'paiements', memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dues_payments')
        .select('*')
        .eq('member_id', memberId!)
        .in('status', ['confirme', 'annule'])
        .order('confirmed_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useReceipt(number: string | undefined) {
  return useQuery({
    queryKey: ['cotisation', 'quittance', number],
    enabled: !!number,
    queryFn: async () => {
      const { data, error } = await supabase.from('dues_receipts').select('*').eq('number', number!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function usePayment(id: string | undefined) {
  return useQuery({
    queryKey: ['cotisation', 'paiement', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('dues_payments').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Le paiement par carte est-il branché ? (identifiants HelloAsso posés côté serveur) */
export function useCardPayments() {
  return useQuery({
    queryKey: ['cotisation', 'carte'],
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('helloasso', { body: { action: 'status' } })
      if (error) throw await functionError(error)
      return data as { ready: boolean; mode: 'sandbox' | 'production' }
    },
  })
}

export type MatrixRow = {
  member_id: string
  first_name: string
  last_name: string
  avatar_path: string | null
  member_type: MemberType
  status: Enums<'member_status'>
  dues: DuesState
}

export function useDuesMatrix(enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'cotisations'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dues_matrix')
      if (error) throw error
      return data as unknown as MatrixRow[]
    },
  })
}

export function useMemberDues(memberId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'cotisation', memberId],
    enabled: enabled && !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('member_dues', { p_member: memberId! })
      if (error) throw error
      return data as unknown as DuesState
    },
  })
}

export function useLedger(enabled = true) {
  const guarantor = useMe().data?.guarantor ?? false
  return useQuery({
    queryKey: ['bureau', 'journal-financier', guarantor],
    enabled,
    queryFn: async (): Promise<LedgerEntry[]> => {
      const { data, error } = await supabase.from('ledger_entries').select('*').order('number', { ascending: false }).limit(2000)
      if (error) throw error
      const ids = data.filter((e) => !e.created_by && e.created_by_name === BUREAU).map((e) => e.id)
      if (!guarantor || !ids.length) return data
      const names = await supabase.rpc('discreet_ledger_authors', { p_ids: ids })
      if (names.error) throw names.error
      const map = new Map(names.data.map((n) => [n.ledger_id, n.actor_name]))
      return data.map((e) => (map.has(e.id) ? { ...e, created_by_name: map.get(e.id)!, discreet: true } : e))
    },
  })
}

/* ----------------------------------------------------------------------------
   Paiement par carte
---------------------------------------------------------------------------- */

/** Le message d'erreur renvoyé par la fonction serveur, prêt pour errorMessage(). */
export async function functionError(error: unknown): Promise<{ message: string; code: string }> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string }
      if (body.error) return { message: body.error, code: 'P0001' }
    } catch {
      // Réponse illisible : message général.
    }
  }
  return { message: error instanceof Error ? error.message : String(error), code: '' }
}

/** Prépare le paiement dans la base puis l'ouvre chez HelloAsso. Renvoie l'adresse de la page de paiement. */
export async function startCardPayment(until: string): Promise<string> {
  const started = await supabase.rpc('start_card_payment', { p_until: until })
  if (started.error) throw started.error
  const payment = (started.data as { id: string }).id
  const base = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
  const { data, error } = await supabase.functions.invoke('helloasso', { body: { action: 'checkout', payment, base } })
  if (error) throw await functionError(error)
  return (data as { redirectUrl: string }).redirectUrl
}

export async function verifyCardPayment(payment: string): Promise<Payment['status']> {
  const { data, error } = await supabase.functions.invoke('helloasso', { body: { action: 'verify', payment } })
  if (error) throw await functionError(error)
  return (data as { status: Payment['status'] }).status
}

/** Le statut en quelques mots, pour les listes du bureau. */
export function statusShort(s: Pick<DuesState, 'status' | 'late'>): { label: string; tone: 'ok' | 'danger' | 'neutral' } {
  if (s.status === 'retard') return { label: `${s.late.length} mois de retard`, tone: 'danger' }
  if (s.status === 'a_jour') return { label: 'À jour', tone: 'ok' }
  if (s.status === 'pas_encore') return { label: 'Pas encore due', tone: 'neutral' }
  return { label: 'Pas due', tone: 'neutral' }
}

/** Les mois par année de cotisation : 12 en temps normal, 24 en juillet et août. */
export function byExercise(months: DuesMonth[]): { label: string; months: DuesMonth[] }[] {
  const out: { label: string; months: DuesMonth[] }[] = []
  for (let i = 0; i < months.length; i += 12) {
    const slice = months.slice(i, i + 12)
    if (slice.length) out.push({ label: exerciseLabel(slice[0].month), months: slice })
  }
  return out
}

/** Ce qu'un membre a payé pour l'année en cours. */
export function paidThisYear(s: DuesState): number {
  return s.months.slice(0, 12).reduce((sum, m) => sum + (m.state === 'paye' ? (m.amount_cents ?? 0) : 0), 0)
}

export type LegendKey = MonthState | 'choisi'

/** Les états présents, pour n'afficher que la légende utile. */
export function legendFor(months: DuesMonth[], withChoice = false): LegendKey[] {
  const present = new Set(months.map((m) => m.state))
  const order: MonthState[] = ['paye', 'retard', 'en_cours', 'a_venir', 'pas_du']
  const items: LegendKey[] = order.filter((s) => present.has(s))
  return withChoice ? ['choisi', ...items] : items
}

export type Summary = { tone: 'ok' | 'danger' | 'neutral'; title: string; detail: string }

/** Ce que dit l'encadré du haut : « À jour, jusqu'au 31 décembre 2026 », « 2 mois de retard »… */
export function duesSummary(s: DuesState): Summary {
  if (s.status === 'pas_due') {
    return { tone: 'neutral', title: 'Pas due', detail: `Les ${TYPE_PLURALS[s.member_type].toLowerCase()} n'ont rien à payer` }
  }
  if (s.status === 'pas_encore') {
    return { tone: 'neutral', title: 'Pas encore due', detail: `Les cotisations commencent le ${frenchDay(s.dues_from ?? s.start_month)}` }
  }
  if (s.status === 'retard') {
    return { tone: 'danger', title: `${s.late.length} mois de retard`, detail: `${monthsLabel(s.late)}, soit ${euros(s.late_cents)}` }
  }
  if (s.paid_until) return { tone: 'ok', title: 'À jour', detail: `Jusqu'au ${frenchDay(s.paid_until)}` }
  const month = monthName(s.current_month)
  return { tone: 'ok', title: 'À jour', detail: `${month.charAt(0).toUpperCase()}${month.slice(1)} à régler avant le ${frenchDay(endOfMonth(s.current_month))}` }
}

/** Ce que dit le droit de solidarité, selon le retard. */
export function solidarityLine(s: DuesState): string {
  if (!s.paying) return 'Tu gardes tous tes droits'
  if (s.solidarity_suspended) return `Suspendu : ${s.late.length} mois de retard`
  if (s.late.length) return `Actif, suspendu à ${s.solidarity_months} mois de retard`
  return 'Actif, car tu es à jour'
}
