import { useState } from 'react'
import { Plus, SquareCheckBig, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { dayMonth, dayYear, useAssemblyAdmin, useElectionActions, type AdminView } from '../../lib/elections'
import { errorMessage } from '../../lib/errors'
import { can, useMe } from '../../lib/queries'
import { BureauPage } from './BureauPage'
import { Carence } from './elections/Carence'
import { Convoquee } from './elections/Convoquee'
import { Preparer } from './elections/Preparer'
import { Resultats } from './elections/Resultats'
import { Panel } from './elections/shared'
import { VoteEnCours } from './elections/VoteEnCours'

/* ----------------------------------------------------------------------------
   Les élections et l'AG, côté bureau : un écran par étape.
---------------------------------------------------------------------------- */

const FINISHED = ['publiee', 'annulee', 'carence']

export default function Elections() {
  const me = useMe().data
  const full = can(me, 'elections')
  const q = useAssemblyAdmin()
  // « Préparer une nouvelle AG » depuis une AG terminée : vaut tant que cette AG reste la dernière.
  const [freshFrom, setFreshFrom] = useState<string | null>(null)
  if (q.isPending) return <PageLoader />
  if (q.error || !q.data) {
    return (
      <div className="p-5 lg:p-0">
        <ErrorNote error={q.error ?? 'Les élections sont introuvables.'} />
      </div>
    )
  }
  const view = q.data
  const a = view.assembly
  const fresh = !!a && freshFrom === a.id && FINISHED.includes(a.status)
  const preparing = !a || a.status === 'brouillon' || fresh

  let body
  if (preparing) {
    body =
      full || a?.status === 'brouillon' ? (
        <Preparer
          key="preparer"
          view={a?.status === 'brouillon' ? view : { ...view, assembly: null }}
          full={full}
          onCancelNew={fresh ? () => setFreshFrom(null) : undefined}
        />
      ) : (
        <BureauPage title="Élections">
          <div className="rounded-[12px] bg-surface">
            <EmptyState title="Aucune AG en préparation" icon={<SquareCheckBig className="size-6" />}>
              Le secrétariat prépare l’AG ici : ordre du jour, convocation, candidatures, vote et résultats.
            </EmptyState>
          </div>
        </BureauPage>
      )
  } else if (a.status === 'convoquee') body = <Convoquee view={view} full={full} />
  else if (a.status === 'vote') body = <VoteEnCours view={view} full={full} />
  else if (a.status === 'depouillement' || a.status === 'publiee') body = <Resultats view={view} full={full} onNew={() => setFreshFrom(a.id)} />
  else if (a.status === 'carence') body = <Carence view={view} full={full} onNew={() => setFreshFrom(a.id)} />
  else body = <Annulee view={view} full={full} onNew={() => setFreshFrom(a.id)} />

  return (
    <>
      {body}
      {me?.guarantor ? <ClearTrials /> : null}
    </>
  )
}

function Annulee({ view, full, onNew }: { view: AdminView; full: boolean; onNew: () => void }) {
  const a = view.assembly!
  return (
    <BureauPage title="AG annulée" subtitle={`L’AG du ${dayYear(a.held_at)} a été annulée${a.cancelled_at ? ` le ${dayMonth(a.cancelled_at)}` : ''}.`}>
      <Panel className="max-w-[640px]">
        <p className="m-0 text-[15px] leading-[1.5]">{a.cancel_reason ? `Motif envoyé aux membres : ${a.cancel_reason}` : 'Les membres ont été prévenus.'}</p>
        {full ? (
          <Button className="self-start" icon={<Plus className="size-5" />} onClick={onNew}>
            Préparer une nouvelle AG
          </Button>
        ) : null}
      </Panel>
    </BureauPage>
  )
}

/** Avant le lancement, effacer les AG d'essai (et leurs votes) en une fois. */
function ClearTrials() {
  const toast = useToast()
  const { clear } = useElectionActions()
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-6 px-3 pb-6 lg:px-0 lg:pb-0">
      <section className="flex flex-wrap items-center gap-3 rounded-[12px] border-[1.5px] border-dashed border-line p-4 lg:max-w-[760px]">
        <span className="min-w-0 flex-1 text-sm text-muted">
          <strong className="text-ink">AG d’essai.</strong> Avant le lancement, efface toutes les AG, candidatures et votes d’essai en une fois.
        </span>
        <Button variant="danger-outline" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setOpen(true)}>
          Effacer les AG d’essai
        </Button>
      </section>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Effacer toutes les AG ?"
        description="Les AG, les candidatures, l’émargement, les résultats, les passations en attente, ainsi que les messages et les annonces de l’AG disparaissent. C’est définitif."
      >
        <div className="flex flex-col gap-3 pb-2">
          <Button
            variant="danger"
            busy={clear.isPending}
            onClick={() =>
              clear.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false)
                  toast('AG d’essai effacées')
                },
                onError: (e) => toast(errorMessage(e), 'error'),
              })
            }
          >
            Tout effacer
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Garder
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
