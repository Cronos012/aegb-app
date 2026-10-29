import type { Enums } from './database.types'

export type MemberType = Enums<'member_type'>
export type MemberStatus = Enums<'member_status'>

export const TYPE_LABELS: Record<MemberType, string> = {
  etudiant: 'Étudiant',
  alumni: 'Alumni',
  sympathisant: 'Sympathisant',
  honneur: "Membre d'honneur",
}

export const TYPE_PLURALS: Record<MemberType, string> = {
  etudiant: 'Étudiants',
  alumni: 'Alumni',
  sympathisant: 'Sympathisants',
  honneur: "Membres d'honneur",
}

/** Les types qu'on peut choisir à l'inscription. Membre d'honneur est donné par le bureau. */
export const SIGNUP_TYPES: { value: MemberType; hint: string }[] = [
  { value: 'etudiant', hint: 'Tu étudies dans la région brestoise' },
  { value: 'alumni', hint: 'Tu as fini tes études et gardes le lien' },
  { value: 'sympathisant', hint: "Tu soutiens l'association" },
]

export const STATUS_LABELS: Record<MemberStatus, string> = {
  en_attente: 'En attente',
  actif: 'Actif',
  refuse: 'Refusé',
  suspendu: 'Suspendu',
}

type Named = { first_name: string; last_name: string }

export function fullName(p: Named): string {
  return `${p.first_name} ${p.last_name}`.trim()
}

export function initials(p: Named): string {
  const first = p.first_name.trim()
  const last = p.last_name.trim()
  return (last ? (first[0] ?? '') + last[0] : first.slice(0, 2)).toUpperCase() || '?'
}

const TZ = 'Europe/Paris'

function fmt(date: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...options }).format(new Date(date))
}

/** « 29 oct. » */
export function shortDate(date: string | Date): string {
  return fmt(date, { day: 'numeric', month: 'short' })
}

/** « 29 octobre 2026 » */
export function longDate(date: string | Date): string {
  return fmt(date, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** « 18 h 02 » */
export function time(date: string | Date): string {
  return fmt(date, { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')
}

/** « 29 oct. à 18 h 02 » */
export function dateTime(date: string | Date): string {
  return `${shortDate(date)} à ${time(date)}`
}

/** « octobre 2026 » */
export function monthYear(date: string | Date): string {
  return fmt(date, { month: 'long', year: 'numeric' })
}

function dayKey(date: string | Date): string {
  return fmt(date, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/** « Aujourd'hui, mercredi 29 octobre », « Hier, mardi 28 octobre », « Lundi 27 octobre » */
export function dayHeading(date: string | Date, now: Date = new Date()): string {
  const label = fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })
  const yesterday = new Date(now.getTime() - 86_400_000)
  if (dayKey(date) === dayKey(now)) return `Aujourd'hui, ${label}`
  if (dayKey(date) === dayKey(yesterday)) return `Hier, ${label}`
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function sameDay(a: string | Date, b: string | Date): boolean {
  return dayKey(a) === dayKey(b)
}

/** « il y a 5 min », « hier », « il y a 3 jours », « 27 oct. » */
export function relative(date: string | Date, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(date).getTime()) / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  if (sameDay(date, now)) return `il y a ${Math.round(minutes / 60)} h`
  for (let days = 1; days < 7; days++) {
    if (sameDay(date, new Date(now.getTime() - days * 86_400_000))) return days === 1 ? 'hier' : `il y a ${days} jours`
  }
  return shortDate(date)
}

/** Couleurs douces pour les avatars sans photo, choisies d'après le nom. */
const AVATAR_TONES = [
  { bg: '#FFF1C2', fg: '#7A5200' },
  { bg: '#E3F4EC', fg: '#0B6B43' },
  { bg: '#FDE7EA', fg: '#A3132A' },
  { bg: '#E7EAFB', fg: '#253070' },
  { bg: '#F1E8FB', fg: '#5B2D91' },
  { bg: '#E2F2F8', fg: '#145A75' },
]

export function avatarTone(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]
}
