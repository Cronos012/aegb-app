import { useQuery } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import type { MemberType } from './format'
import { useAction } from './queries'
import { supabase } from './supabase'

/* ----------------------------------------------------------------------------
   L'assemblée générale et les élections (lot 5). Tout vient des fonctions
   assembly_view (membre) et assembly_admin (bureau), qui renvoient du JSON.
---------------------------------------------------------------------------- */

/** actif : vote et peut se présenter. suspendu : étudiant en retard (article 32). consultatif : alumni, sympathisant, honneur. */
export type VoteRight = 'actif' | 'suspendu' | 'consultatif' | 'aucun'
export type AssemblyStatus = 'brouillon' | 'convoquee' | 'vote' | 'depouillement' | 'publiee' | 'carence' | 'annulee'
export type AssemblyKind = 'ordinaire' | 'extraordinaire'
export type ItemKind = 'resolution' | 'election' | 'discussion'
export type CandidacyStatus = 'deposee' | 'validee' | 'refusee' | 'retiree'
export type Outcome = 'adoptee' | 'rejetee' | 'pourvu' | 'vacant' | 'egalite'

export type Person = {
  id: string
  first_name: string
  last_name: string
  avatar_path: string | null
  formation: string | null
  school: string | null
  member_type: MemberType
}

export type Candidacy = {
  id: string
  role: string
  member: Person
  statement: string
  status: CandidacyStatus
  created_at: string
  reason: string | null
  /** Occupe aujourd'hui un poste du bureau. */
  outgoing: boolean
  // Pour le bureau seulement :
  paper?: boolean
  decided_at?: string | null
  decided_by_name?: string | null
  withdrawn_at?: string | null
  right?: VoteRight
}

export type Seat = { role: string; label: string; candidates: Candidacy[] }
export type Item = { id: string; position: number; kind: ItemKind; title: string; detail: string | null; seats: string[] }

export type Result = {
  counts: Record<string, number>
  expressed: number
  outcome: Outcome
  winner: string | null
  tied: string[]
}

export type Question = {
  id: string
  position: number
  kind: 'resolution' | 'poste'
  item_id: string | null
  role: string | null
  title: string
  detail: string | null
  /** Les candidatures, dans l'ordre du bulletin. */
  candidates: string[]
  result: Result | null
}

export type Reminder = { sent_at: string; recipients: number; sent_by_name: string }

export type Ballot = {
  id: string
  round: 1 | 2
  status: 'ouvert' | 'ferme' | 'detruit'
  opened_at: string
  opened_by_name: string
  closes_at: string
  closed_at: string | null
  closed_by_name: string | null
  quorum_reached_at: string | null
  electors: number
  voters: number
  quorum: number
  voted_at: string | null
  questions: Question[]
  reminders: Reminder[] | null
}

export type Assembly = {
  id: string
  kind: AssemblyKind
  convocation: 1 | 2
  status: AssemblyStatus
  held_at: string
  place: string
  vote_opens_at: string
  vote_closes_at: string
  candidacy_until: string | null
  mandate_start: string | null
  mandate_year: number
  convened_at: string | null
  convened_count: number | null
  published_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  /** L'heure de la base, pour les comptes à rebours. */
  now: string
  items: Item[]
  seats: Seat[]
  ballots: Ballot[]
  first: { id: string; held_at: string; status: AssemblyStatus; electors: number | null; voters: number | null; quorum: number | null } | null
  my: { right: VoteRight; late_cents: number | null; can_run: boolean; candidacy: Candidacy | null }
}

export type EmargementRow = Person & { voted_at: string | null }
export type Handover = {
  role: string
  member: Person
  effective_on: string
  confirmed_at: string | null
  confirmed_by_name: string | null
  applied_at: string | null
}

export type AdminView = {
  assembly: Assembly | null
  history: { id: string; kind: AssemblyKind; convocation: 1 | 2; status: AssemblyStatus; held_at: string }[]
  /** Membres actifs : ceux qui reçoivent la convocation. */
  members: number
  /** La liste électorale si le vote s'ouvrait maintenant (avant le vote seulement). */
  electorate: number | null
  roles: { code: string; label: string }[]
  emargement?: EmargementRow[]
  handovers?: Handover[]
}

export type PendingHandover = {
  assembly: string
  held_at: string
  role: string
  label: string
  member: Person
  effective_on: string
  confirmed_at: string | null
  confirmed_by_name: string | null
}

/* ----------------------------------------------------------------------------
   Lectures
---------------------------------------------------------------------------- */

/** Le tour ouvert, sinon le dernier. */
export function currentBallot(a: Assembly | null | undefined): Ballot | null {
  if (!a?.ballots.length) return null
  return a.ballots.find((b) => b.status === 'ouvert') ?? a.ballots[a.ballots.length - 1]
}

export function openBallot(a: Assembly | null | undefined): Ballot | null {
  return a?.ballots.find((b) => b.status === 'ouvert') ?? null
}

export function useAssembly(id?: string) {
  const { session } = useSession()
  return useQuery({
    queryKey: ['assemblee', 'membre', id ?? 'courante', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('assembly_view', id ? { p_id: id } : {})
      if (error) throw error
      return (data ?? null) as unknown as Assembly | null
    },
    // Pendant le vote, la participation bouge : on relit souvent.
    refetchInterval: (query) => (openBallot(query.state.data) ? 10_000 : false),
  })
}

export function useAssemblyAdmin(id?: string, enabled = true) {
  return useQuery({
    queryKey: ['assemblee', 'bureau', id ?? 'courante'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('assembly_admin', id ? { p_id: id } : {})
      if (error) throw error
      return data as unknown as AdminView
    },
    refetchInterval: (query) => (openBallot(query.state.data?.assembly) ? 5_000 : false),
  })
}

export function usePendingHandovers(enabled = true) {
  return useQuery({
    queryKey: ['assemblee', 'passation'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pending_handovers')
      if (error) throw error
      return (data ?? []) as unknown as PendingHandover[]
    },
  })
}

/* ----------------------------------------------------------------------------
   Actions
---------------------------------------------------------------------------- */

const REFRESH = [['assemblee'], ['fil'], ['messages'], ['bureau']]

export type DraftItem = { kind: ItemKind; title: string; detail: string; seats: string[] }
export type Draft = {
  id: string | null
  kind: AssemblyKind
  held_at: string
  place: string
  vote_opens_at: string
  vote_closes_at: string
  candidacy_until: string | null
  mandate_start: string | null
  items: DraftItem[]
}

export function useElectionActions() {
  return {
    save: useAction((d: Draft) =>
      supabase.rpc('save_assembly', {
        p_id: d.id,
        p_kind: d.kind,
        p_held_at: d.held_at,
        p_place: d.place,
        p_vote_opens_at: d.vote_opens_at,
        p_vote_closes_at: d.vote_closes_at,
        p_candidacy_until: d.candidacy_until,
        p_mandate_start: d.mandate_start,
        p_items: d.items.map((i) => ({ kind: i.kind, title: i.title, detail: i.detail, seats: i.kind === 'election' ? i.seats : [] })),
      }), REFRESH),
    convene: useAction((v: { id: string; force: boolean }) => supabase.rpc('send_convocation', { p_id: v.id, p_force: v.force }), REFRESH),
    cancel: useAction((v: { id: string; reason?: string }) => supabase.rpc('cancel_assembly', { p_id: v.id, p_reason: v.reason }), REFRESH),
    decide: useAction((v: { id: string; valid: boolean; reason?: string }) =>
      supabase.rpc('decide_candidacy', { p_id: v.id, p_valid: v.valid, p_reason: v.reason }), REFRESH),
    addPaper: useAction((v: { assembly: string; member: string; role: string; statement: string }) =>
      supabase.rpc('add_paper_candidacy', { p_assembly: v.assembly, p_member: v.member, p_role: v.role, p_statement: v.statement }), REFRESH),
    open: useAction((id: string) => supabase.rpc('open_vote', { p_assembly: id }), REFRESH),
    remind: useAction((ballot: string) => supabase.rpc('remind_voters', { p_ballot: ballot }), REFRESH),
    close: useAction((ballot: string) => supabase.rpc('close_vote', { p_ballot: ballot }), REFRESH),
    secondRound: useAction((id: string) => supabase.rpc('open_second_round', { p_assembly: id }), REFRESH),
    publish: useAction((id: string) => supabase.rpc('publish_results', { p_assembly: id }), REFRESH),
    secondAssembly: useAction((v: { first: string; held_at: string; place: string; vote_opens_at: string; vote_closes_at: string }) =>
      supabase.rpc('convene_second_assembly', {
        p_first: v.first,
        p_held_at: v.held_at,
        p_place: v.place,
        p_vote_opens_at: v.vote_opens_at,
        p_vote_closes_at: v.vote_closes_at,
      }), REFRESH),
    confirmHandover: useAction((id: string) => supabase.rpc('confirm_handover', { p_assembly: id }), [...REFRESH, ['postes'], ['me']]),
    clear: useAction(() => supabase.rpc('clear_elections'), REFRESH),
  }
}

export function useCandidacyActions() {
  return {
    submit: useAction((v: { assembly: string; role: string; statement: string }) =>
      supabase.rpc('submit_candidacy', { p_assembly: v.assembly, p_role: v.role, p_statement: v.statement }), REFRESH),
    withdraw: useAction((id: string) => supabase.rpc('withdraw_candidacy', { p_id: id }), REFRESH),
  }
}

export function useCastVote() {
  return useAction((v: { ballot: string; choices: Record<string, string> }) => supabase.rpc('cast_vote', { p_ballot: v.ballot, p_choices: v.choices }), REFRESH)
}

/* ----------------------------------------------------------------------------
   Libellés et calculs
---------------------------------------------------------------------------- */

const TZ = 'Europe/Paris'

function fmt(date: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...options }).format(new Date(date))
}

/** « 14 h », « 23 h 59 » */
export function hour(date: string | Date): string {
  const [h, m] = fmt(date, { hour: '2-digit', minute: '2-digit' }).split(':').map(Number)
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/** « samedi 12 décembre » */
export function day(date: string | Date): string {
  return fmt(date, { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^(\S+) 1 /, '$1 1er ')
}

/** « samedi 12 décembre 2026 » */
export function dayYear(date: string | Date): string {
  return fmt(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^(\S+) 1 /, '$1 1er ')
}

/** « 12 décembre » */
export function dayMonth(date: string | Date): string {
  return fmt(date, { day: 'numeric', month: 'long' }).replace(/^1 /, '1er ')
}

/** « 12 déc. » */
export function dayShort(date: string | Date): string {
  return fmt(date, { day: 'numeric', month: 'short' })
}

/** « 1er janvier 2027 » pour une date « AAAA-MM-JJ ». */
export function plainDay(dayIso: string): string {
  const [y, m, d] = dayIso.slice(0, 10).split('-').map(Number)
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  return `${d === 1 ? '1er' : d} ${months[m - 1]} ${y}`
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** « AG ordinaire », « Seconde AG extraordinaire » */
export function kindLabel(a: Pick<Assembly, 'kind' | 'convocation'>): string {
  return `${a.convocation === 2 ? 'Seconde AG' : 'AG'} ${a.kind}`
}

/** « Encore 1 h 12 », « Encore 9 jours » */
export function remaining(until: string, now: number): string {
  const minutes = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000))
  if (minutes >= 48 * 60) return `${Math.floor(minutes / (24 * 60))} jours`
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
  return `${minutes} min`
}

export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((100 * part) / total) : 0
}

/** Les points de l'ordre du jour : « 6 points, dont 4 résolutions ». */
export function agendaLine(a: Assembly): string {
  const n = a.items.length
  const res = a.items.filter((i) => i.kind === 'resolution').length
  const base = `${n} point${n > 1 ? 's' : ''}`
  return res ? `${base}, dont ${res} résolution${res > 1 ? 's' : ''}` : base
}

export function candidatesLine(a: Assembly, staff = false): string {
  const n = a.seats.reduce((sum, s) => sum + s.candidates.filter((c) => staff || c.status === 'validee').length, 0)
  const seats = a.seats.length
  if (!seats) return 'Pas d’élection à cette AG'
  if (!n) return `Aucun candidat pour l’instant, ${seats} poste${seats > 1 ? 's' : ''}`
  return `${n} candidat${n > 1 ? 's' : ''} pour ${seats} poste${seats > 1 ? 's' : ''}`
}

/** Toutes les candidatures de l'AG, par identifiant. */
export function candidacyMap(a: Assembly): Map<string, Candidacy> {
  const map = new Map<string, Candidacy>()
  for (const s of a.seats) for (const c of s.candidates) map.set(c.id, c)
  return map
}

/** L'étape de la frise : 0 préparation, 1 candidatures (ou convocation), 2 vote, 3 résultats. */
export function stepOf(a: Assembly): number {
  switch (a.status) {
    case 'brouillon':
      return 0
    case 'convoquee':
    case 'annulee':
      return 1
    case 'vote':
      return 2
    default:
      return 3
  }
}

/** Le choix d'un membre pour une question, en mots. */
export function choiceLabel(q: Question, choice: string | undefined, names: Map<string, Candidacy>): string {
  if (!choice) return '—'
  if (q.kind === 'resolution') return { pour: 'Pour', contre: 'Contre', abstention: 'Abstention' }[choice] ?? choice
  if (choice === 'blanc') return 'Vote blanc'
  if (q.candidates.length === 1) {
    const c = names.get(q.candidates[0])
    const who = c ? `${c.member.first_name} ${c.member.last_name}` : ''
    return choice === 'pour' ? `Pour · ${who}` : `Contre · ${who}`
  }
  const c = names.get(choice)
  return c ? `${c.member.first_name} ${c.member.last_name}` : choice
}

/** Le résultat final d'un poste : celui du second tour s'il a eu lieu. */
export function seatResults(a: Assembly): { role: string; label: string; question: Question | null; round: number; firstRound: Question | null }[] {
  return a.seats.map((s) => {
    let question: Question | null = null
    let firstRound: Question | null = null
    let round = 0
    for (const b of a.ballots) {
      const q = b.questions.find((x) => x.role === s.role)
      if (!q) continue
      if (b.round === 1) firstRound = q
      question = q
      round = b.round
    }
    return { role: s.role, label: s.label, question, round, firstRound }
  })
}

/** Ce qu'une personne a obtenu : voix et pourcentage des exprimés. */
export function votesFor(q: Question, candidacy: string): number {
  if (!q.result) return 0
  if (q.candidates.length === 1) return q.result.counts.pour ?? 0
  return q.result.counts[candidacy] ?? 0
}

export function personLine(p: Pick<Person, 'formation' | 'school'>): string {
  return [p.formation, p.school].filter(Boolean).join(' · ')
}

/** Une date-heure locale « AAAA-MM-JJTHH:MM » (champ de formulaire) en instant ISO, heure de Paris. */
export function parisToIso(local: string): string {
  const [d, t] = local.split('T')
  const [y, m, day] = d.split('-').map(Number)
  const [h, min] = (t ?? '00:00').split(':').map(Number)
  // On cherche le décalage de Paris à cette date.
  const guess = Date.UTC(y, m - 1, day, h, min)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asParis = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
  return new Date(guess - (asParis - guess)).toISOString()
}

/** Un instant ISO en « AAAA-MM-JJTHH:MM », heure de Paris (pour les champs de formulaire). */
export function isoToParis(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`
}
