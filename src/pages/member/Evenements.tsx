import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, CalendarPlus, Info, MessageSquare } from 'lucide-react'
import { Button } from '../../components/Button'
import { DateBadge, EventListCard } from '../../components/events/EventParts'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { BackLink } from '../../components/Hero'
import { downloadIcs, isPast, reminderDay, useEvents, whenShort, type EventCard } from '../../lib/events'
import { useIsDesktop } from '../../lib/media'

type Filter = 'avenir' | 'moi' | 'passes'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'avenir', label: 'À venir' },
  { value: 'moi', label: 'J’y vais' },
  { value: 'passes', label: 'Passés' },
]

function pick(list: EventCard[], filter: Filter): EventCard[] {
  const now = Date.now()
  if (filter === 'passes') return list.filter((e) => isPast(e, now)).reverse()
  const coming = list.filter((e) => !isPast(e, now))
  return filter === 'moi' ? coming.filter((e) => e.mine?.status === 'inscrit' && e.status === 'publie') : coming
}

const EMPTY: Record<Filter, { title: string; text: string }> = {
  avenir: { title: 'Aucun événement prévu', text: 'Quand le bureau publie un événement, il arrive ici et dans le fil.' },
  moi: { title: 'Aucune inscription pour l’instant', text: 'Dis « Je participe » sur un événement : le compte AEGB te le rappellera la veille à 18 h.' },
  passes: { title: 'Aucun événement passé', text: 'Les événements de l’année écoulée s’afficheront ici.' },
}

function ReminderHint() {
  return (
    <div className="flex gap-2.5 rounded-2xl bg-surface px-3.5 py-3 text-[13px] leading-[1.45] text-ink">
      <Info className="mt-px size-[18px] shrink-0 text-leppi" />
      <span>Le compte AEGB te rappelle chaque événement la veille à 18 h, et te prévient si l’heure ou le lieu change.</span>
    </div>
  )
}

/** Les rendez-vous de l'AEGB : à venir, ceux où je vais, et les passés. */
export function Evenements() {
  const q = useEvents()
  const list = q.data
  const error = q.error
  const loading = q.isPending
  const desktop = useIsDesktop()
  const [filter, setFilter] = useState<Filter>('avenir')
  const shown = list ? pick(list, filter) : []
  const mine = list ? pick(list, 'moi') : []
  const past = list ? pick(list, 'passes') : []

  const chips = (onDark: boolean) => (
    <div role="radiogroup" aria-label="Filtrer les événements" className="flex gap-2">
      {FILTERS.map((f) => {
        const on = f.value === filter
        const tone = onDark
          ? on
            ? 'bg-safran font-extrabold text-nuit'
            : 'border-[1.5px] border-white/30 bg-white/12 text-white'
          : on
            ? 'bg-primary font-extrabold text-primary-ink'
            : 'border-[1.5px] border-line-soft bg-surface text-ink'
        return (
          <button key={f.value} type="button" role="radio" aria-checked={on} onClick={() => setFilter(f.value)} className={`flex h-9 shrink-0 items-center rounded-full px-3.5 text-[14px] font-bold lg:h-[38px] lg:px-4 ${tone}`}>
            {f.label}
          </button>
        )
      })}
    </div>
  )

  const body = loading ? (
    <PageLoader />
  ) : error ? (
    <ErrorNote error={error} />
  ) : shown.length ? (
    <>
      {shown.map((e) => (
        <EventListCard key={e.id} event={e} large={desktop} />
      ))}
    </>
  ) : (
    <div className="rounded-[20px] bg-surface lg:col-span-2">
      <EmptyState title={EMPTY[filter].title} icon={<CalendarDays className="size-6" />}>
        {EMPTY[filter].text}
      </EmptyState>
    </div>
  )

  if (desktop) {
    return (
      <div className="flex flex-1 flex-col gap-5 px-10 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="titre m-0 text-[34px]">Événements</h1>
            <p className="mt-1 mb-0 text-[15px] text-muted">Les rendez-vous de l’AEGB. Dis « Je participe » pour recevoir le rappel la veille.</p>
          </div>
          {chips(false)}
        </div>
        <div className="grid max-w-[1180px] grid-cols-[minmax(0,1fr)_340px] items-start gap-[22px]">
          <div className="grid grid-cols-2 content-start gap-[18px]">{body}</div>
          <div className="flex flex-col gap-[18px]">
            <section className="flex flex-col gap-3.5 rounded-[22px] bg-surface px-6 py-5">
              <h2 className="titre m-0 text-[19px]">Mon agenda</h2>
              {mine.length ? (
                mine.slice(0, 5).map((e) => (
                  <Link key={e.id} to={`/app/evenements/${e.id}`} className="flex items-center gap-3 text-ink no-underline hover:opacity-85">
                    <DateBadge date={e.starts_at} size={42} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-extrabold">{e.title}</span>
                      <span className="truncate text-[13px] text-muted">
                        {whenShort(e)}
                        {e.assembly_id ? '' : ` · rappel ${reminderDay(e)} à 18 h`}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="m-0 text-[14px] text-muted">Aucune inscription à venir.</p>
              )}
              <span className="h-px bg-line-soft" />
              <span className="flex gap-2 text-[13px] leading-[1.45] text-ink">
                <MessageSquare className="mt-px size-[17px] shrink-0 text-leppi" />
                <span>Le compte AEGB t’envoie un rappel la veille à 18 h, et un message si l’heure ou le lieu change.</span>
              </span>
              {mine.length ? (
                <Button variant="outline" size="md" icon={<CalendarPlus className="size-[18px]" />} onClick={() => downloadIcs(mine, 'mes-evenements-aegb')}>
                  Ajouter à mon agenda
                </Button>
              ) : null}
            </section>
            {past.length && filter !== 'passes' ? (
              <section className="flex flex-col gap-3.5 rounded-[22px] bg-surface px-6 py-5">
                <h2 className="titre m-0 text-[19px]">Passés</h2>
                {past.slice(0, 4).map((e) => (
                  <Link key={e.id} to={`/app/evenements/${e.id}`} className="flex items-center gap-3 text-ink no-underline opacity-80 hover:opacity-100">
                    <DateBadge date={e.starts_at} size={42} muted />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[14px] font-bold">{e.title}</span>
                      <span className="text-[13px] text-muted">
                        {e.status === 'annule' ? 'Annulé' : `${e.going} participant${e.going > 1 ? 's' : ''}`}
                      </span>
                    </span>
                  </Link>
                ))}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col bg-page">
      <header className="bg-tisse flex shrink-0 flex-col gap-3 px-5 pt-[max(env(safe-area-inset-top),8px)] pb-[18px] text-white">
        <BackLink to="/app/menu" label="Retour au menu" />
        <div className="flex flex-col gap-1">
          <h1 className="titre m-0 text-[30px] leading-[1.08]">Événements</h1>
          <p className="m-0 text-[14px] text-white/85">Les rendez-vous de l’AEGB</p>
        </div>
        {chips(true)}
      </header>
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        {body}
        {filter === 'moi' && shown.length ? <ReminderHint /> : null}
      </div>
    </div>
  )
}
