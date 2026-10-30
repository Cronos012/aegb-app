import { useState, type ReactNode } from 'react'
import { AlertTriangle, Check, Clock, FileText, Pencil, SquareCheckBig, Vote } from 'lucide-react'
import { Avatar, EmptyAvatar } from '../../components/Avatar'
import { Button, ButtonLink } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { AgendaLinks, Frise, Participation, RightCard } from '../../components/elections/Parts'
import { EmptyState, ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { Hero, Sheet } from '../../components/Hero'
import { Logo } from '../../components/Logo'
import { Pill } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { monthsLabel, useMyDues } from '../../lib/dues'
import {
  candidacyMap,
  currentBallot,
  day,
  dayYear,
  hour,
  kindLabel,
  openBallot,
  percent,
  plainDay,
  remaining,
  seatResults,
  useAssembly,
  useCandidacyActions,
  votesFor,
  type Assembly,
  type Ballot,
  type Candidacy,
} from '../../lib/elections'
import { errorMessage } from '../../lib/errors'
import { time } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { downloadPv } from '../../lib/pvPdf'

/* ----------------------------------------------------------------------------
   L'onglet Votes : l'AG qui vient, mon droit de vote, les candidatures, le
   vote et, une fois publiés, les résultats.
---------------------------------------------------------------------------- */

export function Votes() {
  const q = useAssembly()
  if (q.isPending) return <PageLoader />
  if (q.error) {
    return (
      <div className="p-5">
        <ErrorNote error={q.error} />
      </div>
    )
  }
  const a = q.data
  if (!a) return <NoAssembly />
  if (a.status === 'publiee') return <Results a={a} />
  return <AssemblyPage a={a} />
}

function NoAssembly() {
  return (
    <div className="flex flex-1 flex-col bg-surface lg:bg-page lg:px-10 lg:py-8">
      <header className="sticky top-0 z-10 flex h-[60px] items-center gap-3 border-b border-line-soft bg-surface px-5 pt-[env(safe-area-inset-top)] lg:hidden">
        <Logo size={30} />
        <h1 className="titre m-0 text-[22px]">Votes</h1>
      </header>
      <h1 className="titre m-0 hidden text-[34px] lg:block">Votes</h1>
      <div className="lg:mt-6 lg:max-w-[640px] lg:rounded-[22px] lg:bg-surface">
        <EmptyState title="Aucune assemblée générale prévue" icon={<SquareCheckBig className="size-6" />}>
          Quand le bureau convoque une AG, la convocation arrive dans tes messages et tout se passe ici : candidatures, vote et résultats.
        </EmptyState>
      </div>
    </div>
  )
}

/** Mise en page commune : en-tête tissé sur téléphone, titre et deux colonnes sur ordinateur. */
function Layout({ title, subtitle, right, main, side }: { title: string; subtitle: ReactNode; right?: ReactNode; main: ReactNode; side: ReactNode }) {
  const desktop = useIsDesktop()
  if (desktop) {
    return (
      <div className="flex flex-1 flex-col gap-6 px-10 py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="titre m-0 text-[34px]">{title}</h1>
            <p className="mt-1 mb-0 text-[15px] text-muted">{subtitle}</p>
          </div>
          {right}
        </div>
        <div className="grid max-w-[1100px] grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
          <div className="flex flex-col gap-4">{main}</div>
          <div className="flex flex-col gap-4">{side}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-1 flex-col">
      <Hero back="/app/menu" title={title} subtitle={subtitle} right={right} />
      <Sheet className="gap-4">
        {main}
        {side}
      </Sheet>
    </div>
  )
}

function AssemblyPage({ a }: { a: Assembly }) {
  const dues = useMyDues(a.my.right === 'suspendu')
  const lateMonths = dues.data?.late.length ? `de ${monthsLabel(dues.data.late).replace(/^\S/, (c) => c.toLowerCase())}` : null
  const ballot = openBallot(a)
  const right = <RightCard right={a.my.right} lateCents={a.my.late_cents} lateMonths={lateMonths} voteOpen={!!ballot} />
  const title = a.convocation === 2 ? 'Seconde assemblée générale' : 'Assemblée générale'
  const subtitle = (
    <>
      {kindLabel(a)} · {day(a.held_at)}, {hour(a.held_at)}
      <br />
      {a.place}
    </>
  )
  return (
    <Layout
      title={title}
      subtitle={subtitle}
      main={
        <>
          {a.my.right === 'suspendu' ? right : null}
          <MainCard a={a} />
          {a.my.right !== 'suspendu' ? right : null}
          {a.convocation === 2 && a.first ? (
            <Note>
              La première AG, le {day(a.first.held_at)}, n’a pas atteint le quorum.{' '}
              {a.kind === 'ordinaire' ? 'Cette fois, le vote compte quel que soit le nombre de votants (article 13).' : 'Cette fois, il faut un tiers des inscrits (article 14).'}
            </Note>
          ) : null}
        </>
      }
      side={
        <>
          <AgendaLinks a={a} />
          <div className="px-1 pt-2 pb-1">
            <Frise a={a} />
          </div>
        </>
      }
    />
  )
}

function MainCard({ a }: { a: Assembly }) {
  const now = new Date(a.now).getTime()
  const ballot = openBallot(a)
  if (a.status === 'vote' && ballot) return <VoteCard a={a} b={ballot} />
  if (a.status === 'depouillement') return <ClosedCard a={a} />
  if (a.status === 'carence') return <CarenceCard a={a} />
  if (a.seats.length && a.candidacy_until && new Date(a.candidacy_until).getTime() > now) return <CandidacyCard a={a} />
  return (
    <section className="flex flex-col gap-3 rounded-[24px] border-[1.5px] border-line-soft bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <Pill tone="brand">Convocation envoyée</Pill>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-muted">
          <Clock className="size-4" /> Dans {remaining(a.vote_opens_at, now)}
        </span>
      </div>
      <h2 className="titre m-0 text-[24px] leading-tight">Le vote s’ouvre le {day(a.vote_opens_at)}</h2>
      <p className="m-0 text-[15px] leading-[1.5]">
        De {hour(a.vote_opens_at)} à {hour(a.vote_closes_at)}, dans l’appli, en salle ou à distance. Un message du compte AEGB te préviendra à l’ouverture.
      </p>
      {a.my.candidacy ? <MyCandidacy a={a} c={a.my.candidacy} /> : null}
    </section>
  )
}

function CandidacyCard({ a }: { a: Assembly }) {
  const now = new Date(a.now).getTime()
  const mine = a.my.candidacy
  const active = mine && (mine.status === 'deposee' || mine.status === 'validee')
  const validated = a.seats.reduce((n, s) => n + s.candidates.length, 0)
  return (
    <section className="flex flex-col gap-3.5 rounded-[24px] border-2 border-safran bg-safran-pale/45 p-5">
      <div className="flex items-center justify-between gap-3">
        <Pill tone="safran">Candidatures ouvertes</Pill>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B4A00]">
          <Clock className="size-4" /> Encore {remaining(a.candidacy_until!, now)}
        </span>
      </div>
      <h2 className="titre m-0 text-[26px] leading-tight">Envie d’agir au bureau ?</h2>
      <p className="m-0 text-[15px] leading-[1.5]">
        Tu peux te présenter à un poste jusqu’au {day(a.candidacy_until!)}, {hour(a.candidacy_until!)}. Le vote aura lieu pendant l’AG, dans l’appli.
      </p>
      {mine ? <MyCandidacy a={a} c={mine} /> : null}
      {!active && a.my.can_run ? (
        <ButtonLink to="/app/votes/candidature" icon={<Pencil className="size-5" />}>
          Je me présente
        </ButtonLink>
      ) : null}
      {!a.my.can_run && a.my.right === 'consultatif' ? (
        <p className="m-0 text-sm text-muted">Seuls les membres actifs étudiants, à jour de leur cotisation, peuvent se présenter (article 15).</p>
      ) : null}
      <p className="m-0 text-sm leading-[1.45] text-muted">
        {validated ? `${validated} candidature${validated > 1 ? 's' : ''} validée${validated > 1 ? 's' : ''} pour l’instant.` : 'Aucune candidature validée pour l’instant.'} Le bureau vérifie chacune (article 15).
      </p>
    </section>
  )
}

const MINE: Record<Candidacy['status'], { label: string; tone: 'warn' | 'ok' | 'danger' | 'neutral' }> = {
  deposee: { label: 'En vérification', tone: 'warn' },
  validee: { label: 'Validée', tone: 'ok' },
  refusee: { label: 'Refusée', tone: 'danger' },
  retiree: { label: 'Retirée', tone: 'neutral' },
}

function MyCandidacy({ a, c }: { a: Assembly; c: Candidacy }) {
  const [confirm, setConfirm] = useState(false)
  const { withdraw } = useCandidacyActions()
  const toast = useToast()
  const label = a.seats.find((s) => s.role === c.role)?.label ?? c.role
  const canWithdraw = a.status === 'convoquee' && (c.status === 'deposee' || c.status === 'validee')
  return (
    <div className="flex flex-col gap-2.5 rounded-[18px] bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-xs font-bold tracking-[0.06em] text-muted uppercase">Ta candidature</span>
          <strong className="text-[16px]">{label}</strong>
        </span>
        <Pill tone={a.my.right === 'suspendu' && canWithdraw ? 'danger' : MINE[c.status].tone}>
          {a.my.right === 'suspendu' && canWithdraw ? 'En attente' : MINE[c.status].label}
        </Pill>
      </div>
      {c.status === 'deposee' ? <p className="m-0 text-sm text-muted">Le bureau vérifie les conditions de l’article 15. Tu recevras sa réponse dans tes messages.</p> : null}
      {c.status === 'validee' ? <p className="m-0 text-sm text-muted">Elle apparaît dans la liste des candidats.</p> : null}
      {c.status === 'refusee' && c.reason ? <p className="m-0 text-sm">Motif : {c.reason}</p> : null}
      {c.status === 'retiree' && c.reason ? <p className="m-0 text-sm text-muted">{c.reason}.</p> : null}
      {a.my.right === 'suspendu' && canWithdraw ? (
        <p className="m-0 text-sm text-danger">Ta cotisation n’est plus à jour : règle ton retard avant l’ouverture du vote, sinon ta candidature sera retirée (article 32).</p>
      ) : null}
      {canWithdraw ? (
        <button type="button" onClick={() => setConfirm(true)} className="self-start text-sm font-bold text-danger underline underline-offset-2">
          Retirer ma candidature
        </button>
      ) : null}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Retirer ta candidature ?"
        description={`Tu ne seras plus candidat au poste ${label}. Tu pourras en déposer une autre tant que les candidatures sont ouvertes.`}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setConfirm(false)}>
              Garder
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              busy={withdraw.isPending}
              onClick={() =>
                withdraw.mutate(c.id, {
                  onSuccess: () => {
                    setConfirm(false)
                    toast('Ta candidature est retirée')
                  },
                  onError: (e) => toast(errorMessage(e), 'error'),
                })
              }
            >
              Retirer
            </Button>
          </>
        }
      >
        <span />
      </Dialog>
    </div>
  )
}

function questionsLine(b: Ballot): string {
  const res = b.questions.filter((q) => q.kind === 'resolution').length
  const seats = b.questions.filter((q) => q.kind === 'poste').length
  const n = b.questions.length
  if (b.round === 2) return `Second tour pour ${b.questions.map((q) => q.title).join(', ')}, entre les candidats à égalité.`
  const parts = [res ? `${res} résolution${res > 1 ? 's' : ''}` : null, seats ? `l’élection de ${seats} poste${seats > 1 ? 's' : ''} du bureau` : null].filter(Boolean)
  return `${n} question${n > 1 ? 's' : ''} : ${parts.join(', puis ')}.`
}

function VoteCard({ a, b }: { a: Assembly; b: Ballot }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-[24px] border-2 border-safran bg-safran-pale/45 p-5">
      <div className="flex items-center justify-between gap-3">
        <Pill tone="ok" icon={<Check className="size-3.5" strokeWidth={3} />}>
          {b.round === 2 ? 'Second tour ouvert' : 'Vote ouvert'}
        </Pill>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B4A00]">
          <Clock className="size-4" /> Ferme à {hour(b.closes_at)}
        </span>
      </div>
      {b.voted_at ? (
        <>
          <h2 className="titre m-0 text-[26px] leading-tight">Tu as voté</h2>
          <p className="m-0 text-[15px] leading-[1.5]">Ton bulletin est dans l’urne depuis {time(b.voted_at)}. Personne ne peut savoir ce que tu as choisi.</p>
        </>
      ) : a.my.right === 'actif' ? (
        <>
          <h2 className="titre m-0 text-[26px] leading-tight">Ton bulletin t’attend</h2>
          <p className="m-0 text-[15px] leading-[1.5]">{questionsLine(b)} Ton vote est secret.</p>
          <ButtonLink to="/app/votes/isoloir" icon={<Vote className="size-5" />}>
            Voter
          </ButtonLink>
        </>
      ) : (
        <>
          <h2 className="titre m-0 text-[24px] leading-tight">Le vote est ouvert</h2>
          <p className="m-0 text-[15px] leading-[1.5]">
            {a.my.right === 'suspendu' ? 'Règle ton retard pour voter : c’est possible jusqu’à la fermeture.' : 'Seuls les membres actifs étudiants votent. Tu peux suivre la participation ici.'}
          </p>
        </>
      )}
      <Participation ballot={b} />
    </section>
  )
}

function ClosedCard({ a }: { a: Assembly }) {
  const b = currentBallot(a)
  return (
    <section className="flex flex-col gap-3 rounded-[24px] border-[1.5px] border-line-soft bg-surface p-5">
      <Pill tone="neutral" className="self-start">
        Vote fermé
      </Pill>
      <h2 className="titre m-0 text-[24px] leading-tight">Dépouillement</h2>
      <p className="m-0 text-[15px] leading-[1.5]">
        Le vote a fermé{b?.closed_at ? ` à ${hour(b.closed_at)}` : ''}. Le bureau vérifie les résultats, puis les publie dans le fil et ici, avec le procès-verbal.
      </p>
      {b ? <Participation ballot={b} /> : null}
      {b?.voted_at ? <p className="m-0 text-sm text-muted">Tu as voté à {time(b.voted_at)}.</p> : null}
    </section>
  )
}

function CarenceCard({ a }: { a: Assembly }) {
  const b = a.ballots.find((x) => x.round === 1)
  const held = new Date(a.held_at).getTime()
  return (
    <section className="flex flex-col gap-3 rounded-[24px] border-2 border-danger/30 bg-danger-soft/50 p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
          <AlertTriangle className="size-5" />
        </span>
        <h2 className="titre m-0 text-[24px] leading-tight text-danger">Quorum non atteint</h2>
      </div>
      {b ? (
        <p className="m-0 text-[15px] leading-[1.5]">
          {b.voters} votant{b.voters > 1 ? 's' : ''} sur {b.electors} : il en fallait {b.quorum}. Le vote ne compte pas : les bulletins ont été détruits sans être lus (article 13).
        </p>
      ) : null}
      <p className="m-0 text-[15px] leading-[1.5]">
        Le bureau convoque une seconde AG entre le {day(new Date(held + 7 * 86_400_000))} et le {day(new Date(held + 21 * 86_400_000))}, avec le même ordre du jour. La convocation arrivera dans tes messages.
      </p>
    </section>
  )
}

/* ----------------------------------------------------------------------------
   Les résultats publiés.
---------------------------------------------------------------------------- */

function PvButton({ a, dark }: { a: Assembly; dark: boolean }) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const run = async () => {
    setBusy(true)
    try {
      await downloadPv(a)
    } catch {
      toast('Le procès-verbal n’a pas pu être créé. Réessaie.', 'error')
    } finally {
      setBusy(false)
    }
  }
  return dark ? (
    <button type="button" onClick={run} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-full bg-white/12 px-4 text-[15px] font-bold text-white hover:bg-white/20">
      <FileText className="size-[18px]" /> Procès-verbal
    </button>
  ) : (
    <Button variant="outline" size="md" busy={busy} icon={<FileText className="size-[18px]" />} onClick={run}>
      Procès-verbal (PDF)
    </Button>
  )
}

function Results({ a }: { a: Assembly }) {
  const desktop = useIsDesktop()
  const first = a.ballots.find((b) => b.round === 1)
  const names = candidacyMap(a)
  const resolutions = first?.questions.filter((q) => q.kind === 'resolution') ?? []
  const seats = seatResults(a)

  const summary = first ? (
    <div className="flex items-center gap-4 rounded-[22px] bg-ok-soft px-5 py-4">
      <span className="titre text-[44px] leading-none text-ok">{percent(first.voters, first.electors)} %</span>
      <span className="flex min-w-0 flex-col">
        <strong className="text-[16px] leading-snug text-ok">
          {first.voters} votant{first.voters > 1 ? 's' : ''} sur {first.electors} · {first.quorum ? 'quorum atteint' : 'sans quorum'}
        </strong>
        <span className="text-sm text-ink/75">
          {first.quorum
            ? `Il en fallait ${first.quorum}, ${a.kind === 'ordinaire' || a.convocation === 2 ? 'un tiers' : 'la moitié'} de la liste électorale.`
            : 'Seconde AG : le vote comptait quel que soit le nombre de votants.'}
        </span>
      </span>
    </div>
  ) : null

  const body = (
    <>
      {summary}
      {resolutions.length ? (
        <section className="flex flex-col">
          <h2 className="m-0 border-b border-line-soft pb-2 text-xs font-extrabold tracking-[0.08em] text-muted uppercase">Résolutions</h2>
          {resolutions.map((q) => {
            const r = q.result
            if (!r) return null
            const adopted = r.outcome === 'adoptee'
            return (
              <div key={q.id} className="flex items-center gap-3 border-b border-line-soft py-3">
                <span className="min-w-0 flex-1 text-[16px] font-bold">{q.title}</span>
                <span className="text-sm whitespace-nowrap text-muted">{percent(r.counts.pour ?? 0, r.expressed)} % pour</span>
                <Pill tone={adopted ? 'ok' : 'danger'} icon={adopted ? <Check className="size-3.5" strokeWidth={3} /> : undefined}>
                  {adopted ? 'Adoptée' : 'Rejetée'}
                </Pill>
              </div>
            )
          })}
        </section>
      ) : null}
      {seats.length ? (
        <section className="flex flex-col">
          <h2 className="m-0 border-b border-line-soft pb-2 text-xs font-extrabold tracking-[0.08em] text-muted uppercase">Le bureau {a.mandate_year}</h2>
          {seats.map((s) => {
            const q = s.question
            const r = q?.result
            const winner = r?.winner ? names.get(r.winner) : null
            let score: ReactNode = null
            let sub = ''
            if (q && r && winner) {
              score = `${percent(votesFor(q, winner.id), r.expressed)} %`
              if (s.round === 2) sub = 'au second tour'
              else if (q.candidates.length === 1) sub = 'de pour'
              else if (q.candidates.length === 2) {
                const other = names.get(q.candidates.find((id) => id !== winner.id) ?? '')
                sub = other ? `face à ${other.member.first_name.charAt(0)}. ${other.member.last_name}` : ''
              } else sub = `sur ${q.candidates.length} candidats`
            }
            return (
              <div key={s.role} className="flex items-center gap-3 border-b border-line-soft py-3">
                {winner ? <Avatar person={winner.member} size={46} /> : <EmptyAvatar size={46} />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong className="truncate text-[17px] leading-tight">
                    {winner ? `${winner.member.first_name} ${winner.member.last_name}` : r?.outcome === 'egalite' ? 'Égalité persistante' : 'Poste vacant'}
                  </strong>
                  <span className="truncate text-sm text-muted">{s.label}</span>
                </span>
                {winner ? (
                  <span className="flex flex-col items-end">
                    <strong className="text-[18px] leading-tight">{score}</strong>
                    <span className="text-[13px] text-muted">{sub}</span>
                  </span>
                ) : (
                  <span className="max-w-[45%] text-right text-[13px] text-muted">
                    {!q ? 'Aucun candidat' : r?.outcome === 'egalite' ? 'Le règlement intérieur tranche' : 'Élection partielle à venir'}
                  </span>
                )}
              </div>
            )
          })}
        </section>
      ) : null}
      <p className="m-0 text-[13px] leading-[1.5] text-muted">
        Pourcentages des suffrages exprimés : les votes blancs et les abstentions ne comptent pas (article 13).
        {seats.length ? (a.mandate_start ? ` Prise de poste le ${plainDay(a.mandate_start)}.` : ' Prise de poste dès la passation.') : ''}
      </p>
    </>
  )

  const subtitle = a.published_at ? `Publiés le ${day(a.published_at)} à ${hour(a.published_at)}` : `AG du ${dayYear(a.held_at)}`
  if (desktop) {
    return (
      <div className="flex flex-1 flex-col gap-6 px-10 py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="titre m-0 text-[34px]">Résultats de l’AG du {day(a.held_at).replace(/^\S+ /, '')}</h1>
            <p className="mt-1 mb-0 text-[15px] text-muted">{subtitle}</p>
          </div>
          <PvButton a={a} dark={false} />
        </div>
        <div className="flex max-w-[760px] flex-col gap-5 rounded-[26px] bg-surface p-7">{body}</div>
      </div>
    )
  }
  return (
    <div className="flex flex-1 flex-col">
      <Hero back="/app/menu" title="Résultats de l’AG" subtitle={subtitle} right={<PvButton a={a} dark />} />
      <Sheet className="gap-5">{body}</Sheet>
    </div>
  )
}
