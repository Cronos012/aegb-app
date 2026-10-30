import { useMemo, useState } from 'react'
import { Ban, Check, Clock, FilePlus2, Play, Plus, X } from 'lucide-react'
import { Avatar } from '../../../components/Avatar'
import { Button } from '../../../components/Button'
import { Dialog } from '../../../components/Dialog'
import { AgendaList } from '../../../components/elections/Parts'
import { Note } from '../../../components/Feedback'
import { SearchField, TextArea } from '../../../components/Field'
import { Pill, type Tone } from '../../../components/Pill'
import { useToast } from '../../../components/Toast'
import { dayMonth, dayYear, hour, kindLabel, personLine, remaining, useElectionActions, type AdminView, type Assembly, type Candidacy } from '../../../lib/elections'
import { errorMessage } from '../../../lib/errors'
import { useIsDesktop } from '../../../lib/media'
import { useActiveMembers, useMe } from '../../../lib/queries'
import { BureauPage } from '../BureauPage'
import { CheckLine, Panel, Steps } from './shared'

/* ----------------------------------------------------------------------------
   L'AG est convoquée : le bureau vérifie les candidatures, puis le vote
   s'ouvre (tout seul à l'heure prévue, ou à la main le jour de l'AG).
---------------------------------------------------------------------------- */

/** « À vérifier », « En attente » (cotisation en retard), « Validée »… */
function statusOf(c: Candidacy): { label: string; tone: Tone } {
  if (c.status === 'refusee') return { label: 'Refusée', tone: 'neutral' }
  if (c.status === 'retiree') return { label: 'Retirée', tone: 'neutral' }
  if (c.right === 'suspendu') return { label: 'En attente', tone: 'danger' }
  if (c.status === 'deposee') return { label: 'À vérifier', tone: 'safran' }
  return { label: 'Validée', tone: 'ok' }
}

export function Convoquee({ view, full }: { view: AdminView; full: boolean }) {
  const a = view.assembly!
  const desktop = useIsDesktop()
  const toast = useToast()
  const { open, cancel } = useElectionActions()
  const [paper, setPaper] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const now = new Date(a.now).getTime()
  const candidaciesOpen = !!a.candidacy_until && new Date(a.candidacy_until).getTime() > now
  const pending = a.seats.reduce((n, s) => n + s.candidates.filter((c) => c.status === 'deposee').length, 0)
  const sameDay = dayYear(a.now) === dayYear(a.held_at)

  const openNow = () =>
    open.mutateAsync(a.id).then(
      () => toast('Le vote est ouvert'),
      (e) => toast(errorMessage(e), 'error'),
    )

  const actions = full ? (
    <>
      {a.seats.length && candidaciesOpen ? (
        <Button variant="outline" size="md" icon={<FilePlus2 className="size-[18px]" />} onClick={() => setPaper(true)}>
          Ajouter une candidature papier
        </Button>
      ) : null}
      {sameDay ? (
        <Button size="md" icon={<Play className="size-[18px]" />} busy={open.isPending} disabled={candidaciesOpen || pending > 0} onClick={openNow}>
          Ouvrir le vote maintenant
        </Button>
      ) : null}
    </>
  ) : null

  const subtitle = a.seats.length
    ? candidaciesOpen
      ? `Jusqu’au ${dayYear(a.candidacy_until!).replace(/ \d{4}$/, '')}, ${hour(a.candidacy_until!)}. Une fois validée, une candidature apparaît dans l’onglet Votes.`
      : `Candidatures closes. Le vote s’ouvre tout seul le ${dayMonth(a.vote_opens_at)} à ${hour(a.vote_opens_at)}.`
    : `${kindLabel(a)} convoquée le ${dayMonth(a.convened_at ?? a.now)}. Le vote s’ouvre tout seul le ${dayMonth(a.vote_opens_at)} à ${hour(a.vote_opens_at)}.`

  const info = (
    <Panel title={a.convocation === 2 ? 'Seconde AG convoquée' : 'AG convoquée'}>
      <div className="flex flex-col gap-1 text-[15px] leading-[1.5]">
        <strong>
          {kindLabel(a)} · {dayYear(a.held_at)}, {hour(a.held_at)}
        </strong>
        <span>{a.place}</span>
        <span className="text-muted">
          Vote dans l’appli de {hour(a.vote_opens_at)} à {hour(a.vote_closes_at)}. {a.convened_count ? `${a.convened_count} membres convoqués.` : ''}
        </span>
      </div>
      <CheckLine
        state={pending ? 'todo' : 'ok'}
        title={pending ? `${pending} candidature${pending > 1 ? 's' : ''} à vérifier` : 'Tout est prêt pour le vote'}
        detail={pending ? 'Le vote ne s’ouvre pas tant qu’il en reste à vérifier.' : `Il s’ouvre dans ${remaining(a.vote_opens_at, now)}, tout seul.`}
      />
      <details className="rounded-[14px] bg-surface-2 px-4 py-3">
        <summary className="cursor-pointer text-sm font-bold">Ordre du jour ({a.items.length} points)</summary>
        <div className="pt-2">
          <AgendaList a={a} />
        </div>
      </details>
      {full ? (
        <button type="button" onClick={() => setCancelling(true)} className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-danger underline-offset-4 hover:underline">
          <Ban className="size-4" /> Annuler l’AG
        </button>
      ) : null}
    </Panel>
  )

  return (
    <BureauPage title={a.seats.length ? 'Candidatures' : 'AG convoquée'} subtitle={subtitle} actions={desktop ? actions : null}>
      {desktop ? <Steps step={a.seats.length ? 1 : 2} /> : null}
      {!desktop && actions ? <div className="flex flex-col gap-2.5">{actions}</div> : null}
      {a.seats.length ? (
        <Candidatures a={a} full={full} side={info} />
      ) : (
        <div className="max-w-[640px]">{info}</div>
      )}
      <PaperDialog a={a} open={paper} onClose={() => setPaper(false)} />
      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Annuler l’AG ?"
        description="Chaque membre reçoit un message avec le motif, et les candidatures sont retirées. L’AG reste dans l’historique."
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setCancelling(false)}>
              Garder l’AG
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              busy={cancel.isPending}
              disabled={!reason.trim()}
              onClick={() =>
                cancel.mutateAsync({ id: a.id, reason: reason.trim() }).then(
                  () => {
                    setCancelling(false)
                    toast('AG annulée, les membres sont prévenus')
                  },
                  (e) => toast(errorMessage(e), 'error'),
                )
              }
            >
              Annuler l’AG
            </Button>
          </>
        }
      >
        <TextArea label="Motif, envoyé aux membres" value={reason} maxLength={300} counter onChange={(e) => setReason(e.target.value)} placeholder="La salle n’est plus disponible : une nouvelle date arrive." />
      </Dialog>
    </BureauPage>
  )
}

/* ----------------------------------------------------------------------------
   Les candidatures par poste, et la fiche de celle qu'on vérifie.
---------------------------------------------------------------------------- */

function Candidatures({ a, full, side }: { a: Assembly; full: boolean; side: React.ReactNode }) {
  const desktop = useIsDesktop()
  const all = useMemo(() => a.seats.flatMap((s) => s.candidates), [a.seats])
  const [selected, setSelected] = useState<string | null>(() => all.find((c) => c.status === 'deposee')?.id ?? all[0]?.id ?? null)
  const current = all.find((c) => c.id === selected) ?? null
  const counts = {
    validees: all.filter((c) => c.status === 'validee' && c.right !== 'suspendu').length,
    verifier: all.filter((c) => c.status === 'deposee' && c.right !== 'suspendu').length,
    attente: all.filter((c) => (c.status === 'deposee' || c.status === 'validee') && c.right === 'suspendu').length,
    refusees: all.filter((c) => c.status === 'refusee').length,
  }

  const list = (
    <Panel
      title="Par poste"
      right={
        <span className="flex flex-wrap gap-1.5">
          {all.length ? <Pill tone="ok">{counts.validees} validée{counts.validees > 1 ? 's' : ''}</Pill> : <Pill tone="neutral">Aucune candidature</Pill>}
          {counts.verifier ? <Pill tone="safran">{counts.verifier} à vérifier</Pill> : null}
          {counts.attente ? <Pill tone="danger">{counts.attente} en attente</Pill> : null}
          {counts.refusees ? <Pill tone="neutral">{counts.refusees} refusée{counts.refusees > 1 ? 's' : ''}</Pill> : null}
        </span>
      }
    >
      {a.seats.map((s) => {
        const valid = s.candidates.filter((c) => c.status === 'validee').length
        return (
          <section key={s.role} className="flex flex-col">
            <h3 className="m-0 flex items-baseline justify-between gap-3 px-2 pb-1 text-xs font-extrabold tracking-[0.08em] text-muted uppercase">
              {s.label}
              <span className="text-xs font-semibold tracking-normal normal-case">{valid ? `${valid} validée${valid > 1 ? 's' : ''}` : 'aucune validée'}</span>
            </h3>
            {s.candidates.length ? (
              s.candidates.map((c) => {
                const st = statusOf(c)
                const active = c.id === selected
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelected(c.id)}
                    aria-pressed={active}
                    className={`flex items-center gap-3 rounded-xl px-2 py-2 text-left ${active ? 'bg-select ring-2 ring-leppi' : 'hover:bg-surface-2'} ${c.status === 'retiree' ? 'opacity-60' : ''}`}
                  >
                    <Avatar person={c.member} size={30} />
                    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                      <strong className="text-[15px]">
                        {c.member.first_name} {c.member.last_name}
                      </strong>
                      <span className="truncate text-[13px] text-muted">{personLine(c.member)}</span>
                    </span>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </button>
                )
              })
            ) : (
              <p className="m-0 px-2 py-1.5 text-sm text-muted">Aucune candidature.</p>
            )}
          </section>
        )
      })}
    </Panel>
  )

  const detail = current ? <Detail key={current.id} a={a} c={current} full={full} /> : null

  if (desktop) {
    return (
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-4">
        {list}
        <div className="flex flex-col gap-4">
          {detail}
          {side}
        </div>
      </div>
    )
  }
  return (
    <>
      {side}
      {list}
      {detail}
    </>
  )
}

function Detail({ a, c, full: canDecide }: { a: Assembly; c: Candidacy; full: boolean }) {
  const toast = useToast()
  const mine = useMe().data?.profile.id === c.member.id
  const full = canDecide && !mine
  const { decide } = useElectionActions()
  const [absences, setAbsences] = useState(false)
  const [refusing, setRefusing] = useState(false)
  const [reason, setReason] = useState('')
  const label = a.seats.find((s) => s.role === c.role)?.label ?? c.role
  const late = c.right === 'suspendu'
  const decided = c.decided_at ? `${c.status === 'validee' ? 'Validée' : 'Refusée'} par ${c.decided_by_name ?? 'le bureau'} le ${dayMonth(c.decided_at)}` : null

  const run = (valid: boolean) =>
    decide.mutate(
      { id: c.id, valid, reason: valid ? undefined : reason.trim() },
      {
        onSuccess: () => {
          setRefusing(false)
          toast(valid ? 'Candidature validée : le membre est prévenu' : 'Candidature refusée : le motif est envoyé au membre')
        },
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    )

  return (
    <Panel>
      <div className="flex items-center gap-3.5">
        <Avatar person={c.member} size={52} />
        <span className="flex min-w-0 flex-col">
          <strong className="titre text-[22px] leading-tight">
            {c.member.first_name} {c.member.last_name}
          </strong>
          <span className="text-sm text-muted">
            {label} · déposée le {dayMonth(c.created_at)}
            {c.paper ? ' · sur papier' : ''}
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-extrabold tracking-[0.08em] text-muted uppercase">Présentation</span>
        <p className="m-0 text-[15px] leading-[1.55] whitespace-pre-line">{c.statement}</p>
      </div>
      <div className="flex flex-col gap-2.5 rounded-[16px] bg-surface-2 p-4">
        <span className="text-xs font-extrabold tracking-[0.08em] text-muted uppercase">Conditions (article 15)</span>
        <CheckLine state={c.right === 'aucun' || c.right === 'consultatif' ? 'warn' : 'ok'} title="Statut étudiant, compte validé" detail="Vérifié par l’appli" />
        <CheckLine
          state={late ? 'warn' : 'ok'}
          title={late ? 'Cotisation en retard' : 'Cotisation à jour'}
          detail={late ? 'Si rien n’est réglé à l’ouverture du vote, la candidature est retirée (article 32).' : 'Vérifié par l’appli'}
        />
        <CheckLine state={c.status === 'validee' ? 'ok' : 'todo'} title="Trois absences au plus" detail={c.status === 'validee' ? 'Confirmé par le bureau' : 'À confirmer par le bureau'} />
      </div>
      {c.status === 'deposee' && full ? (
        <>
          <label className="flex cursor-pointer items-start gap-3 rounded-[16px] border-[1.5px] border-line p-4">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-leppi)]" checked={absences} onChange={(e) => setAbsences(e.target.checked)} />
            <span className="flex flex-col">
              <strong className="text-[15px]">Trois absences non justifiées au plus</strong>
              <span className="text-[13px] text-muted">Au mandat précédent. Ne s’applique pas à un membre arrivé depuis.</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2.5">
            <Button size="md" icon={<Check className="size-[18px]" />} disabled={!absences} busy={decide.isPending && !refusing} onClick={() => run(true)}>
              Valider la candidature
            </Button>
            <Button variant="danger-outline" size="md" icon={<X className="size-[18px]" />} onClick={() => setRefusing(true)}>
              Refuser
            </Button>
          </div>
          <p className="m-0 text-[13px] text-muted">Un refus demande un motif, envoyé au membre par le compte AEGB.</p>
        </>
      ) : null}
      {c.status === 'validee' && full ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted">{decided}</span>
          <Button variant="danger-outline" size="sm" onClick={() => setRefusing(true)}>
            Revenir sur la validation
          </Button>
        </div>
      ) : decided && c.status !== 'deposee' ? (
        <p className="m-0 text-sm text-muted">{decided}</p>
      ) : null}
      {mine && c.status === 'deposee' ? <Note>C’est ta candidature : un autre membre du bureau la vérifie.</Note> : null}
      {c.status === 'refusee' && c.reason ? <Note tone="warn">Motif envoyé : {c.reason}</Note> : null}
      {c.status === 'retiree' ? <Note>{c.reason ? `${c.reason}.` : 'Retirée par le membre.'}</Note> : null}
      <Dialog
        open={refusing}
        onClose={() => setRefusing(false)}
        title="Refuser la candidature ?"
        description={`${c.member.first_name} reçoit le motif dans ses messages, du compte AEGB.`}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setRefusing(false)}>
              Retour
            </Button>
            <Button variant="danger" className="flex-1" disabled={!reason.trim()} busy={decide.isPending} onClick={() => run(false)}>
              Refuser
            </Button>
          </>
        }
      >
        <TextArea label="Motif" value={reason} maxLength={300} counter onChange={(e) => setReason(e.target.value)} placeholder="Plus de trois absences non justifiées au mandat précédent (article 15)." />
      </Dialog>
    </Panel>
  )
}

/* ----------------------------------------------------------------------------
   Une candidature déposée sur papier, recopiée par le bureau.
---------------------------------------------------------------------------- */

function PaperDialog({ a, open, onClose }: { a: Assembly; open: boolean; onClose: () => void }) {
  const toast = useToast()
  const members = useActiveMembers(open).data
  const { addPaper } = useElectionActions()
  const [query, setQuery] = useState('')
  const [member, setMember] = useState<string | null>(null)
  const [role, setRole] = useState(a.seats[0]?.role ?? '')
  const [text, setText] = useState('')
  const q = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const list = (members ?? [])
    .filter((m) => m.member_type === 'etudiant')
    .filter((m) => !q || `${m.first_name} ${m.last_name}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
    .slice(0, 6)
  const chosen = members?.find((m) => m.id === member)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Candidature papier"
      description="Le bureau recopie une candidature remise sur papier. Elle se vérifie ensuite comme les autres."
      wide
      footer={
        <Button
          className="flex-1"
          icon={<Plus className="size-5" />}
          disabled={!member || !role || !text.trim()}
          busy={addPaper.isPending}
          onClick={() =>
            member &&
            addPaper.mutate(
              { assembly: a.id, member, role, statement: text.trim() },
              {
                onSuccess: () => {
                  toast('Candidature papier ajoutée')
                  setMember(null)
                  setText('')
                  onClose()
                },
                onError: (e) => toast(errorMessage(e), 'error'),
              },
            )
          }
        >
          Ajouter la candidature
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {chosen ? (
          <div className="flex items-center gap-3 rounded-[14px] bg-select px-3 py-2.5">
            <Avatar person={chosen} size={36} />
            <strong className="flex-1 text-[15px]">
              {chosen.first_name} {chosen.last_name}
            </strong>
            <button type="button" className="text-sm font-bold underline" onClick={() => setMember(null)}>
              Changer
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <SearchField value={query} onChange={setQuery} placeholder="Chercher le membre" />
            {list.map((m) => (
              <button key={m.id} type="button" onClick={() => setMember(m.id)} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface-2">
                <Avatar person={m} size={32} />
                <span className="text-[15px] font-semibold">
                  {m.first_name} {m.last_name}
                </span>
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-[7px]">
          <span className="text-sm font-bold">Poste</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="h-[52px] rounded-[14px] border-[1.5px] border-line bg-surface px-3 text-base">
            {a.seats.map((s) => (
              <option key={s.role} value={s.role}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <TextArea label="Présentation, recopiée" value={text} maxLength={500} counter onChange={(e) => setText(e.target.value)} />
        <p className="m-0 flex items-center gap-2 text-[13px] text-muted">
          <Clock className="size-4" /> Garde l’original : il fait foi en cas de doute.
        </p>
      </div>
    </Dialog>
  )
}
