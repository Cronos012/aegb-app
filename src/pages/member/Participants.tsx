import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ChevronLeft, Info } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { SearchField } from '../../components/Field'
import { capitalize, dayShort, personLine } from '../../lib/elections'
import { rank, useEvent, useEventPeople, type EventPerson } from '../../lib/events'

function matches(p: EventPerson, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
}

function PersonRow({ p, position }: { p: EventPerson; position?: number }) {
  return (
    <li className="border-t border-line-soft first:border-0">
      <Link to={p.me ? '/app/profil' : `/app/membres/${p.id}`} className="flex items-center gap-3 px-3.5 py-[9px] text-ink no-underline hover:bg-surface-2">
        {position ? <span className="w-[26px] shrink-0 text-center text-[14px] font-extrabold text-[#6B5200]">{rank(position)}</span> : null}
        <Avatar person={p} size={42} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="flex items-center gap-1.5 text-[15px] font-bold">
            <span className="truncate">
              {p.first_name} {p.last_name}
            </span>
            {p.me ? <span className="rounded-full bg-safran-pale px-2 py-0.5 text-[11px] font-extrabold text-[#6B5200]">Toi</span> : null}
          </span>
          <span className="truncate text-[13px] text-muted">{personLine(p) || ' '}</span>
        </span>
      </Link>
    </li>
  )
}

/** Qui y va, et la liste d'attente dans l'ordre. */
export function Participants() {
  const { id } = useParams()
  const event = useEvent(id)
  const people = useEventPeople(id)
  const [tab, setTab] = useState<'going' | 'waiting'>('going')
  const [query, setQuery] = useState('')
  const e = event.data
  const data = people.data

  const going = data?.going ?? []
  const waiting = data?.waiting ?? []
  const list = (tab === 'going' ? going : waiting).filter((p) => matches(p, query))

  return (
    <div className="flex flex-1 flex-col bg-page lg:mx-auto lg:w-full lg:max-w-[640px] lg:py-8">
      <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-line-soft bg-surface py-2 pr-4 pl-2 pt-[max(env(safe-area-inset-top),8px)] lg:static lg:rounded-t-[22px] lg:px-5 lg:py-4">
        <Link to={`/app/evenements/${id}`} aria-label="Retour à l’événement" className="grid size-11 place-items-center rounded-xl text-ink hover:bg-surface-2">
          <ChevronLeft className="size-6" strokeWidth={2.2} />
        </Link>
        <div className="min-w-0">
          <h1 className="titre m-0 text-[20px]">Qui y va</h1>
          {e ? (
            <p className="m-0 truncate text-[13px] text-muted">
              {e.title} · {capitalize(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' }).format(new Date(e.starts_at)))} {dayShort(e.starts_at)}
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 py-3.5 lg:rounded-b-[22px] lg:bg-surface-2 lg:px-4">
        <div role="tablist" className="mx-4 flex gap-1.5 rounded-[14px] bg-[#ECEEF5] p-1 lg:mx-0">
          {(
            [
              ['going', `Participants · ${going.length}`],
              ['waiting', `Liste d’attente · ${waiting.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`h-[38px] flex-1 rounded-[11px] text-[14px] ${tab === key ? 'bg-surface font-extrabold text-ink shadow-[0_1px_3px_rgba(18,22,43,0.12)]' : 'font-bold text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchField value={query} onChange={setQuery} placeholder="Chercher un membre" label="Chercher un membre" className="mx-4 h-11 lg:mx-0" />
        {tab === 'waiting' ? (
          <p className="mx-4 my-0 flex gap-2 text-[13px] leading-[1.4] text-muted lg:mx-0">
            <Info className="mt-px size-4 shrink-0" />
            <span>Si quelqu’un se désiste, la première personne de la liste prend sa place et le compte AEGB la prévient.</span>
          </p>
        ) : null}
        {people.isPending ? (
          <PageLoader />
        ) : people.error ? (
          <ErrorNote error={people.error} className="mx-4" />
        ) : list.length ? (
          <ul className="mx-4 my-0 flex list-none flex-col overflow-hidden rounded-[20px] bg-surface p-0 py-1 lg:mx-0">
            {list.map((p) => (
              <PersonRow key={p.id} p={p} position={tab === 'waiting' ? waiting.indexOf(p) + 1 : undefined} />
            ))}
          </ul>
        ) : (
          <div className="mx-4 rounded-[20px] bg-surface lg:mx-0">
            <EmptyState title={query ? 'Personne à ce nom' : tab === 'going' ? 'Personne pour l’instant' : 'La liste d’attente est vide'} />
          </div>
        )}
      </div>
    </div>
  )
}
