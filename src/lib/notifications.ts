import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import type { Json } from './database.types'
import { sameDay } from './format'
import { deviceId, setAppBadge } from './push'
import { supabase } from './supabase'

/**
 * La cloche, les réglages des notifications, la confidentialité et les
 * appareils connectés. Tout passe par les fonctions de la base : elle seule
 * sait ce qu'un membre a le droit de lire.
 */

export type NotificationActor = { id: string; first_name: string; last_name: string; avatar_path: string | null }

export type Notification = {
  id: number
  category: string
  /** reaction, commentaire, reponse, mention, annonce, vote, evenement, cotisation, compte, comptes, signalement, aegb, candidature, paiement */
  icon: string
  /** Le texte, avec le nom (ou le titre) entre ** ** pour le gras. */
  text: string
  link: string
  official: boolean
  /** L'écran du bureau d'où vient la notification (« Comptes », « Modération »…). */
  chip: string | null
  created_at: string
  read: boolean
  /** Les autres personnes regroupées derrière la première (« et 4 autres »). */
  others: number
  actor: NotificationActor | null
}

export type Badge = { notifications: number; total: number }

function useUid() {
  return useSession().session?.user.id
}

export function useNotifications(enabled = true) {
  const uid = useUid()
  return useQuery({
    queryKey: ['notifications', 'liste', uid],
    enabled: enabled && !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_notifications', { p_limit: 100 })
      if (error) throw error
      return data as unknown as Notification[]
    },
  })
}

/** Le nombre de la cloche, et celui de l'icône de l'appli (messages non lus compris). */
export function useBadge(enabled = true) {
  const uid = useUid()
  const q = useQuery({
    queryKey: ['notifications', 'pastille', uid],
    enabled: enabled && !!uid,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_badge')
      if (error) throw error
      return data as unknown as Badge
    },
  })
  const total = q.data?.total
  useEffect(() => {
    if (total != null) setAppBadge(total)
  }, [total])
  return q
}

/** Une notification qui arrive, ou qui passe en lue ailleurs : la cloche se met à jour. */
export function useNotificationsLive(enabled: boolean) {
  const queryClient = useQueryClient()
  const uid = useUid()
  useEffect(() => {
    if (!enabled || !uid) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      timer ??= setTimeout(() => {
        timer = null
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      }, 300)
    }
    const channel = supabase
      .channel(`notifications-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `member_id=eq.${uid}` }, refresh)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [enabled, uid, queryClient])
}

export function useMarkRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: number[] | null) => {
      const { error } = await supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {})
      if (error) throw error
    },
    onMutate: (ids) => {
      queryClient.setQueriesData<Notification[]>({ queryKey: ['notifications', 'liste'] }, (list) =>
        list?.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

/**
 * Ouvrir une page marque comme lues les notifications qui y mènent : la
 * publication, le vote, la cotisation. Rien n'est demandé à la base quand la
 * cloche est déjà vide.
 */
export function useMarkLinkRead(link: string | null | undefined) {
  const queryClient = useQueryClient()
  const uid = useUid()
  const done = useRef<string | null>(null)
  const pending = useBadge().data?.notifications
  useEffect(() => {
    if (!link || !uid || done.current === link || pending === 0) return
    // La liste déjà chargée dit s'il y a quelque chose à marquer ici.
    const list = queryClient.getQueryData<Notification[]>(['notifications', 'liste', uid])
    if (list && !list.some((n) => !n.read && n.link === link)) return
    done.current = link
    supabase.rpc('mark_link_read', { p_link: link }).then(({ data }) => {
      if (data) queryClient.invalidateQueries({ queryKey: ['notifications'] })
    })
  }, [link, uid, pending, queryClient])
}

/* ----------------------------------------------------------------------------
   La cloche, rangée par jour
---------------------------------------------------------------------------- */

export type Section = { title: string; items: Notification[] }

export function sections(list: Notification[], now = new Date()): Section[] {
  const week = now.getTime() - 6 * 86_400_000
  const out: Section[] = [
    { title: "Aujourd'hui", items: [] },
    { title: 'Cette semaine', items: [] },
    { title: 'Plus tôt', items: [] },
  ]
  for (const n of list) {
    if (sameDay(n.created_at, now)) out[0].items.push(n)
    else if (new Date(n.created_at).getTime() >= week) out[1].items.push(n)
    else out[2].items.push(n)
  }
  return out.filter((s) => s.items.length)
}

/** « Il y a 12 min », « Il y a 2 h », puis « Mercredi », puis « 12 oct. » */
export function notificationTime(date: string, now = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(date).getTime()) / 60_000)
  if (minutes < 1) return "À l'instant"
  if (minutes < 60) return `Il y a ${minutes} min`
  if (sameDay(date, now)) return `Il y a ${Math.round(minutes / 60)} h`
  const yesterday = new Date(now.getTime() - 86_400_000)
  if (sameDay(date, yesterday)) return 'Hier'
  const tz = { timeZone: 'Europe/Paris' } as const
  if (new Date(date).getTime() >= now.getTime() - 6 * 86_400_000) {
    const day = new Intl.DateTimeFormat('fr-FR', { ...tz, weekday: 'long' }).format(new Date(date))
    return day.charAt(0).toUpperCase() + day.slice(1)
  }
  return new Intl.DateTimeFormat('fr-FR', { ...tz, day: 'numeric', month: 'short' }).format(new Date(date))
}

/** Le texte découpé en morceaux normaux et en gras (**…**). */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((p) => p.text)
}

/* ----------------------------------------------------------------------------
   Réglages et confidentialité
---------------------------------------------------------------------------- */

export type NotificationSettings = {
  prives: boolean
  groupes: boolean
  grand_groupe: boolean
  reactions: boolean
  votes: boolean
  evenements: boolean
  cotisation: boolean
  poste: boolean
  calme: boolean
  calme_debut: string
  calme_fin: string
  apercu: boolean
}

export type Privacy = {
  show_online: boolean
  show_seen: boolean
  phone_visibility: 'bureau' | 'membres'
  who_can_write: 'tous' | 'conversations'
}

export type Settings = {
  notifications: NotificationSettings
  privacy: Privacy
  /** Ce que reçoit le poste du membre au bureau, s'il en a un. */
  poste: { role: string; receives: string[] } | null
}

export function useSettings(enabled = true) {
  const uid = useUid()
  return useQuery({
    queryKey: ['reglages', uid],
    enabled: enabled && !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_settings')
      if (error) throw error
      return data as unknown as Settings
    },
  })
}

/** Un réglage change tout de suite à l'écran, puis la base l'enregistre. */
function useSave<K extends 'notifications' | 'privacy'>(part: K, rpc: 'save_notification_settings' | 'save_privacy') {
  const queryClient = useQueryClient()
  const uid = useUid()
  return useMutation({
    mutationFn: async (patch: Partial<Settings[K]>) => {
      const body = patch as Json
      const { error } =
        rpc === 'save_notification_settings'
          ? await supabase.rpc('save_notification_settings', { p_settings: body })
          : await supabase.rpc('save_privacy', { p_privacy: body })
      if (error) throw error
    },
    onMutate: async (patch) => {
      const key = ['reglages', uid]
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<Settings>(key)
      if (before) queryClient.setQueryData<Settings>(key, { ...before, [part]: { ...before[part], ...patch } })
      return { before }
    },
    onError: (_e, _patch, context) => {
      if (context?.before) queryClient.setQueryData(['reglages', uid], context.before)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reglages'] })
      // « Vu » et « En ligne » changent ce que je vois des autres.
      if (part === 'privacy') queryClient.invalidateQueries({ queryKey: ['messages', 'infos'] })
    },
  })
}

export function useSaveNotificationSettings() {
  return useSave('notifications', 'save_notification_settings')
}

export function useSavePrivacy() {
  return useSave('privacy', 'save_privacy')
}

/* ----------------------------------------------------------------------------
   Appareils
---------------------------------------------------------------------------- */

export type Device = {
  id: string
  platform: 'android' | 'iphone' | 'ordinateur' | 'autre'
  label: string
  push: boolean
  last_seen_at: string
  created_at: string
}

export function useDevices(enabled = true) {
  const uid = useUid()
  return useQuery({
    queryKey: ['reglages', 'appareils', uid],
    enabled: enabled && !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_devices')
      if (error) throw error
      return data as unknown as Device[]
    },
  })
}

export function useRevokeDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('revoke_device', { p_id: id })
      if (error) throw error
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['reglages', 'appareils'] }),
  })
}

/** « Essayer » : une notification d'essai sur cet appareil, même pendant les heures calmes. */
export function useTestPush() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('test_push', { p_device: deviceId() })
      if (error) throw error
    },
  })
}

/** Le numéro d'un membre s'il le montre (ou pour le bureau), et si je peux lui écrire. */
export function useMemberContact(id: string | undefined) {
  return useQuery({
    queryKey: ['profil', 'contact', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('member_contact', { p_member: id! })
      if (error) throw error
      return data as unknown as { phone: string | null; can_write: boolean }
    },
  })
}

export type Reachable = { reachable: number; android: number; iphone: number; ordinateur: number; total: number }

/** Pour le bureau : combien de membres ont activé les notifications, jamais leurs noms. */
export function useReachable(enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'joignables'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('reachable_members')
      if (error) throw error
      return data as unknown as Reachable
    },
  })
}
