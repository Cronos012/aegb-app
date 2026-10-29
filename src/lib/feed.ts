import { useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import type { Enums, Tables } from './database.types'
import { TYPE_LABELS } from './format'
import { can, isBureau, useBureauCounts, useMe, type Me, type Profile } from './queries'
import { supabase } from './supabase'

export type Audience = Enums<'post_audience'>
export type ReactionKind = Enums<'reaction_kind'>
export type ReportReason = Enums<'report_reason'>
export type Decision = Enums<'moderation_decision'>
export type Media = Tables<'post_media'>
export type Post = Tables<'posts'>

export const REACTIONS: { kind: ReactionKind; emoji: string; label: string; tone: string }[] = [
  { kind: 'jaime', emoji: '👍', label: "J'aime", tone: 'text-link' },
  { kind: 'jadore', emoji: '❤️', label: "J'adore", tone: 'text-danger' },
  { kind: 'rire', emoji: '😂', label: 'Haha', tone: 'text-warn' },
  { kind: 'wouah', emoji: '😮', label: 'Wouah', tone: 'text-warn' },
  { kind: 'triste', emoji: '😢', label: 'Triste', tone: 'text-warn' },
  { kind: 'soutien', emoji: '🤗', label: 'Solidaire', tone: 'text-warn' },
]

export const REACTION = Object.fromEntries(REACTIONS.map((r) => [r.kind, r])) as Record<ReactionKind, (typeof REACTIONS)[number]>

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'irrespect', label: 'Propos irrespectueux' },
  { value: 'fausse_info', label: 'Fausse information' },
  { value: 'spam', label: 'Spam ou publicité' },
  { value: 'choquant', label: 'Contenu choquant' },
  { value: 'autre', label: 'Autre chose' },
]

export const REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label])) as Record<ReportReason, string>

export const AUDIENCES: { value: Audience; label: string; short: string }[] = [
  { value: 'tous', label: 'Tous les membres', short: 'tous les membres' },
  { value: 'etudiants', label: 'Étudiants', short: 'les étudiants' },
  { value: 'alumni', label: 'Alumni', short: 'les alumni' },
  { value: 'bureau', label: 'Bureau seulement', short: 'le bureau' },
]

export const POST_MAX = 2000
export const COMMENT_MAX = 1000
export const OFFICIAL_NAME = "Bureau de l'AEGB"
const PAGE = 10

export type Person = Pick<Profile, 'id' | 'first_name' | 'last_name' | 'avatar_path' | 'member_type' | 'city'> & {
  role: { label: string } | null
}

type ReactionRow = { kind: ReactionKind; member_id: string }

export type FeedPost = Post & {
  author: Person | null
  post_media: Media[]
  reactions: ReactionRow[]
  comments: { count: number }[]
  /** Qui a écrit une annonce : seul le bureau des annonces le voit. */
  announcement_authors: { written_by_name: string } | null
}

export type Comment = Tables<'comments'> & {
  author: Person | null
  reactions: ReactionRow[]
}

const PERSON = 'id, first_name, last_name, avatar_path, member_type, city, role:bureau_roles!bureau_roles_holder_id_fkey(label)'
const POST_SELECT = `*, author:profiles!posts_author_id_fkey(${PERSON}), post_media(*), reactions(kind, member_id), comments(count), announcement_authors(written_by_name)`

function tidy(rows: unknown): FeedPost[] {
  return (rows as FeedPost[]).map((p) => ({ ...p, post_media: [...p.post_media].sort((a, b) => a.position - b.position) }))
}

/** Les publics qui me concernent : le fil ne montre que ça, même au bureau qui en voit plus. */
export function myAudiences(me: Me | undefined): Audience[] {
  const list: Audience[] = ['tous']
  if (me?.profile.member_type === 'etudiant') list.push('etudiants')
  if (me?.profile.member_type === 'alumni') list.push('alumni')
  if (isBureau(me)) list.push('bureau')
  return list
}

function useUid() {
  return useSession().session?.user.id
}

export function useFeed() {
  const uid = useUid()
  const me = useMe().data
  const audiences = myAudiences(me)
  return useInfiniteQuery({
    queryKey: ['fil', 'liste', uid, audiences.join()],
    enabled: !!uid && !!me,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('posts')
        .select(POST_SELECT)
        .lte('published_at', new Date().toISOString())
        .in('audience', audiences)
        .or(`hidden_at.is.null,author_id.eq.${uid}`)
        .order('published_at', { ascending: false })
        .limit(PAGE)
      if (pageParam) q = q.lt('published_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return tidy(data)
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].published_at : null),
  })
}

/** L'annonce épinglée en tête du fil : la plus récente, pendant 7 jours. */
export function usePinned() {
  const me = useMe().data
  const audiences = myAudiences(me)
  return useQuery({
    queryKey: ['fil', 'epingle', audiences.join()],
    enabled: !!me,
    queryFn: async () => {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('official', true)
        .gt('pinned_until', now)
        .lte('published_at', now)
        .in('audience', audiences)
        .is('hidden_at', null)
        .order('published_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return tidy(data)[0] ?? null
    },
  })
}

export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: ['fil', 'publication', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('posts').select(POST_SELECT).eq('id', id!).maybeSingle()
      if (error) throw error
      return data ? tidy([data])[0] : null
    },
  })
}

/** Les publications d'un membre, pour la grille de son profil. */
export function useMemberPosts(memberId: string | undefined) {
  const uid = useUid()
  return useQuery({
    queryKey: ['fil', 'membre', memberId],
    enabled: !!memberId && !!uid,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('posts')
        .select(POST_SELECT, { count: 'exact' })
        .eq('author_id', memberId!)
        .or(`hidden_at.is.null,author_id.eq.${uid}`)
        .order('published_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return { posts: tidy(data), count: count ?? data.length }
    },
  })
}

export function useComments(postId: string | undefined) {
  return useQuery({
    queryKey: ['fil', 'commentaires', postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select(`*, author:profiles!comments_author_id_fkey(${PERSON}), reactions(kind, member_id)`)
        .eq('post_id', postId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as Comment[]
    },
  })
}

export type Reactor = { kind: ReactionKind; member: Pick<Profile, 'id' | 'first_name' | 'last_name' | 'avatar_path' | 'member_type'> | null }

export function useReactors(target: { post?: string; comment?: string } | null) {
  return useQuery({
    queryKey: ['fil', 'reactions', target?.post ?? null, target?.comment ?? null],
    enabled: !!target,
    queryFn: async () => {
      let q = supabase.from('reactions').select('kind, member:profiles!reactions_member_id_fkey(id, first_name, last_name, avatar_path, member_type)').order('created_at', { ascending: false })
      q = target!.post ? q.eq('post_id', target!.post) : q.eq('comment_id', target!.comment!)
      const { data, error } = await q
      if (error) throw error
      return data as unknown as Reactor[]
    },
  })
}

/** Les publications qui contiennent ces mots. */
export function useSearchPosts(text: string) {
  const uid = useUid()
  const me = useMe().data
  const audiences = myAudiences(me)
  const clean = text.replace(/[%_,()*\\"]/g, ' ').trim()
  return useQuery({
    queryKey: ['fil', 'recherche', clean, audiences.join()],
    enabled: clean.length >= 2 && !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .or(`body.ilike.%${clean}%,title.ilike.%${clean}%`)
        .lte('published_at', new Date().toISOString())
        .in('audience', audiences)
        .or(`hidden_at.is.null,author_id.eq.${uid}`)
        .order('published_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return tidy(data)
    },
  })
}

/* ----------------------------------------------------------------------------
   Réactions
---------------------------------------------------------------------------- */

export type ReactionSummary = { total: number; top: ReactionKind[]; mine: ReactionKind | null; counts: Partial<Record<ReactionKind, number>> }

/** Compte les réactions. mine : ce que je viens de choisir, avant que la base réponde. */
export function summarize(rows: ReactionRow[], uid: string | undefined, mine?: ReactionKind | null): ReactionSummary {
  const list = mine === undefined ? rows : [...rows.filter((r) => r.member_id !== uid), ...(mine && uid ? [{ kind: mine, member_id: uid }] : [])]
  const counts: Partial<Record<ReactionKind, number>> = {}
  for (const r of list) counts[r.kind] = (counts[r.kind] ?? 0) + 1
  const top = (Object.keys(counts) as ReactionKind[]).sort((a, b) => counts[b]! - counts[a]!).slice(0, 3)
  return { total: list.length, top, mine: list.find((r) => r.member_id === uid)?.kind ?? null, counts }
}

/** Les fonctions de la base veulent null, pas un champ absent. Les types générés ne le disent pas. */
export function orNull<T>(value: T | null | undefined): T {
  return (value ?? null) as T
}

export async function react(target: { post?: string; comment?: string }, kind: ReactionKind | null) {
  const { error } = await supabase.rpc('react', { p_post: orNull(target.post), p_comment: orNull(target.comment), p_kind: orNull(kind) })
  if (error) throw error
}

/** Rafraîchit le fil et les écrans qui montrent des publications. */
export function useRefreshFeed() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['fil'] })
}

/* ----------------------------------------------------------------------------
   Annonces vues
---------------------------------------------------------------------------- */

const seen = new Set<string>()
let queue: string[] = []
let seenTimer: ReturnType<typeof setTimeout> | null = null

/** Compte une annonce comme vue, une fois par session. Sans réseau, tant pis : ce n'est qu'un compteur. */
export function markSeen(id: string) {
  if (seen.has(id)) return
  seen.add(id)
  queue.push(id)
  seenTimer ??= setTimeout(async () => {
    const ids = queue
    queue = []
    seenTimer = null
    await supabase.rpc('mark_seen', { p_ids: ids })
  }, 1500)
}

/* ----------------------------------------------------------------------------
   Bureau
---------------------------------------------------------------------------- */

export function useModerationPending(enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'moderation', 'compteur'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('moderation_pending')
      if (error) throw error
      return data ?? 0
    },
  })
}

export type QueueItem = {
  post_id: string | null
  comment_id: string | null
  parent_post_id: string | null
  parent_author_name: string | null
  author_id: string | null
  author_first_name: string | null
  author_last_name: string | null
  author_avatar_path: string | null
  body: string
  media_path: string | null
  media_kind: string | null
  created_at: string
  hidden: boolean
  reports: number
  reasons: Partial<Record<ReportReason, number>>
  last_reported_at: string
  warnings: number
  last_warning_at: string | null
  last_warning_reason: string | null
}

export function useModerationQueue() {
  return useQuery({
    queryKey: ['bureau', 'moderation', 'file'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('moderation_queue')
      if (error) throw error
      return data as unknown as QueueItem[]
    },
  })
}

export function useModerationDecisions() {
  return useQuery({
    queryKey: ['bureau', 'moderation', 'decisions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('moderation_decisions').select('*').order('created_at', { ascending: false }).limit(50)
      if (error) throw error
      return data
    },
  })
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ['bureau', 'annonces'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('announcements_overview')
      if (error) throw error
      return data
    },
  })
}

export function useStorageUsed(enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'stockage'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('storage_used')
      if (error) throw error
      return data
    },
  })
}

/* ----------------------------------------------------------------------------
   Membres
---------------------------------------------------------------------------- */

export type DirectoryMember = Pick<Profile, 'id' | 'first_name' | 'last_name' | 'avatar_path' | 'member_type' | 'city' | 'school' | 'formation' | 'validated_at'> & {
  role: { label: string } | null
}

/** L'annuaire : les membres actifs, avec leur poste au bureau. */
export function useDirectory() {
  return useQuery({
    queryKey: ['annuaire'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_path, member_type, city, school, formation, validated_at, role:bureau_roles!bureau_roles_holder_id_fkey(label)')
        .eq('status', 'actif')
        .order('first_name')
        .order('last_name')
      if (error) throw error
      return data as unknown as DirectoryMember[]
    },
  })
}

export type PublicProfile = DirectoryMember & Pick<Profile, 'cover_path' | 'bio' | 'status'>

/** Le profil d'un autre membre, tel que tout le monde le voit : sans email ni téléphone. */
export function useProfile(id: string | undefined) {
  return useQuery({
    queryKey: ['profil', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_path, cover_path, bio, status, member_type, city, school, formation, validated_at, role:bureau_roles!bureau_roles_holder_id_fkey(label)')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data as unknown as PublicProfile | null
    },
  })
}

/** Sans accents ni majuscules, pour que « Djenabou » trouve « Djénabou ». */
function plain(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function matches(m: DirectoryMember, query: string): boolean {
  const words = plain(query).split(/\s+/).filter(Boolean)
  const hay = plain([m.first_name, m.last_name, m.city, m.school, m.formation, m.role?.label].filter(Boolean).join(' '))
  return words.every((w) => hay.includes(w))
}

/** « Présidence · Brest, UBO » */
export function memberLine(m: DirectoryMember): string {
  const place = [m.city, m.school].filter(Boolean).join(', ')
  return [m.role?.label ?? TYPE_LABELS[m.member_type], place].filter(Boolean).join(' · ')
}

/** « Vice-présidence », ou « Étudiant à Brest ». */
export function personLine(p: Person): string {
  if (p.role) return p.role.label
  return `${TYPE_LABELS[p.member_type]}${p.city ? ` à ${p.city}` : ''}`
}

/** Ce qui attend le bureau : les comptes à valider et les signalements à examiner. */
export function useBureauBadge(): number | null {
  const me = useMe().data
  const bureau = isBureau(me)
  const accounts = useBureauCounts(bureau && can(me, 'comptes', 'lecture')).data?.pending ?? 0
  const reports = useModerationPending(bureau && can(me, 'moderation', 'lecture')).data ?? 0
  return accounts + reports || null
}

/** L'heure à l'ouverture de l'écran : assez précis pour savoir si une annonce est encore épinglée. */
export function useNow(): number {
  const [now] = useState(() => Date.now())
  return now
}
