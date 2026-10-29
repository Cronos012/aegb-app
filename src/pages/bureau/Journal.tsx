import { useMemo, useState } from 'react'
import { Download, ScrollText } from 'lucide-react'
import { Button } from '../../components/Button'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { downloadCsv } from '../../lib/csv'
import { dateTime, dayHeading, sameDay } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { useActivity, type ActivityEntry } from '../../lib/queries'
import { ActivityRow, CATEGORIES, motif } from './activity'
import { BureauPage, Card, Chips } from './BureauPage'

const PAGE = 100
type Category = 'tout' | 'comptes' | 'membres' | 'postes'

export default function Journal() {
  const desktop = useIsDesktop()
  const [limit, setLimit] = useState(PAGE)
  const [category, setCategory] = useState<Category>('tout')
  const [actor, setActor] = useState<string>('')
  const log = useActivity(limit, category === 'tout' ? null : category, actor || null)
  const entries = log.data ?? []

  const actors = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of log.data ?? []) if (e.actor_id) map.set(e.actor_id, e.actor_name)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [log.data])

  const groups: { day: string; items: ActivityEntry[] }[] = []
  for (const e of entries) {
    const last = groups[groups.length - 1]
    if (last && sameDay(last.items[0].created_at, e.created_at)) last.items.push(e)
    else groups.push({ day: dayHeading(e.created_at), items: [e] })
  }

  function exportCsv() {
    downloadCsv(
      `journal-aegb-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Qui', 'Action', 'Motif', 'Catégorie'],
      entries.map((e) => [dateTime(e.created_at), e.actor_id ? e.actor_name : 'AEGB, automatique', e.summary, motif(e), CATEGORIES[e.category]?.label ?? e.category]),
    )
  }

  const categories = (['tout', 'comptes', 'membres', 'postes'] as Category[]).map((c) => ({ value: c, label: c === 'tout' ? 'Tout' : CATEGORIES[c].label }))

  return (
    <BureauPage
      title="Journal d'activité"
      subtitle="Tout ce qui se fait dans les coulisses, par qui et quand. Personne ne peut le modifier."
      actions={
        <Button variant="outline" size="md" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!entries.length}>
          Exporter
        </Button>
      }
      controls={(onDark) => (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <Chips label="Filtrer par catégorie" options={categories} value={category} onChange={setCategory} onDark={onDark} />
          <select
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            aria-label="Filtrer par personne"
            className={`h-10 w-full min-w-0 rounded-full border-[1.5px] bg-surface pr-8 pl-4 text-[13px] font-bold text-ink outline-none focus:border-primary focus:ring-[3px] focus:ring-safran/45 lg:w-[240px] lg:shrink-0 ${onDark ? 'border-transparent' : 'border-line'}`}
          >
            <option value="">Tout le bureau</option>
            {actors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
            <option value="auto">Actions automatiques</option>
          </select>
        </div>
      )}
    >
      <ErrorNote error={log.error} />
      {log.isPending ? <PageLoader /> : null}
      {log.data && !entries.length ? (
        <Card>
          <EmptyState title="Rien à afficher" icon={<ScrollText className="size-6" />}>
            Les actions du bureau apparaîtront ici.
          </EmptyState>
        </Card>
      ) : null}
      {groups.length ? (
        <Card className="overflow-hidden">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="m-0 border-b border-line-soft bg-surface-2 px-4 py-2 text-[13px] font-bold lg:px-5">{g.day}</h2>
              <ul className="m-0 list-none divide-y divide-line-soft p-0">
                {g.items.map((e) => (
                  <ActivityRow key={e.id} entry={e} />
                ))}
              </ul>
            </section>
          ))}
        </Card>
      ) : null}
      {entries.length >= limit ? (
        <Button variant="outline" size="md" onClick={() => setLimit((l) => l + PAGE)} busy={log.isFetching} className={desktop ? 'self-center' : ''}>
          Voir les actions plus anciennes
        </Button>
      ) : null}
    </BureauPage>
  )
}
