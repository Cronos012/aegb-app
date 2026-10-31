import { useState, type ReactNode } from 'react'
import { Check, ChevronRight, Clock, List, Lock, Send, ShieldCheck, Users, Vote } from 'lucide-react'
import { Avatar } from '../../../components/Avatar'
import { Button } from '../../../components/Button'
import { Dialog } from '../../../components/Dialog'
import { Participation } from '../../../components/elections/Parts'
import { SearchField } from '../../../components/Field'
import { Hero } from '../../../components/Hero'
import { useToast } from '../../../components/Toast'
import { dayMonth, hour, openBallot, percent, personLine, remaining, useElectionActions, votants, type AdminView, type Ballot, type EmargementRow } from '../../../lib/elections'
import { errorMessage } from '../../../lib/errors'
import { time } from '../../../lib/format'
import { useIsDesktop } from '../../../lib/media'
import { BureauPage, Chips } from '../BureauPage'
import { Panel, Steps, Tile } from './shared'

/* ----------------------------------------------------------------------------
   Le vote en cours : la participation et l'émargement, jamais les choix.
---------------------------------------------------------------------------- */

type Filter = 'tous' | 'vote' | 'pas'

export function VoteEnCours({ view, full }: { view: AdminView; full: boolean }) {
  const a = view.assembly!
  const b = openBallot(a)!
  const desktop = useIsDesktop()
  const toast = useToast()
  const { remind, close } = useElectionActions()
  const [closing, setClosing] = useState(false)
  const [list, setList] = useState(false)
  const now = new Date(a.now).getTime()
  const missing = b.electors - b.voters
  const lastReminder = b.reminders?.length ? b.reminders[b.reminders.length - 1] : null
  const waitReminder = lastReminder ? new Date(lastReminder.sent_at).getTime() + 10 * 60_000 > now : false

  const doRemind = () =>
    remind.mutate(b.id, {
      onSuccess: () => toast(`Rappel envoyé à ${missing} électeur${missing > 1 ? 's' : ''}`),
      onError: (e) => toast(errorMessage(e), 'error'),
    })
  const doClose = () =>
    close.mutateAsync(b.id).then(
      () => {
        setClosing(false)
        toast('Vote fermé')
      },
      (e) => toast(errorMessage(e), 'error'),
    )

  const remindLabel = `Relancer ${missing === 1 ? 'la personne' : `les ${missing}`}`
  const title = b.round === 2 ? 'Second tour en cours' : 'Vote en cours'

  const closeDialog = (
    <Dialog
      open={closing}
      onClose={() => setClosing(false)}
      title="Fermer le vote maintenant ?"
      description={`${b.voters} votant${b.voters > 1 ? 's' : ''} sur ${b.electors}. ${
        b.quorum && b.voters < b.quorum ? `Le quorum de ${b.quorum} n’est pas atteint : les bulletins seront détruits sans être lus. ` : ''
      }Personne ne pourra plus voter. Sinon, il ferme tout seul à ${hour(b.closes_at)}.`}
    >
      <div className="flex flex-col gap-3 pb-2">
        <Button variant="danger" icon={<Lock className="size-5" />} busy={close.isPending} onClick={doClose}>
          Fermer le vote
        </Button>
        <Button variant="outline" onClick={() => setClosing(false)}>
          Laisser ouvert
        </Button>
      </div>
    </Dialog>
  )

  if (!desktop) {
    return (
      <>
        <Hero
          back="/bureau"
          title={title}
          subtitle={`AG du ${dayMonth(a.held_at)} · ouvert à ${hour(b.opened_at)}, ferme à ${hour(b.closes_at)}`}
          right={
            <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-sm font-bold">
              <span className="size-2.5 animate-pulse rounded-full bg-[#4ADE80]" aria-hidden="true" /> En direct
            </span>
          }
        />
        <div className="relative -mt-6 flex flex-1 flex-col gap-3 px-3 pb-6">
          <section className="flex flex-col gap-3 rounded-[12px] bg-surface p-5 shadow-[0_1px_0_rgba(18,24,61,0.04)]">
            <div className="flex items-end justify-between gap-3">
              <span className="flex items-baseline gap-2">
                <span className="titre text-[52px] leading-none">{b.voters}</span>
                <span className="text-[17px] text-muted">votant{b.voters > 1 ? 's' : ''} sur {b.electors}</span>
              </span>
              <span className="titre text-[26px] text-ok">{percent(b.voters, b.electors)} %</span>
            </div>
            <Bar b={b} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
              <QuorumLine b={b} />
              <span className="inline-flex items-center gap-1.5 text-[#163F93]">
                <Clock className="size-4" /> Encore {remaining(b.closes_at, now)}
              </span>
            </div>
          </section>
          {missing > 0 ? (
            <section className="flex flex-col gap-3 rounded-[12px] bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-safran-pale text-[#163F93]">
                  <Users className="size-5" />
                </span>
                <span className="flex flex-col">
                  <strong className="text-[17px]">
                    {missing} {missing > 1 ? 'n’ont' : 'n’a'} pas encore voté
                  </strong>
                  <span className="text-sm text-muted">{waitReminder && lastReminder ? `Dernier rappel à ${time(lastReminder.sent_at)} : le suivant dans dix minutes au plus tôt.` : 'Un rappel part en message du compte AEGB.'}</span>
                </span>
              </div>
              {full ? (
                <Button variant="soft" icon={<Send className="size-5" />} busy={remind.isPending} disabled={waitReminder} onClick={doRemind}>
                  {remindLabel}
                </Button>
              ) : null}
            </section>
          ) : null}
          <section className="overflow-hidden rounded-[12px] bg-surface">
            <button type="button" onClick={() => setList(true)} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-surface-2">
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-select">
                <List className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="text-[16px]">Émargement</strong>
                <span className="text-sm text-muted">Qui a voté, jamais pour qui</span>
              </span>
              <ChevronRight className="size-5 text-muted" />
            </button>
            <div className="flex items-center gap-3.5 border-t border-line-soft px-4 py-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-surface-2">
                <Lock className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="text-[16px]">Résultats scellés</strong>
                <span className="text-sm text-muted">Personne ne les voit avant la fermeture</span>
              </span>
            </div>
          </section>
          {full ? (
            <div className="mt-auto flex flex-col gap-2 pt-6">
              <Button variant="danger-outline" icon={<Lock className="size-5" />} onClick={() => setClosing(true)}>
                Fermer le vote
              </Button>
              <p className="m-0 text-center text-sm text-muted">Sinon, il ferme tout seul à {hour(b.closes_at)}.</p>
            </div>
          ) : null}
        </div>
        <Dialog open={list} onClose={() => setList(false)} title="Émargement" description="Qui a voté et à quelle heure, jamais pour qui.">
          <Emargement rows={view.emargement ?? []} />
        </Dialog>
        {closeDialog}
      </>
    )
  }

  const quorumTile =
    b.quorum === 0 ? (
      <Tile icon={<Check className="size-4" strokeWidth={2.6} />} tone="bg-ok-soft text-ok" label="Quorum" value="Sans quorum" detail="Le vote compte quel que soit le nombre de votants" />
    ) : b.voters >= b.quorum ? (
      <Tile
        icon={<Check className="size-4" strokeWidth={2.6} />}
        tone="bg-ok-soft text-ok"
        label="Quorum"
        value="Atteint"
        detail={`${votants(b.quorum)}${b.quorum_reached_at ? `, atteint à ${time(b.quorum_reached_at)}` : ''}`}
      />
    ) : (
      <Tile icon={<Users className="size-4" />} tone="bg-danger-soft text-danger" label="Quorum" value="Pas encore" detail={`Il faut ${votants(b.quorum)}, encore ${b.quorum - b.voters}`} />
    )

  return (
    <BureauPage
      title={title}
      subtitle={`Ouvert depuis ${hour(b.opened_at)}, il ferme tout seul à ${hour(b.closes_at)}. Les résultats restent scellés, même pour le bureau.`}
      actions={
        full ? (
          <>
            {missing > 0 ? (
              <Button variant="outline" size="md" icon={<Send className="size-[18px]" />} busy={remind.isPending} disabled={waitReminder} onClick={doRemind}>
                {remindLabel}
              </Button>
            ) : null}
            <Button variant="danger" size="md" icon={<Lock className="size-[18px]" />} onClick={() => setClosing(true)}>
              Fermer le vote
            </Button>
          </>
        ) : null
      }
    >
      <Steps step={2} />
      <div className="grid grid-cols-4 gap-4">
        <Tile icon={<Users className="size-4" />} tone="bg-ok-soft text-ok" label="Votants" value={`${b.voters} sur ${b.electors}`} detail={`${percent(b.voters, b.electors)} % de la liste électorale`} />
        {quorumTile}
        <Tile icon={<Clock className="size-4" />} tone="bg-safran-pale text-[#163F93]" label="Temps restant" value={remaining(b.closes_at, now)} detail={`Le vote ferme tout seul à ${hour(b.closes_at)}`} />
        <Tile icon={<Lock className="size-4" />} tone="bg-select text-ink" label="Résultats" value="Scellés" detail="Personne ne les voit avant la fin" />
      </div>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-4">
        <Panel title="Émargement">
          <Emargement rows={view.emargement ?? []} />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Participation">
            <Participation ballot={b} compact />
            <Timeline b={b} />
          </Panel>
          <section className="flex flex-col gap-2 rounded-[12px] bg-select/60 p-5">
            <strong className="flex items-center gap-2 text-[15px]">
              <ShieldCheck className="size-5" /> Ce que voit le bureau
            </strong>
            <p className="m-0 text-sm leading-[1.55] text-ink/85">
              Qui a voté et à quelle heure, jamais pour qui. Les bulletins n’ont pas de nom : la base ne garde que les totaux, scellés jusqu’à la fermeture.
            </p>
          </section>
        </div>
      </div>
      {closeDialog}
    </BureauPage>
  )
}

function Bar({ b }: { b: Ballot }) {
  const fill = b.electors ? Math.min(100, (100 * b.voters) / b.electors) : 0
  const mark = b.electors && b.quorum ? Math.min(100, (100 * b.quorum) / b.electors) : null
  return (
    <div className="relative h-3 rounded-full bg-line-soft" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-full bg-ok" style={{ width: `${fill}%` }} />
      {mark !== null ? <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-nuit" style={{ left: `calc(${mark}% - 1px)` }} /> : null}
    </div>
  )
}

function QuorumLine({ b }: { b: Ballot }) {
  if (b.quorum === 0) return <span className="text-muted">Sans quorum</span>
  if (b.voters >= b.quorum)
    return (
      <span className="inline-flex items-center gap-1.5 text-ok">
        <Check className="size-4" strokeWidth={2.6} /> Quorum de {b.quorum} atteint{b.quorum_reached_at ? ` à ${time(b.quorum_reached_at)}` : ''}
      </span>
    )
  return <span className="text-danger">Quorum : {b.quorum}, encore {b.quorum - b.voters}</span>
}

function Timeline({ b }: { b: Ballot }) {
  const events: { at: string; icon: ReactNode; tone: string; text: string }[] = [
    { at: b.opened_at, icon: <Vote className="size-4" />, tone: 'bg-select text-ink', text: `Vote ouvert par ${b.opened_by_name}` },
  ]
  if (b.quorum_reached_at && b.quorum) events.push({ at: b.quorum_reached_at, icon: <Check className="size-4" strokeWidth={2.6} />, tone: 'bg-ok-soft text-ok', text: `Quorum atteint : ${votants(b.quorum)}` })
  for (const r of b.reminders ?? [])
    events.push({ at: r.sent_at, icon: <Send className="size-4" />, tone: 'bg-safran-pale text-[#163F93]', text: `Rappel envoyé aux ${r.recipients} qui n’avaient pas voté` })
  events.sort((x, y) => x.at.localeCompare(y.at))
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {events.map((e, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className={`grid size-8 shrink-0 place-items-center rounded-full ${e.tone}`}>{e.icon}</span>
          <span className="flex flex-col">
            <span className="text-[13px] font-bold text-muted">{time(e.at)}</span>
            <span className="text-[15px]">{e.text}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function Emargement({ rows }: { rows: EmargementRow[] }) {
  const [filter, setFilter] = useState<Filter>('tous')
  const [query, setQuery] = useState('')
  const voted = rows.filter((r) => r.voted_at).length
  const q = normalize(query.trim())
  const shown = rows
    .filter((r) => (filter === 'tous' ? true : filter === 'vote' ? !!r.voted_at : !r.voted_at))
    .filter((r) => !q || normalize(`${r.first_name} ${r.last_name}`).includes(q))
  return (
    <div className="flex flex-col gap-3">
      <Chips
        label="Filtrer l’émargement"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'tous', label: 'Tous', count: rows.length },
          { value: 'vote', label: 'A voté', count: voted },
          { value: 'pas', label: 'Pas encore', count: rows.length - voted },
        ]}
      />
      <SearchField value={query} onChange={setQuery} placeholder="Chercher un membre" />
      <ul className="m-0 flex list-none flex-col p-0">
        {shown.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-t border-line-soft py-2.5 first:border-0">
            <Avatar person={r} size={34} />
            <span className="flex min-w-0 flex-1 flex-col">
              <strong className="truncate text-[15px] leading-tight">
                {r.first_name} {r.last_name}
              </strong>
              {personLine(r) ? <span className="truncate text-[13px] text-muted">{personLine(r)}</span> : null}
            </span>
            {r.voted_at ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-ok">
                <Check className="size-4" strokeWidth={2.6} /> A voté · {time(r.voted_at)}
              </span>
            ) : (
              <span className="shrink-0 text-sm text-muted">Pas encore</span>
            )}
          </li>
        ))}
        {!shown.length ? <li className="py-4 text-center text-sm text-muted">Personne ici.</li> : null}
      </ul>
    </div>
  )
}
