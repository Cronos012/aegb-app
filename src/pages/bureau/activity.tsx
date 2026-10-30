import { EyeOff } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Logo } from '../../components/Logo'
import { Pill, type Tone } from '../../components/Pill'
import { relative, time } from '../../lib/format'
import type { ActivityEntry } from '../../lib/queries'

export const CATEGORIES: Record<string, { label: string; tone: Tone }> = {
  comptes: { label: 'Comptes', tone: 'brand' },
  membres: { label: 'Membres', tone: 'ok' },
  postes: { label: 'Postes', tone: 'safran' },
  reglages: { label: 'Réglages', tone: 'neutral' },
  argent: { label: 'Argent', tone: 'ok' },
  moderation: { label: 'Modération', tone: 'danger' },
  annonces: { label: 'Annonces', tone: 'safran' },
  elections: { label: 'Élections', tone: 'danger' },
  evenements: { label: 'Événements', tone: 'neutral' },
  documents: { label: 'Documents', tone: 'brand' },
}

function nameParts(name: string) {
  const [first = '', ...rest] = name.split(' ')
  return { first_name: first, last_name: rest.join(' ') }
}

export function ActorAvatar({ entry, size = 28 }: { entry: ActivityEntry; size?: number }) {
  if (!entry.actor_id) return <Logo size={size} />
  return <Avatar person={{ id: entry.actor_id, ...nameParts(entry.actor_name) }} size={size} />
}

/** Qui a fait l'action. Pour le titulaire du poste d'admin numérique, un œil barré marque ce que les autres voient signé « Le bureau ». */
function ActorName({ entry }: { entry: ActivityEntry }) {
  if (!entry.discreet) return entry.actor_name
  return (
    <>
      {entry.actor_name}
      <span title="Les autres voient « Le bureau »" className="ml-1 inline-flex align-[-2px] text-muted">
        <EyeOff className="size-3.5" />
        <span className="sr-only">(les autres voient « Le bureau »)</span>
      </span>
    </>
  )
}

export function motif(entry: ActivityEntry): string | null {
  const d = entry.details as { motif?: string } | null
  return d?.motif ?? null
}

/** Une ligne courte, pour le tableau de bord. */
export function ActivityLine({ entry }: { entry: ActivityEntry }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <ActorAvatar entry={entry} size={32} />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14px] leading-[1.35]">
          <strong><ActorName entry={entry} /></strong> {entry.summary}
        </p>
        <p className="m-0 mt-0.5 text-xs text-muted">{relative(entry.created_at)}</p>
      </div>
    </li>
  )
}

/** Une ligne détaillée, pour le journal. */
export function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const cat = CATEGORIES[entry.category] ?? { label: entry.category, tone: 'neutral' as Tone }
  const why = motif(entry)
  return (
    <li className="flex items-start gap-3 px-4 py-3 lg:grid lg:grid-cols-[56px_220px_minmax(0,1fr)_auto] lg:items-center lg:gap-4 lg:px-5">
      <span className="hidden text-[13px] text-muted tabular-nums lg:block">{time(entry.created_at)}</span>
      <span className="flex shrink-0 items-center gap-2.5 lg:min-w-0">
        <ActorAvatar entry={entry} size={30} />
        <span className="hidden truncate text-[14px] font-bold lg:block"><ActorName entry={entry} /></span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14px] leading-[1.4]">
          <strong className="lg:hidden"><ActorName entry={entry} /> </strong>
          {entry.summary}
        </p>
        {why ? <p className="m-0 mt-0.5 text-[13px] text-muted">Motif : {why}</p> : null}
        <p className="m-0 mt-1 flex items-center gap-2 text-xs text-muted lg:hidden">
          {time(entry.created_at)} <Pill tone={cat.tone}>{cat.label}</Pill>
        </p>
      </div>
      <span className="hidden lg:block">
        <Pill tone={cat.tone}>{cat.label}</Pill>
      </span>
    </li>
  )
}
