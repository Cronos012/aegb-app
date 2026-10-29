import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { SearchField } from '../../components/Field'
import { matches, memberLine, useDirectory, type DirectoryMember } from '../../lib/feed'
import { Chips } from '../bureau/BureauPage'

/** Les filtres proposés : les villes et les écoles les plus courantes. */
function topValues(list: DirectoryMember[], key: 'city' | 'school', n: number) {
  const counts = new Map<string, number>()
  for (const m of list) {
    const v = m[key]?.trim()
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v]) => v)
}

export function MemberRow({ m }: { m: DirectoryMember }) {
  return (
    <Link to={`/app/membres/${m.id}`} className="flex items-center gap-3.5 px-4 py-3 text-ink no-underline hover:bg-surface-2">
      <Avatar person={m} size={48} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold">
          {m.first_name} {m.last_name}
        </span>
        <span className="block truncate text-[14px] text-muted">{memberLine(m)}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </Link>
  )
}

export function Annuaire() {
  const navigate = useNavigate()
  const directory = useDirectory()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('tous')
  const list = useMemo(() => directory.data ?? [], [directory.data])
  const filters = useMemo(() => {
    const cities = topValues(list, 'city', 3).map((v) => ({ value: `ville:${v}`, label: v }))
    const schools = topValues(list, 'school', 3).map((v) => ({ value: `ecole:${v}`, label: v }))
    return [{ value: 'tous', label: 'Tous' }, ...cities, ...schools]
  }, [list])

  if (directory.isPending) return <PageLoader />

  const [kind, value] = filter.split(/:(.*)/)
  const shown = list.filter((m) => {
    if (kind === 'ville' && m.city?.trim() !== value) return false
    if (kind === 'ecole' && m.school?.trim() !== value) return false
    return matches(m, query)
  })

  return (
    <div className="flex flex-1 flex-col lg:px-10 lg:py-8">
      <header className="sticky top-0 z-20 flex h-[calc(64px+env(safe-area-inset-top))] items-center gap-2 border-b border-line-soft bg-surface px-3 pt-[env(safe-area-inset-top)] lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:p-0">
        <button type="button" onClick={() => navigate(-1)} aria-label="Retour" className="grid size-11 place-items-center rounded-xl hover:bg-surface-2 lg:hidden">
          <ChevronLeft className="size-6" strokeWidth={2.2} />
        </button>
        <div>
          <h1 className="titre m-0 text-[22px] leading-tight lg:text-[34px]">Annuaire</h1>
          <p className="m-0 text-[13px] text-muted lg:text-[15px]">
            {list.length} membre{list.length > 1 ? 's' : ''}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3 px-5 pt-4 pb-6 lg:max-w-[760px] lg:px-0 lg:pt-6">
        <SearchField value={query} onChange={setQuery} placeholder="Nom, ville, école, formation" label="Chercher un membre" />
        <Chips label="Filtrer" options={filters} value={filter} onChange={setFilter} />
        <ErrorNote error={directory.error} />
        {shown.length ? (
          <ul className="m-0 list-none divide-y divide-line-soft overflow-hidden rounded-[22px] bg-surface p-0">
            {shown.map((m) => (
              <li key={m.id}>
                <MemberRow m={m} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-[22px] bg-surface">
            <EmptyState title="Personne ne correspond" icon={<Users className="size-6" />}>
              Essaie un autre nom, une autre ville ou une autre école.
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  )
}
