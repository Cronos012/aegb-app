import { useEffect } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import type { Enums, Json } from './database.types'
import { prepareImage } from './images'
import { removeFiles } from './photos'
import { can, useMe } from './queries'
import { supabase } from './supabase'

/*
  Les messages ne se lisent que par les fonctions de la base : elles cachent
  ce qui a été supprimé ou masqué, et ce qu'envoie un membre bloqué. L'appli
  écoute en direct les conversations et leurs membres, puis recharge.
*/

export type ConversationKind = Enums<'conversation_kind'>
export type MessageKind = 'message' | 'bienvenue' | 'arrivee' | 'systeme' | 'cotisation' | 'assemblee' | 'evenement'

/** Les cartes « evenement » du compte AEGB (lot 6). */
export type EventMessageType = 'place' | 'desinscription' | 'paiement' | 'changement' | 'annulation' | 'rappel' | 'rembourse' | 'paiement_annule'
export type FileKind = 'photo' | 'vocal' | 'document'
export type AssemblyMessageType =
  | 'convocation' | 'seconde' | 'ouverture' | 'second_tour' | 'relance' | 'annulation'
  | 'candidature_validee' | 'candidature_refusee' | 'candidature_retiree'

export type ConversationRow = {
  id: string
  kind: ConversationKind
  title: string
  photo_path: string | null
  other_id: string | null
  other_first_name: string | null
  other_last_name: string | null
  other_avatar_path: string | null
  members: number
  last_at: string
  last_kind: MessageKind | null
  last_sender_id: string | null
  last_sender_name: string | null
  last_as_aegb: boolean | null
  last_preview: string | null
  unread: number
  blocked: boolean
  /** Deux membres d'un groupe sans photo, pour son image. */
  faces: { id: string; first_name: string; last_name: string; avatar_path: string | null }[] | null
}

export type MessageFile = {
  path: string
  kind: FileKind
  name: string | null
  size: number | null
  mime: string | null
  width: number | null
  height: number | null
  duration: number | null
}

export type Reply = { id: string; sender_id: string | null; as_aegb: boolean; sender_name: string; excerpt: string | null }

export type MessageRow = {
  id: string
  kind: MessageKind
  sender_id: string | null
  sender_first_name: string | null
  sender_last_name: string | null
  sender_avatar_path: string | null
  as_aegb: boolean
  /** Qui a répondu au nom d'AEGB : le bureau seulement le voit. */
  written_by_name: string | null
  body: string | null
  meta: {
    actions?: string[]
    essai?: boolean
    member?: string
    publication?: boolean
    /** Cartes « cotisation » (relance, recu, annule) et « assemblee » (convocation, ouverture…) du compte AEGB. */
    type?: 'relance' | 'recu' | 'annule' | AssemblyMessageType | EventMessageType
    receipt?: string
    amount_cents?: number
    months?: string[]
    // Cartes « assemblee » :
    first_name?: string
    kind?: 'ordinaire' | 'extraordinaire'
    held_at?: string
    place?: string
    vote_opens_at?: string
    vote_closes_at?: string
    candidacy_until?: string | null
    items?: string[]
    closes_at?: string
    label?: string
    labels?: string[]
    reason?: string
    // Cartes « evenement » :
    event?: string
    title?: string
    starts_at?: string
    ends_at?: string | null
    online?: boolean
    price_cents?: number
    method?: string
    paid_on?: string
    changes?: { label: string; before: string; after: string }[]
  }
  files: MessageFile[]
  post_id: string | null
  reply: Reply | null
  reactions: { kind: Enums<'reaction_kind'>; member_id: string }[]
  created_at: string
  deleted: boolean
  hidden: boolean
  hidden_reason: string | null
  reported: boolean
}

export type GroupMember = {
  id: string
  first_name: string
  last_name: string
  avatar_path: string | null
  city: string | null
  member_type: Enums<'member_type'>
  is_manager: boolean
  joined_at: string
}

export type OtherMember = {
  id: string
  first_name: string
  last_name: string
  avatar_path: string | null
  city: string | null
  member_type: Enums<'member_type'>
  status: Enums<'member_status'>
  validated_at: string | null
  /** Vide quand l'un des deux a caché « Vu ». */
  last_read_at: string | null
  /** A demandé la suppression de son compte. */
  closed: boolean
  blocked: boolean
}

export type ConversationInfo = {
  id: string
  kind: ConversationKind
  title: string
  photo_path: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
  members_count: number
  /** Je fais partie de la conversation (faux pour le bureau qui lit une conversation AEGB). */
  member: boolean
  manager: boolean
  /** J'écris ici au nom d'AEGB. */
  as_aegb: boolean
  members: GroupMember[]
  other: OtherMember | null
}

/** Les deux membres qui font l'image d'un groupe sans photo, comme dans la liste. */
export function groupFaces(info: ConversationInfo, uid: string | undefined) {
  return info.members
    .filter((m) => m.id !== uid)
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.first_name.localeCompare(b.first_name))
    .slice(0, 2)
}

export const MESSAGE_MAX = 4000
export const MAX_PHOTOS = 10
export const MAX_FILE_MB = 10
export const MAX_VOICE_S = 120
const PAGE = 50

const DOCUMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
}

export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_TYPES)
  .map((e) => `.${e}`)
  .join(',')

function useUid() {
  return useSession().session?.user.id
}

/* ----------------------------------------------------------------------------
   Lire
---------------------------------------------------------------------------- */

export function useConversations(enabled = true) {
  const uid = useUid()
  return useQuery({
    queryKey: ['messages', 'liste', uid],
    enabled: enabled && !!uid,
    // Le direct prévient de chaque changement ; ceci rattrape une connexion perdue.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_conversations')
      if (error) throw error
      return data as unknown as ConversationRow[]
    },
  })
}

/** La pastille de l'onglet Messages : le nombre de conversations non lues. */
export function useUnreadConversations(): number | null {
  const me = useMe().data
  const list = useConversations(me?.profile.status === 'actif').data
  const n = list?.filter((c) => c.unread > 0).length ?? 0
  return n || null
}

export function useConversationInfo(id: string | undefined) {
  return useQuery({
    queryKey: ['messages', 'infos', id],
    enabled: !!id,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('conversation_info', { p_conversation: id! })
      if (error) throw error
      return data as unknown as ConversationInfo
    },
  })
}

/** Les messages d'une conversation, par pages de 50, du plus récent au plus ancien. */
export function useThread(id: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['messages', 'fil', id],
    enabled: !!id,
    retry: false,
    refetchInterval: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const args: { p_conversation: string; p_limit: number; p_before?: string } = { p_conversation: id!, p_limit: PAGE }
      if (pageParam) args.p_before = pageParam
      const { data, error } = await supabase.rpc('conversation_messages', args)
      if (error) throw error
      return data as unknown as MessageRow[]
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].created_at : null),
  })
}

/** Les membres que j'ai bloqués. */
export function useBlocks() {
  const uid = useUid()
  return useQuery({
    queryKey: ['messages', 'bloques', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('blocks').select('blocked_id')
      if (error) throw error
      return new Set(data.map((b) => b.blocked_id))
    },
  })
}

/* ----------------------------------------------------------------------------
   En direct
---------------------------------------------------------------------------- */

/**
 * Écoute les conversations que la base me laisse voir. Un message, une
 * réaction ou une suppression change la conversation ; une lecture change mes
 * membres de conversation. On recharge ce qui est concerné, par petits lots.
 */
export function useMessagesLive(enabled: boolean) {
  const queryClient = useQueryClient()
  const uid = useUid()
  useEffect(() => {
    if (!enabled || !uid) return
    const keys = new Map<string, readonly unknown[]>()
    let timer: ReturnType<typeof setTimeout> | null = null
    const queue = (...list: (readonly unknown[])[]) => {
      for (const k of list) keys.set(JSON.stringify(k), k)
      timer ??= setTimeout(() => {
        timer = null
        const batch = [...keys.values()]
        keys.clear()
        for (const queryKey of batch) queryClient.invalidateQueries({ queryKey })
      }, 200)
    }
    const channel = supabase
      .channel(`messages-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        const id = (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id
        queue(['messages', 'liste'], ['bureau', 'aegb'])
        if (id) queue(['messages', 'fil', id], ['messages', 'infos', id])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, (payload) => {
        const id = (payload.new as { conversation_id?: string })?.conversation_id ?? (payload.old as { conversation_id?: string })?.conversation_id
        queue(['messages', 'liste'])
        if (id) queue(['messages', 'infos', id])
      })
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [enabled, uid, queryClient])
}

/* ----------------------------------------------------------------------------
   Écrire
---------------------------------------------------------------------------- */

export type Outgoing =
  | { kind: 'photo'; blob: Blob; width: number; height: number; preview: string }
  | { kind: 'vocal'; blob: Blob; duration: number }
  | { kind: 'document'; blob: Blob; name: string }

function extension(type: string, name?: string): string {
  const fromName = name?.split('.').pop()?.toLowerCase()
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/.test(fromName)) return fromName
  const map: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/aac': 'aac' }
  return map[type] ?? 'bin'
}

/** Le type de fichier sans ses paramètres (« audio/webm;codecs=opus » devient « audio/webm »). */
function baseType(blob: Blob): string {
  return blob.type.split(';')[0].trim()
}

/** Un document choisi : 10 Mo au plus, et un format qu'on sait ouvrir. */
export function checkDocument(file: File): Outgoing {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const type = DOCUMENT_TYPES[ext]
  if (!type) throw new Error('Ce type de fichier ne passe pas. Envoie un PDF, un document Word, Excel, PowerPoint ou un fichier texte.')
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Ce fichier dépasse ${MAX_FILE_MB} Mo.`)
  return { kind: 'document', blob: file.type === type ? file : new Blob([file], { type }), name: file.name.slice(0, 120) }
}

export async function preparePhoto(file: File): Promise<Outgoing> {
  if (!file.type.startsWith('image/')) throw new Error('Choisis une photo.')
  try {
    const { blob, width, height } = await prepareImage(file, 1600, 0.82)
    return { kind: 'photo', blob, width, height, preview: URL.createObjectURL(blob) }
  } catch {
    throw new Error("Cette photo ne s'ouvre pas. Choisis une photo JPEG ou PNG.")
  }
}

/**
 * Envoie un message : les fichiers d'abord, dans le dossier du message (la
 * base vérifie qu'ils y sont), puis le message. En cas d'échec, les fichiers
 * déjà partis sont retirés.
 */
export async function sendMessage(input: { conversation: string; id: string; body: string; replyTo?: string | null; files?: Outgoing[]; post?: string | null }) {
  const uploaded: string[] = []
  try {
    const files = []
    for (const [i, f] of (input.files ?? []).entries()) {
      const type = baseType(f.blob)
      const name = f.kind === 'document' ? f.name : undefined
      const path = `${input.conversation}/${input.id}/${i}-${Math.random().toString(36).slice(2, 8)}.${extension(type, name)}`
      const { error } = await supabase.storage.from('messages').upload(path, f.blob, { contentType: type, upsert: false })
      if (error) throw error
      uploaded.push(path)
      files.push({
        kind: f.kind,
        path,
        mime: type,
        size: f.blob.size,
        name: name ?? null,
        width: f.kind === 'photo' ? f.width : null,
        height: f.kind === 'photo' ? f.height : null,
        duration: f.kind === 'vocal' ? Math.round(f.duration * 10) / 10 : null,
      })
    }
    const args: { p_conversation: string; p_id: string; p_body: string; p_files: Json; p_reply_to?: string; p_post?: string } = {
      p_conversation: input.conversation,
      p_id: input.id,
      p_body: input.body,
      p_files: files,
    }
    if (input.replyTo) args.p_reply_to = input.replyTo
    if (input.post) args.p_post = input.post
    const { error } = await supabase.rpc('send_message', args)
    if (error) throw error
  } catch (error) {
    if (uploaded.length) await supabase.storage.from('messages').remove(uploaded)
    throw error
  }
}

export async function deleteMessage(id: string) {
  const { data, error } = await supabase.rpc('delete_message', { p_id: id })
  if (error) throw error
  await removeFiles('messages', data ?? []).catch(() => undefined)
}

export async function reactToMessage(id: string, kind: Enums<'reaction_kind'> | null) {
  // La base attend null pour retirer la réaction ; le type généré ne le dit pas.
  const { error } = await supabase.rpc('react_message', { p_id: id, p_kind: kind as Enums<'reaction_kind'> })
  if (error) throw error
}

export async function markRead(conversation: string) {
  const { error } = await supabase.rpc('mark_read', { p_conversation: conversation })
  if (error) throw error
}

export async function openPrivate(member: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_private', { p_member: member })
  if (error) throw error
  return data
}

export async function setBlocked(member: string, blocked: boolean) {
  const { error } = await supabase.rpc(blocked ? 'block_member' : 'unblock_member', { p_member: member })
  if (error) throw error
}

export async function refreshMessages(queryClient: QueryClient, conversation?: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['messages', 'liste'] }),
    conversation ? queryClient.invalidateQueries({ queryKey: ['messages', 'fil', conversation] }) : null,
    conversation ? queryClient.invalidateQueries({ queryKey: ['messages', 'infos', conversation] }) : null,
  ])
}

/* ----------------------------------------------------------------------------
   Affichage
---------------------------------------------------------------------------- */

const TZ = 'Europe/Paris'

function parts(date: string | Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...options }).format(new Date(date))
}

function dayKey(date: string | Date) {
  return parts(date, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** « 09:12 » */
export function clock(date: string | Date): string {
  return parts(date, { hour: '2-digit', minute: '2-digit' })
}

/** Dans la liste : l'heure aujourd'hui, « Hier », le jour de la semaine, puis la date. */
export function listDate(date: string | Date, now = new Date()): string {
  if (dayKey(date) === dayKey(now)) return clock(date)
  for (let d = 1; d < 7; d++) {
    if (dayKey(date) === dayKey(new Date(now.getTime() - d * 86_400_000))) {
      if (d === 1) return 'Hier'
      const day = parts(date, { weekday: 'short' })
      return day.charAt(0).toUpperCase() + day.slice(1)
    }
  }
  return parts(date, { day: 'numeric', month: 'short' })
}

/** Les séparateurs de la conversation : « Aujourd'hui », « Hier », « 12 octobre ». */
export function dayLabel(date: string | Date, now = new Date()): string {
  if (dayKey(date) === dayKey(now)) return "Aujourd'hui"
  if (dayKey(date) === dayKey(new Date(now.getTime() - 86_400_000))) return 'Hier'
  const sameYear = parts(date, { year: 'numeric' }) === parts(now, { year: 'numeric' })
  return parts(date, sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
}

export function sameDay(a: string, b: string): boolean {
  return dayKey(a) === dayKey(b)
}

/** « 0:24 » */
export function duration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** « 650 Ko », « 1,2 Mo » */
export function fileSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  return `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}

/** « PDF », « DOCX » : l'étiquette sur l'icône d'un document. */
export function fileBadge(name: string | null | undefined): string {
  return (name?.split('.').pop() ?? 'doc').slice(0, 4).toUpperCase()
}

/** La ligne sous le nom dans la liste : « Toi : … », « Awa : … » dans un groupe. */
export function previewLine(c: ConversationRow, uid: string | undefined): string {
  const text = c.last_preview ?? ''
  if (!c.last_kind || c.last_kind === 'systeme' || c.last_kind === 'arrivee') return text
  if (c.last_sender_id && c.last_sender_id === uid) return `Toi : ${text}`
  if (c.kind !== 'prive' && c.last_as_aegb && c.kind !== 'aegb') return `AEGB : ${text}`
  if ((c.kind === 'groupe' || c.kind === 'grand_groupe') && c.last_sender_name) return `${c.last_sender_name} : ${text}`
  return text
}

/** Le nom affiché d'une conversation privée : celui de l'autre membre. */
export function conversationName(c: Pick<ConversationRow, 'kind' | 'title' | 'other_first_name' | 'other_last_name'>): string {
  if (c.kind === 'prive') return c.other_first_name ? `${c.other_first_name} ${c.other_last_name ?? ''}`.trim() : 'Ancien membre'
  return c.title
}

/* ----------------------------------------------------------------------------
   Bureau : le compte officiel AEGB
---------------------------------------------------------------------------- */

export type InboxRow = {
  id: string
  member_id: string
  first_name: string
  last_name: string
  avatar_path: string | null
  member_type: Enums<'member_type'>
  city: string | null
  validated_at: string | null
  last_at: string
  last_preview: string
  last_from_member: boolean
  replied_by_name: string | null
}

export function useAegbInbox(enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'aegb', 'boite'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aegb_inbox')
      if (error) throw error
      return data as unknown as InboxRow[]
    },
  })
}

export function useAegbPending(enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'aegb', 'compteur'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('aegb_pending')
      if (error) throw error
      return data ?? 0
    },
  })
}

export function useAegbSettings(enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'aegb', 'reglages'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('aegb_settings').select('*').single()
      if (error) throw error
      return data
    },
  })
}

/** Le compteur du bureau pour le compte AEGB : les membres qui attendent une réponse. */
export function useAegbBadge(): number {
  const me = useMe().data
  return useAegbPending(can(me, 'bienvenue', 'lecture')).data ?? 0
}

export const WELCOME_ACTIONS: { value: string; label: string; detail: string; to: string }[] = [
  { value: 'charte', label: 'Lire la charte', detail: 'ouvre la charte', to: '/charte' },
  { value: 'profil', label: 'Compléter mon profil', detail: 'ouvre le profil', to: '/app/profil/modifier' },
  { value: 'cotisation', label: 'Payer ma cotisation', detail: 'ouvre la cotisation', to: '/app/cotisation' },
]

/** Le texte de bienvenue pour un membre, comme la base le remplit. */
export function fillWelcome(template: string, p: { first_name: string; city: string | null; type: string }): string {
  return template.replaceAll('{Prénom}', p.first_name).replaceAll('{Ville}', p.city ?? '').replaceAll('{Type}', p.type.toLowerCase())
}

export type ModerationMessage = {
  message_id: string
  place: ConversationKind
  author_id: string | null
  author_first_name: string | null
  author_last_name: string | null
  author_avatar_path: string | null
  body: string | null
  media_path: string | null
  media_kind: FileKind | null
  media_duration: number | null
  created_at: string
  hidden: boolean
  reports: number
  reasons: Partial<Record<Enums<'report_reason'>, number>>
  last_reported_at: string
  warnings: number
  last_warning_at: string | null
  last_warning_reason: string | null
}

export function useModerationMessages() {
  return useQuery({
    queryKey: ['bureau', 'moderation', 'messages'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('moderation_messages')
      if (error) throw error
      return data as unknown as ModerationMessage[]
    },
  })
}

export const PLACE_LABELS: Record<ConversationKind, string> = {
  grand_groupe: 'Dans le grand groupe AEGB',
  groupe: 'Dans un petit groupe',
  prive: 'Dans une conversation privée',
  aegb: 'Dans la conversation avec AEGB',
}
