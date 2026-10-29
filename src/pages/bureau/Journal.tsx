import { useMemo, useState } from 'react'
import { Download, EyeOff, FlaskConical, ScrollText } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { downloadCsv } from '../../lib/csv'
import { errorMessage } from '../../lib/errors'
import { dateTime, dayHeading, sameDay } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { BUREAU, useAction, useActivity, useJournalLocked, useMe, type ActivityEntry } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { ActivityRow, CATEGORIES, motif } from './activity'
import { BureauPage, Card, Chips } from './BureauPage'

const PAGE = 100
type Category = 'tout' | 'comptes' | 'membres' | 'postes'

/** Réservé au titulaire du poste d'admin numérique, tant que le journal n'est pas verrouillé. */
function JournalEssais() {
  const toast = useToast()
  const [asking, setAsking] = useState<'vider' | 'verrouiller' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clear = useAction(() => supabase.rpc('clear_journal'), [['bureau']])
  const lock = useAction(() => supabase.rpc('lock_journal'), [['bureau']])
  const busy = clear.isPending || lock.isPending

  function close() {
    setAsking(null)
    setError(null)
  }

  async function confirm() {
    setError(null)
    try {
      if (asking === 'vider') {
        await clear.mutateAsync(undefined)
        toast('Le journal est vide.')
      } else {
        await lock.mutateAsync(undefined)
        toast('Le journal est maintenant ineffaçable.')
      }
      close()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:gap-5 lg:px-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-safran/20 text-ink">
        <FlaskConical className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[15px] font-bold">Journal en mode essai</p>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.45] text-muted">
          Tant que l'appli n'est pas lancée, tu peux le vider. Au lancement officiel, rends-le ineffaçable.
          <span className="ml-1 inline-flex items-center gap-1 align-[-2px]">
            <EyeOff className="size-3.5" /> Toi seul vois cet encadré.
          </span>
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="danger-outline" size="sm" className="flex-1 lg:flex-none" onClick={() => setAsking('vider')}>
          Vider le journal
        </Button>
        <Button variant="outline" size="sm" className="flex-1 lg:flex-none" onClick={() => setAsking('verrouiller')}>
          Rendre ineffaçable
        </Button>
      </div>
      <Dialog
        open={asking !== null}
        onClose={close}
        title={asking === 'vider' ? 'Vider le journal ?' : 'Rendre le journal ineffaçable ?'}
        footer={
          <>
            <Button variant="outline" size="md" className="flex-1" onClick={close}>
              Annuler
            </Button>
            <Button variant="danger" size="md" className="flex-1" busy={busy} onClick={confirm}>
              {asking === 'vider' ? 'Vider' : 'Rendre ineffaçable'}
            </Button>
          </>
        }
      >
        <p className="m-0 text-[15px] leading-[1.5]">
          {asking === 'vider'
            ? "Toutes les lignes du journal seront effacées, pour tout le bureau. L'historique des fiches des membres sera vide aussi."
            : "C'est l'étape du lancement officiel. Ensuite, plus personne ne pourra vider le journal, toi compris, et ce choix ne pourra pas être annulé."}
        </p>
        <ErrorNote error={error} className="mt-3" />
      </Dialog>
    </Card>
  )
}

export default function Journal() {
  const desktop = useIsDesktop()
  const [limit, setLimit] = useState(PAGE)
  const [category, setCategory] = useState<Category>('tout')
  const [actor, setActor] = useState<string>('')
  const log = useActivity(limit, category === 'tout' ? null : category, actor || null)
  const locked = useJournalLocked()
  const me = useMe().data
  const entries = log.data ?? []

  const actors = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of log.data ?? []) {
      if (e.actor_id) map.set(e.actor_id, e.actor_name)
      else if (e.discreet || e.actor_name === BUREAU) map.set('bureau', e.discreet ? `${BUREAU} (ton poste)` : BUREAU)
    }
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
      // Le fichier peut circuler : il garde « Le bureau » là où les autres le voient.
      entries.map((e) => [dateTime(e.created_at), e.discreet ? BUREAU : e.actor_name, e.summary, motif(e), CATEGORIES[e.category]?.label ?? e.category]),
    )
  }

  const categories = (['tout', 'comptes', 'membres', 'postes'] as Category[]).map((c) => ({ value: c, label: c === 'tout' ? 'Tout' : CATEGORIES[c].label }))

  return (
    <BureauPage
      title="Journal d'activité"
      subtitle={`Tout ce qui se fait dans les coulisses, par qui et quand.${locked.data ? ' Personne ne peut le modifier ni l’effacer.' : ''}`}
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
      {me?.guarantor && locked.data === false ? <JournalEssais /> : null}
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
