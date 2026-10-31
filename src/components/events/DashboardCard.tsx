import { Link } from 'react-router'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { countLine, isPast, useEventsAdmin, whenShort } from '../../lib/events'

/** Sur le tableau de bord : le prochain événement et les brouillons, en une ligne. */
export function EventsCard() {
  const list = useEventsAdmin().data
  if (!list) return null
  const next = list
    .filter((e) => e.status === 'publie' && !isPast(e))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
  const drafts = list.filter((e) => e.status === 'brouillon').length
  const draftLine = drafts ? `${drafts} brouillon${drafts > 1 ? 's' : ''}` : ''
  const title = next ? next.title : 'Événements'
  const detail = next
    ? [whenShort(next), countLine(next), next.waiting ? `${next.waiting} en attente` : '', draftLine].filter(Boolean).join(' · ')
    : draftLine
      ? `Rien de publié · ${draftLine}`
      : 'Aucun événement prévu : crée le prochain ici'
  return (
    <Link
      to={next ? `/bureau/evenements/${next.id}` : '/bureau/evenements'}
      className="flex items-center gap-3.5 rounded-[12px] bg-surface p-4 text-ink no-underline hover:ring-2 hover:ring-line"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-select text-ink">
        <CalendarDays className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold">{title}</span>
        <span className="block truncate text-[13px] text-muted">{detail}</span>
      </span>
      <ChevronRight className="size-5 text-muted" />
    </Link>
  )
}
