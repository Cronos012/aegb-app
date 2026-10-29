import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import type { Enums, Tables } from './database.types'
import { supabase } from './supabase'

export type Profile = Tables<'profiles'>
export type Contact = Tables<'member_contacts'>
/** Un poste tel que l'appli le lit : sans ce qui trahirait le poste d'admin numérique. */
export type Role = Omit<Tables<'bureau_roles'>, 'locked' | 'assigned_by'>
export type Screen = Tables<'bureau_screens'>
export type Permission = Tables<'role_permissions'>
export type ActivityEntry = Tables<'activity_log'>
export type Warning = Tables<'member_warnings'>
export type AccessLevel = Enums<'access_level'>
export type ScreenCode =
  | 'comptes' | 'membres' | 'tresorerie' | 'elections' | 'evenements'
  | 'annonces' | 'moderation' | 'documents' | 'bienvenue' | 'journal' | 'postes'

export type Me = {
  profile: Profile
  contact: Contact | null
  role: Role | null
  access: Partial<Record<ScreenCode, AccessLevel>>
  /** Vrai pour le seul titulaire du poste d'admin numérique. Personne d'autre ne le sait. */
  guarantor: boolean
}

const ROLE_COLUMNS = 'code, label, description, sort_order, holder_id, assigned_at'

/** Mon profil, mes coordonnées, mon poste et ce qu'il m'ouvre. L'affichage seulement : la base revérifie tout. */
export function useMe() {
  const { session } = useSession()
  const uid = session?.user.id
  return useQuery({
    queryKey: ['me', uid],
    enabled: !!uid,
    queryFn: async (): Promise<Me> => {
      const [p, c, r, b] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid!).single(),
        supabase.from('member_contacts').select('*').eq('id', uid!).maybeSingle(),
        supabase.from('bureau_roles').select(ROLE_COLUMNS).eq('holder_id', uid!).maybeSingle(),
        supabase.rpc('my_bureau'),
      ])
      if (p.error) throw p.error
      if (b.error) throw b.error
      const bureau = b.data as { guarantor: boolean; access: Me['access'] } | null
      return { profile: p.data, contact: c.data ?? null, role: r.data ?? null, access: bureau?.access ?? {}, guarantor: bureau?.guarantor ?? false }
    },
  })
}

export function can(me: Me | undefined, screen: ScreenCode, level: AccessLevel = 'complet'): boolean {
  const mine = me?.access[screen]
  if (!mine) return false
  return level === 'lecture' || mine === 'complet'
}

export function isBureau(me: Me | undefined): boolean {
  return !!me?.role && me.profile.status === 'actif'
}

export function useCharter() {
  return useQuery({
    queryKey: ['charte'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('charter_versions').select('*').order('version', { ascending: false }).limit(1).single()
      if (error) throw error
      return { version: data.version, rules: data.rules as { icon: string; title: string; text: string }[] }
    },
  })
}

export function usePublicBureau() {
  return useQuery({
    queryKey: ['bureau-public'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_bureau')
      if (error) throw error
      return data
    },
  })
}

export function useBureauCounts(enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'compteurs'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bureau_counts').single()
      if (error) throw error
      return data
    },
  })
}

type PersonName = { first_name: string; last_name: string }

export type MemberRow = Profile & {
  member_contacts: Pick<Contact, 'email' | 'phone'> | null
  validator?: PersonName | null
  refuser?: PersonName | null
}

const MEMBER_SELECT = '*, member_contacts(email, phone)'
const ACCOUNT_SELECT =
  '*, member_contacts(email, phone), validator:profiles!profiles_validated_by_fkey(first_name, last_name), refuser:profiles!profiles_refused_by_fkey(first_name, last_name)'

export type AccountsTab = 'en_attente' | 'valides' | 'refuses'

export function useAccounts(tab: AccountsTab, enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'comptes', tab],
    enabled,
    queryFn: async (): Promise<MemberRow[]> => {
      let q = supabase.from('profiles').select(ACCOUNT_SELECT)
      if (tab === 'en_attente') q = q.eq('status', 'en_attente').order('created_at', { ascending: true })
      if (tab === 'valides') q = q.not('validated_at', 'is', null).in('status', ['actif', 'suspendu']).order('validated_at', { ascending: false }).limit(50)
      if (tab === 'refuses') q = q.eq('status', 'refuse').order('refused_at', { ascending: false }).limit(50)
      const { data, error } = await q
      if (error) throw error
      return data as unknown as MemberRow[]
    },
  })
}

export function useMembers() {
  return useQuery({
    queryKey: ['bureau', 'membres'],
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(MEMBER_SELECT)
        .in('status', ['actif', 'suspendu'])
        .order('first_name')
        .order('last_name')
      if (error) throw error
      return data as unknown as MemberRow[]
    },
  })
}

export function useMember(id: string | undefined) {
  return useQuery({
    queryKey: ['bureau', 'membre', id],
    enabled: !!id,
    queryFn: async (): Promise<MemberRow> => {
      const { data, error } = await supabase.from('profiles').select(ACCOUNT_SELECT).eq('id', id!).single()
      if (error) throw error
      return data as unknown as MemberRow
    },
  })
}

export function useMemberHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['bureau', 'historique', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('member_history', { p_member: id! })
      if (error) throw error
      return data as ActivityEntry[]
    },
  })
}

export function useWarnings(memberId: string | undefined) {
  return useQuery({
    queryKey: ['bureau', 'avertissements', memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase.from('member_warnings').select('*').eq('member_id', memberId!).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export type RoleWithHolder = Role & {
  holder: Pick<Profile, 'id' | 'first_name' | 'last_name' | 'avatar_path' | 'member_type' | 'status'> | null
}

export function useRoles() {
  return useQuery({
    queryKey: ['postes'],
    queryFn: async (): Promise<RoleWithHolder[]> => {
      const { data, error } = await supabase
        .from('bureau_roles')
        .select(`${ROLE_COLUMNS}, holder:profiles!bureau_roles_holder_id_fkey(id, first_name, last_name, avatar_path, member_type, status)`)
        .order('sort_order')
      if (error) throw error
      return data as unknown as RoleWithHolder[]
    },
  })
}

export function useScreensAndPermissions() {
  return useQuery({
    queryKey: ['postes', 'droits'],
    queryFn: async () => {
      const [s, p] = await Promise.all([
        supabase.from('bureau_screens').select('*').order('sort_order'),
        supabase.from('role_permissions').select('*'),
      ])
      if (s.error) throw s.error
      if (p.error) throw p.error
      return { screens: s.data, permissions: p.data }
    },
  })
}

export function useActiveMembers(enabled = true) {
  return useQuery({
    queryKey: ['membres-actifs'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_path, member_type, validated_at')
        .eq('status', 'actif')
        .order('first_name')
      if (error) throw error
      return data
    },
  })
}

export function useActivity(limit: number, category: string | null, actor: string | null, enabled = true) {
  return useQuery({
    queryKey: ['bureau', 'journal', limit, category, actor],
    enabled,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(limit)
      if (category) q = q.eq('category', category)
      if (actor === 'auto') q = q.is('actor_id', null)
      else if (actor) q = q.eq('actor_id', actor)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

/** Appelle une fonction de la base puis rafraîchit les écrans concernés. */
export function useAction<V>(run: (vars: V) => PromiseLike<{ error: unknown }>, refresh: QueryKey[] = [['bureau'], ['me'], ['postes']]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: V) => {
      const { error } = await run(vars)
      if (error) throw error
    },
    onSuccess: () => Promise.all(refresh.map((key) => queryClient.invalidateQueries({ queryKey: key }))),
  })
}
