import { Link, useNavigate } from 'react-router'
import { CalendarDays, Check, ChevronRight, Hourglass, Vote } from 'lucide-react'
import { errorMessage } from '../../lib/errors'
import { hour } from '../../lib/elections'
import { badgeParts, countLine, cardLine, hasStarted, isFull, isPast, rank, useEventActions, useEvents, whereShort, type EventCard, type Face } from '../../lib/events'
import { usePhotoUrl } from '../../lib/photos'
import { Avatar } from '../Avatar'
import { Logo } from '../Logo'
import { Pill } from '../Pill'
import { useToast } from '../Toast'

/** La pastille blanche du jour : « 5 » sur « DÉC. ». */
export function DateBadge({ date, size = 50, muted = false }: { date: string; size?: number; muted?: boolean }) {
  const { day, month } = badgeParts(date)
  return (
    <span className="flex shrink-0 flex-col items-center justify-center rounded-[14px] bg-surface shadow-[0_2px_8px_rgba(18,22,43,0.18)]" style={{ width: size, height: size + 4 }} aria-hidden="true">
      <span className="titre leading-none text-ink" style={{ fontSize: Math.round(size * 0.42) }}>
        {day}
      </span>
      <span className={`text-[11px] font-extrabold tracking-[0.4px] ${muted ? 'text-muted' : 'text-gn-rouge'}`}>{month}</span>
    </span>
  )
}

/** Les visages des premiers inscrits, qui se chevauchent. */
export function Faces({ faces, size = 26 }: { faces: Face[]; size?: number }) {
  if (!faces.length) return null
  return (
    <span className="flex" aria-hidden="true">
      {faces.slice(0, 4).map((f, k) => (
        <span key={f.id} className="rounded-full bg-surface p-[2px]" style={{ marginLeft: k ? -10 : 0 }}>
          <Avatar person={f} size={size} />
        </span>
      ))}
    </span>
  )
}

/** La photo de l'événement, ou un tissé indigo quand il n'y en a pas. */
export function EventCover({ event, className = '', muted = false }: { event: Pick<EventCard, 'photo_path' | 'assembly_id' | 'title'>; className?: string; muted?: boolean }) {
  const url = usePhotoUrl(event.photo_path, 'publications')
  const filter = muted ? 'saturate-[0.35]' : ''
  if (url) return <img src={url} alt="" className={`block w-full object-cover ${filter} ${className}`} />
  return (
    <div className={`bg-tisse relative grid w-full place-items-center overflow-hidden ${filter} ${className}`} aria-hidden="true">
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_50%_120%,rgba(245,184,0,0.45)_0,transparent_60%)]" />
      {event.assembly_id ? <Logo size={64} /> : <CalendarDays className="size-11 text-safran" strokeWidth={1.8} />}
    </div>
  )
}

export function AgTag() {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-leppi px-2.5 text-[12px] font-extrabold text-safran">
      <Vote className="size-3.5" strokeWidth={2.4} /> Assemblée générale
    </span>
  )
}

const BTN = 'inline-flex shrink-0 items-center gap-1.5 rounded-xl font-bold whitespace-nowrap no-underline'

/**
 * Le bouton d'une carte : « Je participe » inscrit tout de suite. Une fois
 * inscrit, il ouvre le détail (on ne se désinscrit pas d'un geste distrait).
 */
export function GoingButton({ event, small = false }: { event: EventCard; small?: boolean }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { join } = useEventActions()
  const size = small ? 'h-9 px-3 text-[13px]' : 'h-[38px] px-3.5 text-[14px]'
  const to = `/app/evenements/${event.id}`

  if (event.status === 'annule') return <span className={`${BTN} ${size} bg-danger-soft font-extrabold text-danger`}>Annulé</span>
  if (isPast(event)) return <span className="text-[13px] font-bold text-muted">Terminé</span>
  if (event.mine?.status === 'inscrit') {
    return (
      <Link to={to} className={`${BTN} ${size} bg-ok-soft font-extrabold text-ok`}>
        <Check className="size-4" strokeWidth={2.8} /> {event.assembly_id ? 'Je viens en salle' : 'J’y vais'}
      </Link>
    )
  }
  if (event.mine?.status === 'attente') {
    return (
      <Link to={to} className={`${BTN} ${size} bg-safran-pale font-extrabold text-[#6B5200]`}>
        <Hourglass className="size-4" /> {event.mine.rank ? `${rank(event.mine.rank)} en attente` : 'En attente'}
      </Link>
    )
  }
  if (hasStarted(event)) return <Link to={to} className={`${BTN} ${size} bg-surface-2 text-muted`}>En cours</Link>
  // Complet, réservé aux membres à jour : le détail explique.
  if (isFull(event)) {
    return (
      <Link to={to} className={`${BTN} ${size} bg-safran-pale font-extrabold text-[#6B5200]`}>
        <Hourglass className="size-4" /> Liste d’attente
      </Link>
    )
  }
  if (event.up_to_date_only) {
    return (
      <Link to={to} className={`${BTN} ${size} bg-primary text-primary-ink`}>
        Je participe
      </Link>
    )
  }
  return (
    <button
      type="button"
      disabled={join.isPending}
      onClick={() =>
        join.mutate(event.id, {
          onSuccess: () => toast(event.assembly_id ? 'C’est noté : tu viens en salle.' : 'C’est noté, tu y vas !'),
          onError: (e) => {
            toast(errorMessage(e), 'error')
            navigate(to)
          },
        })
      }
      className={`${BTN} ${size} bg-primary text-primary-ink disabled:opacity-60`}
    >
      {event.assembly_id ? 'Je viens en salle ?' : 'Je participe'}
    </button>
  )
}

/** La carte d'un événement dans la liste. */
export function EventListCard({ event, large = false }: { event: EventCard; large?: boolean }) {
  const past = isPast(event)
  const to = `/app/evenements/${event.id}`
  const tag = event.assembly_id ? <AgTag /> : event.status === 'annule' ? <Pill tone="danger">Annulé</Pill> : isFull(event) && !past ? <Pill tone="danger">Complet</Pill> : null
  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] bg-surface shadow-[0_1px_2px_rgba(18,22,43,0.06),0_6px_18px_rgba(18,22,43,0.06)]">
      <Link to={to} className="relative block text-ink no-underline" aria-label={event.title}>
        <EventCover event={event} muted={past || event.status === 'annule'} className={large ? 'h-[150px]' : 'h-[108px]'} />
        <span className="absolute top-3 left-3">
          <DateBadge date={event.starts_at} size={large ? 54 : 50} muted={past} />
        </span>
        {tag ? <span className="absolute top-3 right-3">{tag}</span> : null}
      </Link>
      <div className={`flex flex-col gap-2.5 ${large ? 'px-[18px] pt-3.5 pb-4' : 'px-3.5 pt-3 pb-3.5'}`}>
        <Link to={to} className="flex flex-col gap-0.5 text-ink no-underline">
          <span className={`font-extrabold ${large ? 'text-[18px]' : 'text-[17px]'}`}>{event.title}</span>
          <span className="text-[13px] text-muted lg:text-[14px]">{cardLine(event)}</span>
        </Link>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
            <Faces faces={event.faces} size={large ? 28 : 26} />
            <span className="truncate">{countLine(event)}</span>
          </span>
          <GoingButton event={event} />
        </div>
      </div>
    </article>
  )
}

/** La pastille « Événement » à côté de l'heure d'une annonce. */
export function EventBadge() {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-safran-pale px-2 text-[11px] font-extrabold text-[#6B5200]">
      <CalendarDays className="size-3" strokeWidth={2.6} /> Événement
    </span>
  )
}

/** La carte d'un événement dans une annonce du fil. */
export function FeedEvent({ id, events }: { id: string; events: EventCard[] | undefined }) {
  const event = events?.find((e) => e.id === id)
  if (!events) return <div className="mx-4 mb-3 h-[220px] animate-pulse rounded-2xl bg-surface-2" />
  if (!event) return null
  const to = `/app/evenements/${event.id}`
  const past = isPast(event)
  return (
    <div className="mx-4 mb-3 flex flex-col overflow-hidden rounded-2xl border-[1.5px] border-line-soft">
      <Link to={to} className="relative block text-ink no-underline" aria-label={event.title}>
        <EventCover event={event} className="h-[130px]" muted={past || event.status === 'annule'} />
        <span className="absolute top-3 left-3">
          <DateBadge date={event.starts_at} muted={past} />
        </span>
        {event.status === 'annule' ? (
          <span className="absolute top-3 right-3">
            <Pill tone="danger">Annulé</Pill>
          </span>
        ) : isFull(event) && !past ? (
          <span className="absolute top-3 right-3">
            <Pill tone="danger">Complet</Pill>
          </span>
        ) : null}
      </Link>
      <div className="flex flex-col gap-2.5 px-3.5 py-3">
        <Link to={to} className="flex flex-col gap-0.5 text-ink no-underline">
          <span className="text-[17px] font-extrabold">{event.title}</span>
          <span className="text-[13px] text-muted">{cardLine(event)}</span>
        </Link>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
            <Faces faces={event.faces} />
            <span className="truncate">{countLine(event)}</span>
          </span>
          <GoingButton event={event} />
        </div>
      </div>
    </div>
  )
}

function parisDay(date: Date): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** En haut du fil : l'événement où je vais aujourd'hui ou demain. */
export function NextEventBand({ className = '' }: { className?: string }) {
  const events = useEvents().data
  const now = new Date()
  const today = parisDay(now)
  const tomorrow = parisDay(new Date(now.getTime() + 86_400_000))
  const next = events?.find((e) => e.status === 'publie' && e.mine?.status === 'inscrit' && !isPast(e) && [today, tomorrow].includes(parisDay(new Date(e.starts_at))))
  if (!next) return null
  const when = parisDay(new Date(next.starts_at)) === today ? (hasStarted(next) ? 'En ce moment' : 'Aujourd’hui') : 'Demain'
  return (
    <Link to={`/app/evenements/${next.id}`} className={`flex items-center gap-2.5 bg-safran-pale px-4 py-2.5 text-[#4A3A00] no-underline lg:rounded-[18px] ${className}`}>
      <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-safran text-nuit">
        <CalendarDays className="size-[18px]" strokeWidth={2.2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-extrabold">
          {when}
          {when === 'En ce moment' ? '' : `, ${hour(next.starts_at)}`} : {next.title}
        </span>
        <span className="truncate text-[12px] font-semibold text-[#6B5200]">
          {next.assembly_id ? 'Tu viens en salle' : 'Tu y vas'} · {whereShort(next)}
        </span>
      </span>
      <ChevronRight className="size-[18px] shrink-0" />
    </Link>
  )
}
