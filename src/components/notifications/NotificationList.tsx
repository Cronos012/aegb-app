import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import {
  AtSign,
  BadgeCheck,
  Bell,
  CalendarDays,
  CreditCard,
  Euro,
  Heart,
  Info,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Reply,
  ShieldAlert,
  SquareCheckBig,
  TriangleAlert,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from '../Avatar'
import { Logo } from '../Logo'
import { boldParts, notificationTime, sections, useMarkRead, type Notification } from '../../lib/notifications'

/** La petite pastille ronde posée sur la photo : ce qui s'est passé. */
const BADGES: Record<string, { icon: LucideIcon; tone: string }> = {
  reaction: { icon: Heart, tone: 'bg-[#CE1126] text-white' },
  mention: { icon: AtSign, tone: 'bg-leppi text-white' },
  reponse: { icon: Reply, tone: 'bg-[#5B2D91] text-white' },
  commentaire: { icon: MessageCircle, tone: 'bg-leppi-2 text-white' },
  aegb: { icon: MessageSquare, tone: 'bg-leppi text-white' },
  annonce: { icon: Megaphone, tone: 'bg-safran text-nuit' },
  compte: { icon: BadgeCheck, tone: 'bg-ok text-white' },
}

/** Sans personne derrière : une tuile de couleur avec l'icône du sujet. */
const TILES: Record<string, { icon: LucideIcon; tone: string }> = {
  vote: { icon: SquareCheckBig, tone: 'bg-safran-pale text-[#6B4A00]' },
  evenement: { icon: CalendarDays, tone: 'bg-danger-soft text-danger' },
  cotisation: { icon: CreditCard, tone: 'bg-ok-soft text-ok' },
  comptes: { icon: UserCheck, tone: 'bg-safran-pale text-[#6B4A00]' },
  signalement: { icon: TriangleAlert, tone: 'bg-danger-soft text-danger' },
  candidature: { icon: SquareCheckBig, tone: 'bg-[#F1E8FB] text-[#5B2D91]' },
  paiement: { icon: Euro, tone: 'bg-ok-soft text-ok' },
  compte: { icon: ShieldAlert, tone: 'bg-warn-soft text-warn' },
}

/** L'écran du bureau d'où vient la notification. */
const CHIPS: Record<string, string> = {
  Comptes: 'bg-safran-pale text-[#6B4A00]',
  Modération: 'bg-danger-soft text-danger',
  'Compte AEGB': 'bg-select text-ink',
  Élections: 'bg-[#F1E8FB] text-[#5B2D91]',
  Trésorerie: 'bg-ok-soft text-ok',
}

function Face({ n, size }: { n: Notification; size: number }) {
  const badge = BADGES[n.icon]
  const small = Math.round(size * 0.5)
  const mark = badge ? (
    <span className={`absolute -right-1 -bottom-1 grid place-items-center rounded-full ring-2 ring-surface ${badge.tone}`} style={{ width: small, height: small }} aria-hidden="true">
      <badge.icon style={{ width: small * 0.56, height: small * 0.56 }} strokeWidth={2.4} />
    </span>
  ) : null

  if (n.actor) {
    return (
      <span className="relative shrink-0">
        <Avatar person={n.actor} size={size} />
        {mark}
      </span>
    )
  }
  if (n.official && (n.icon === 'annonce' || (n.icon === 'compte' && n.text.startsWith('**Bienvenue')))) {
    return (
      <span className="relative shrink-0">
        <span className="bg-anneau inline-flex rounded-full p-[3px]" aria-hidden="true">
          <Logo size={size - 6} />
        </span>
        {n.icon === 'annonce' ? mark : null}
      </span>
    )
  }
  const tile = TILES[n.icon] ?? { icon: Bell, tone: 'bg-select text-ink' }
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${tile.tone}`} style={{ width: size, height: size }} aria-hidden="true">
      <tile.icon style={{ width: size * 0.44, height: size * 0.44 }} />
    </span>
  )
}

/** « · Grand groupe », « · Annonce officielle » après l'heure. */
function context(n: Notification): string | null {
  if (n.category === 'grand_groupe') return 'Grand groupe'
  if (n.icon === 'annonce') return 'Annonce officielle'
  return null
}

export function NotificationText({ text }: { text: string }) {
  return (
    <>
      {boldParts(text).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </>
  )
}

function Row({ n, compact, onOpen }: { n: Notification; compact: boolean; onOpen: (n: Notification) => void }) {
  const extra = context(n)
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(n)}
        className={`flex w-full items-center gap-3.5 text-left text-ink ${compact ? 'px-[18px] py-2.5' : 'px-4 py-3.5'} ${n.read ? 'hover:bg-surface-2' : 'bg-[#EEF0FB] hover:bg-[#E6E9F8]'}`}
      >
        <Face n={n} size={compact ? 40 : 48} />
        <span className="min-w-0 flex-1">
          {n.chip ? <span className={`mb-1 inline-block rounded-full px-2 py-px text-[11px] font-bold ${CHIPS[n.chip] ?? 'bg-select text-ink'}`}>{n.chip}</span> : null}
          <span className={`block leading-[1.38] ${compact ? 'text-[14px]' : 'text-[15px]'}`}>
            <NotificationText text={n.text} />
            {n.others > 0 && !n.text.includes('autre') ? <span className="text-muted"> (+{n.others})</span> : null}
          </span>
          <span className={`mt-0.5 block font-semibold text-muted ${compact ? 'text-[12px]' : 'text-[13px]'}`}>
            {notificationTime(n.created_at)}
            {extra ? ` · ${extra}` : null}
          </span>
        </span>
        {n.read ? <span className="size-2.5 shrink-0" /> : <span className="size-2.5 shrink-0 rounded-full bg-[#3155D6]" aria-label="Non lue" />}
      </button>
    </li>
  )
}

type Props = {
  list: Notification[]
  /** Le panneau sur ordinateur : lignes plus serrées. */
  compact?: boolean
  onOpened?: () => void
  empty?: ReactNode
}

/** Les notifications rangées en « Aujourd'hui », « Cette semaine », « Plus tôt ». Un appui ouvre le bon endroit. */
export function NotificationList({ list, compact = false, onOpened, empty }: Props) {
  const navigate = useNavigate()
  const markRead = useMarkRead()

  function open(n: Notification) {
    if (!n.read) markRead.mutate([n.id])
    onOpened?.()
    navigate(n.link)
  }

  if (!list.length) return <>{empty}</>
  return (
    <div className="flex flex-col">
      {sections(list).map((s) => (
        <section key={s.title} aria-label={s.title}>
          <h2 className={`m-0 font-bold tracking-[0.08em] text-muted uppercase ${compact ? 'px-[18px] pt-3 pb-1.5 text-[11px]' : 'px-4 pt-4 pb-2 text-[12px]'}`}>{s.title}</h2>
          <ul className="m-0 list-none p-0">
            {s.items.map((n) => (
              <Row key={n.id} n={n} compact={compact} onOpen={open} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function KeepNote({ className = '' }: { className?: string }) {
  return (
    <p className={`m-0 flex items-start gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] leading-[1.45] text-muted ${className}`}>
      <Info className="mt-px size-[18px] shrink-0" />
      Les notifications s’effacent après 30 jours. Les messages privés sont dans l’onglet Messages.
    </p>
  )
}
