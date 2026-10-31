import { useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Check, ChevronLeft, ChevronRight, FileText, Info, ListOrdered, Lock, Vote, X } from 'lucide-react'
import { Button, ButtonLink } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { AgendaList, CandidateHead, ChoiceCard, ForAgainst, Participation, StatementDialog } from '../../components/elections/Parts'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { Pill, type Tone } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { candidacyMap, choiceLabel, currentBallot, dayMonth, hour, useAssembly, useCastVote, type Assembly, type Ballot, type Candidacy, type Question } from '../../lib/elections'
import { errorMessage } from '../../lib/errors'
import { useIsDesktop } from '../../lib/media'

/* ----------------------------------------------------------------------------
   L'isoloir : une question par étape, la vérification du bulletin, puis le
   dépôt en une fois. Les choix restent dans le téléphone jusqu'au dépôt.
---------------------------------------------------------------------------- */

export function Isoloir() {
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
  const b = a ? currentBallot(a) : null
  if (!a || !b) return <Navigate to="/app/votes" replace />
  if (b.voted_at) return <AVote b={b} />
  if (b.status !== 'ouvert' || a.my.right !== 'actif') return <Navigate to="/app/votes" replace />
  return <Booth a={a} b={b} />
}

/** « Suivant : Présidence », ou « Suivant » quand le titre est trop long pour le bouton. */
function nextLabel(q: Question | undefined): string {
  if (!q) return 'Vérifier mon bulletin'
  return q.title.length <= 16 ? `Suivant : ${q.title}` : 'Suivant'
}

function choiceTone(q: Question, choice: string | undefined): Tone {
  if (choice === 'pour') return 'ok'
  if (choice === 'contre') return 'danger'
  if (!choice || choice === 'abstention' || choice === 'blanc') return 'neutral'
  return q.kind === 'poste' ? 'brand' : 'neutral'
}

/** Le choix en un mot pour la colonne du bulletin sur ordinateur. */
function shortChoice(q: Question, choice: string | undefined, names: Map<string, Candidacy>): string {
  if (!choice) return ''
  if (q.kind === 'poste' && q.candidates.length > 1 && choice !== 'blanc') {
    const c = names.get(choice)
    return c ? `${c.member.first_name.charAt(0)}. ${c.member.last_name}` : ''
  }
  return { pour: 'Pour', contre: 'Contre', abstention: 'Abstention', blanc: 'Blanc' }[choice] ?? ''
}

function Booth({ a, b }: { a: Assembly; b: Ballot }) {
  const desktop = useIsDesktop()
  const navigate = useNavigate()
  const toast = useToast()
  const cast = useCastVote()
  const questions = useMemo(() => [...b.questions].sort((x, y) => x.position - y.position), [b.questions])
  const names = useMemo(() => candidacyMap(a), [a])
  const labels = useMemo(() => new Map(a.seats.map((s) => [s.role, s.label])), [a.seats])
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [step, setStep] = useState(0)
  const [fromReview, setFromReview] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [agenda, setAgenda] = useState(false)
  const [reading, setReading] = useState<Candidacy | null>(null)
  const [sent, setSent] = useState(false)

  const n = questions.length
  const review = step >= n
  const q = review ? null : questions[step]
  const answered = questions.filter((x) => choices[x.id]).length

  if (sent) return <AVote b={{ ...b, voters: b.voters + 1 }} />

  const go = (to: number) => {
    setStep(to)
    window.scrollTo(0, 0)
  }
  const next = () => {
    if (fromReview) {
      setFromReview(false)
      go(n)
    } else go(step + 1)
  }
  const change = (i: number) => {
    setFromReview(true)
    go(i)
  }
  const leave = () => (answered ? setLeaving(true) : navigate('/app/votes'))
  const deposit = () =>
    cast.mutateAsync({ ballot: b.id, choices }).then(
      () => {
        setConfirm(false)
        setSent(true)
        window.scrollTo(0, 0)
      },
      (e) => {
        setConfirm(false)
        toast(errorMessage(e), 'error')
      },
    )

  const kicker = (x: Question, i: number) => {
    if (x.kind === 'resolution') {
      const res = questions.filter((y) => y.kind === 'resolution')
      return `Résolution ${res.indexOf(x) + 1} sur ${res.length}`
    }
    const base = b.round === 2 ? 'Second tour · élection du bureau' : 'Élection du bureau'
    return desktop ? `Étape ${i + 1} sur ${n} · ${base}` : base
  }

  const content = q ? (
    <QuestionView
      a={a}
      b={b}
      q={q}
      kicker={kicker(q, step)}
      names={names}
      value={choices[q.id]}
      onChange={(v) => setChoices((c) => ({ ...c, [q.id]: v }))}
      onRead={setReading}
      desktop={desktop}
    />
  ) : (
    <Review questions={questions} choices={choices} names={names} round={b.round} onChange={change} desktop={desktop} />
  )

  const secret = review ? 'Ton bulletin part sans ton nom. Seul « a voté » est noté.' : 'Personne ne saura ce que tu choisis, pas même le bureau.'
  const buttons = review ? (
    <Button variant="accent" className="flex-1" icon={<Vote className="size-5" />} disabled={answered < n} onClick={() => setConfirm(true)}>
      Je dépose mon bulletin
    </Button>
  ) : (
    <>
      {step > 0 && !fromReview ? (
        <Button variant="outline" className={desktop ? '' : 'w-[104px]'} size={desktop ? 'md' : 'lg'} icon={<ChevronLeft className="size-5" />} onClick={() => go(step - 1)} aria-label="Précédent">
          {desktop ? 'Précédent' : null}
        </Button>
      ) : null}
      <Button className={desktop ? '' : 'min-w-0 flex-1'} size={desktop ? 'md' : 'lg'} disabled={!q || !choices[q.id]} onClick={next}>
        <span className="truncate">{fromReview ? 'Revenir à mon bulletin' : nextLabel(questions[step + 1])}</span>
        <ChevronRight className="size-5 shrink-0" />
      </Button>
    </>
  )

  const dialogs = (
    <>
      <StatementDialog c={reading} label={reading ? labels.get(reading.role) : undefined} onClose={() => setReading(null)} />
      <Dialog open={agenda} onClose={() => setAgenda(false)} title="Ordre du jour" description="Seuls ces points peuvent être votés (article 12).">
        <AgendaList a={a} />
      </Dialog>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Déposer ton bulletin ?" description="Une fois déposé, il ne peut plus être changé, comme un bulletin glissé dans l’urne.">
        <div className="flex flex-col gap-3 pb-2">
          <Button busy={cast.isPending} icon={<Check className="size-5" strokeWidth={2.6} />} onClick={deposit}>
            Déposer mon bulletin
          </Button>
          <Button variant="outline" onClick={() => setConfirm(false)}>
            Revenir à mes choix
          </Button>
        </div>
      </Dialog>
      <Dialog open={leaving} onClose={() => setLeaving(false)} title="Quitter l’isoloir ?" description="Ton bulletin n’est pas déposé. Tes choix ne sont pas gardés : tu recommenceras depuis le début.">
        <div className="flex flex-col gap-3 pb-2">
          <Button variant="outline" onClick={() => setLeaving(false)}>
            Continuer à voter
          </Button>
          <Button variant="danger-outline" onClick={() => navigate('/app/votes')}>
            Quitter sans voter
          </Button>
        </div>
      </Dialog>
    </>
  )

  if (desktop) {
    return (
      <div className="flex flex-1 flex-col gap-6 px-10 py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="titre m-0 text-[34px]">
              {b.round === 2 ? 'Second tour' : 'Assemblée générale'} du {dayMonth(a.held_at)}
            </h1>
            <p className="mt-1 mb-0 text-[15px] text-muted">Le vote est ouvert jusqu’à {hour(b.closes_at)}. Ton bulletin est déposé en une fois, à la fin.</p>
          </div>
          <div className="flex gap-2.5">
            <Button variant="outline" size="md" icon={<ListOrdered className="size-[18px]" />} onClick={() => setAgenda(true)}>
              Ordre du jour
            </Button>
            <Button variant="outline" size="md" icon={<X className="size-[18px]" />} onClick={leave}>
              Quitter l’isoloir
            </Button>
          </div>
        </div>
        <div className="grid max-w-[1120px] grid-cols-[300px_minmax(0,1fr)] items-start gap-5">
          <aside className="sticky top-8 flex flex-col gap-3 rounded-[12px] bg-surface p-4">
            <div className="px-1">
              <h2 className="m-0 text-[17px] font-extrabold">Ton bulletin</h2>
              <p className="m-0 text-[13px] text-muted">
                {answered} choix sur {n}
              </p>
            </div>
            <BallotNav questions={questions} choices={choices} names={names} step={step} round={b.round} onGo={(i) => go(i)} />
            <div className="mt-2 border-t border-line-soft px-1 pt-3">
              <Participation ballot={b} compact />
            </div>
          </aside>
          <section className="flex flex-col gap-5 rounded-[12px] bg-surface p-7">
            {content}
            <div className="flex items-center gap-3 border-t border-line-soft pt-4">
              <p className="m-0 flex flex-1 items-center gap-2 text-[13px] text-muted">
                <Lock className="size-4 shrink-0" /> {secret}
              </p>
              {buttons}
            </div>
          </section>
        </div>
        {dialogs}
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-line-soft bg-surface px-3 pt-[env(safe-area-inset-top)]">
        <div className="flex min-h-[62px] items-center gap-1.5">
          {review ? (
            <button type="button" onClick={() => go(n - 1)} aria-label="Revenir à la dernière question" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-surface-2">
              <ChevronLeft className="size-6" strokeWidth={2.2} />
            </button>
          ) : (
            <button type="button" onClick={leave} aria-label="Quitter l’isoloir" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-surface-2">
              <X className="size-6" strokeWidth={2.2} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="titre m-0 truncate text-[20px] leading-tight">{review ? 'Vérifier mon bulletin' : 'Isoloir'}</h1>
            <p className="m-0 text-[13px] font-semibold text-muted">{review ? `${answered} choix sur ${n}` : `Étape ${step + 1} sur ${n}`}</p>
          </div>
          {review ? null : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-select px-3 py-1.5 text-sm font-bold">
              <Lock className="size-4" /> Vote secret
            </span>
          )}
        </div>
        {review ? null : (
          <div className="grid gap-1.5 px-2 pb-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden="true">
            {questions.map((x, k) => (
              <div key={x.id} className={`h-[5px] rounded-full ${k === step ? 'bg-safran' : choices[x.id] ? 'bg-leppi' : 'bg-line-soft'}`} />
            ))}
          </div>
        )}
      </header>
      <div className="flex flex-1 flex-col gap-4 px-4 pt-6 pb-6">{content}</div>
      <footer className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-line-soft bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        <p className="m-0 flex items-center justify-center gap-2 text-[13px] text-muted">
          <Lock className="size-4 shrink-0" /> {secret}
        </p>
        <div className="flex gap-3">{buttons}</div>
      </footer>
      {dialogs}
    </div>
  )
}

/* ----------------------------------------------------------------------------
   Une question : résolution ou poste du bureau.
---------------------------------------------------------------------------- */

function QuestionView({
  a,
  b,
  q,
  kicker,
  names,
  value,
  onChange,
  onRead,
  desktop,
}: {
  a: Assembly
  b: Ballot
  q: Question
  kicker: string
  names: Map<string, Candidacy>
  value: string | undefined
  onChange: (v: string) => void
  onRead: (c: Candidacy) => void
  desktop: boolean
}) {
  const head = (subtitle?: string) => (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-extrabold tracking-[0.08em] text-muted uppercase">{kicker}</span>
      <h2 className="titre m-0 text-[30px] leading-[1.1]">{q.title}</h2>
      {subtitle ? <p className="m-0 text-[15px] text-muted">{subtitle}</p> : null}
    </div>
  )

  if (q.kind === 'resolution') {
    return (
      <>
        {head()}
        {q.detail ? (
          <div className="flex flex-col gap-2.5 rounded-[12px] bg-surface-2 p-4">
            <p className="m-0 text-[16px] leading-[1.55] whitespace-pre-line">{q.detail}</p>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-muted">
              <FileText className="size-4" /> Proposée par le bureau, inscrite à l’ordre du jour
            </span>
          </div>
        ) : null}
        <ForAgainst name={q.id} value={value} onChange={onChange} single={false} />
        <p className="m-0 flex items-start gap-2 text-sm leading-[1.45] text-muted">
          <Info className="mt-0.5 size-4 shrink-0" />
          {a.kind === 'extraordinaire'
            ? 'Adoptée avec au moins les deux tiers des suffrages exprimés. Les abstentions ne comptent pas (article 14).'
            : 'Adoptée si les « pour » dépassent les « contre ». Les abstentions ne comptent pas dans les suffrages exprimés (article 13).'}
        </p>
      </>
    )
  }

  const candidates = q.candidates.map((id) => names.get(id)).filter((c): c is Candidacy => !!c)
  const readLink = (c: Candidacy) => (
    <button type="button" onClick={() => onRead(c)} className="text-[15px] font-bold text-ink underline underline-offset-4">
      Lire sa présentation
    </button>
  )
  const quote = (c: Candidacy, full: boolean) => <span className={`text-[15px] leading-[1.5] text-ink/85 ${full ? 'whitespace-pre-line' : 'line-clamp-2'}`}>{full ? c.statement : `« ${c.statement} »`}</span>

  if (candidates.length === 1) {
    const c = candidates[0]
    return (
      <>
        {head('Une seule candidature : pour, contre, ou vote blanc.')}
        <div className="flex flex-col gap-2.5 rounded-[12px] bg-surface-2 p-4">
          <CandidateHead c={c} size={48} />
          {quote(c, desktop)}
          {desktop ? null : <span>{readLink(c)}</span>}
        </div>
        <ForAgainst name={q.id} value={value} onChange={onChange} single />
      </>
    )
  }

  return (
    <>
      {head(b.round === 2 ? 'Second tour entre les candidats à égalité. Choisis une personne, ou vote blanc.' : 'Choisis une personne, ou vote blanc.')}
      <div className={desktop ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
        {candidates.map((c) => (
          <ChoiceCard key={c.id} name={q.id} selected={value === c.id} onSelect={() => onChange(c.id)} after={desktop ? undefined : readLink(c)}>
            <CandidateHead c={c} />
            <span className="mt-1.5">{quote(c, desktop)}</span>
          </ChoiceCard>
        ))}
      </div>
      <ChoiceCard name={q.id} dashed selected={value === 'blanc'} onSelect={() => onChange('blanc')}>
        <span className="text-[18px] font-extrabold">Je vote blanc</span>
        <span className="text-sm text-muted">Ton vote compte dans la participation, pas dans les suffrages exprimés{desktop ? ' (article 13)' : ''}.</span>
      </ChoiceCard>
    </>
  )
}

/* ----------------------------------------------------------------------------
   La vérification du bulletin, et la colonne « Ton bulletin » sur ordinateur.
---------------------------------------------------------------------------- */

function groups(questions: Question[], round: number): { title: string; items: { q: Question; i: number }[] }[] {
  const indexed = questions.map((q, i) => ({ q, i }))
  const res = indexed.filter((x) => x.q.kind === 'resolution')
  const seats = indexed.filter((x) => x.q.kind === 'poste')
  return [
    { title: 'Résolutions', items: res },
    { title: round === 2 ? 'Second tour' : 'Élection du bureau', items: seats },
  ].filter((g) => g.items.length)
}

function Review({
  questions,
  choices,
  names,
  round,
  onChange,
  desktop,
}: {
  questions: Question[]
  choices: Record<string, string>
  names: Map<string, Candidacy>
  round: number
  onChange: (i: number) => void
  desktop: boolean
}) {
  return (
    <>
      {desktop ? (
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-extrabold tracking-[0.08em] text-muted uppercase">Dernière étape</span>
          <h2 className="titre m-0 text-[30px] leading-[1.1]">Vérifier mon bulletin</h2>
        </div>
      ) : null}
      <p className="m-0 text-[16px] leading-[1.5] text-ink/85">Relis tes choix. Tu peux encore les changer, jusqu’au moment où tu déposes ton bulletin.</p>
      {groups(questions, round).map((g) => (
        <section key={g.title} className="flex flex-col">
          <h3 className="m-0 border-b border-line-soft pb-2 text-[13px] font-extrabold tracking-[0.08em] text-muted uppercase">{g.title}</h3>
          {g.items.map(({ q, i }) => {
            const choice = choices[q.id]
            return (
              <div key={q.id} className="flex items-center gap-3 border-b border-line-soft py-3">
                <span className="min-w-0 flex-1 text-[16px] leading-snug font-semibold">{q.title}</span>
                {choice ? (
                  <Pill tone={choiceTone(q, choice)} className="max-w-[55%] truncate">
                    {choiceLabel(q, choice, names)}
                  </Pill>
                ) : (
                  <Pill tone="warn">À remplir</Pill>
                )}
                <button type="button" onClick={() => onChange(i)} className="shrink-0 text-[15px] font-bold text-ink underline-offset-4 hover:underline">
                  Changer
                </button>
              </div>
            )
          })}
        </section>
      ))}
    </>
  )
}

function BallotNav({
  questions,
  choices,
  names,
  step,
  round,
  onGo,
}: {
  questions: Question[]
  choices: Record<string, string>
  names: Map<string, Candidacy>
  step: number
  round: number
  onGo: (i: number) => void
}) {
  return (
    <nav aria-label="Ton bulletin" className="flex flex-col gap-2">
      {groups(questions, round).map((g) => (
        <div key={g.title} className="flex flex-col">
          <h3 className="m-0 px-2 pt-1 pb-1.5 text-[11px] font-extrabold tracking-[0.08em] text-muted uppercase">{g.title}</h3>
          {g.items.map(({ q, i }) => {
            const choice = choices[q.id]
            const current = i === step
            let mark: ReactNode
            if (current)
              mark = (
                <span className="grid size-[22px] place-items-center rounded-full border-2 border-leppi">
                  <span className="size-2.5 rounded-full bg-leppi" />
                </span>
              )
            else if (choice)
              mark = (
                <span className="grid size-[22px] place-items-center rounded-full bg-ok text-white">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )
            else mark = <span className="block size-[22px] rounded-full border-2 border-line" />
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => onGo(i)}
                aria-current={current ? 'step' : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-2 py-2 text-left ${current ? 'bg-safran-pale/70' : 'hover:bg-surface-2'}`}
              >
                <span className="shrink-0">{mark}</span>
                <span className={`min-w-0 flex-1 truncate text-[14px] ${current || choice ? 'font-bold text-ink' : 'font-semibold text-muted'}`}>{q.title}</span>
                <span className={`shrink-0 text-xs font-bold ${current ? 'text-[#163F93]' : 'text-muted'}`}>{current ? 'En cours' : shortChoice(q, choice, names)}</span>
              </button>
            )
          })}
        </div>
      ))}
      {step >= questions.length ? null : (
        <button
          type="button"
          onClick={() => onGo(questions.length)}
          disabled={questions.some((q) => !choices[q.id])}
          className="mt-1 rounded-xl px-2 py-2 text-left text-[14px] font-bold text-ink underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
        >
          Vérifier mon bulletin
        </button>
      )}
    </nav>
  )
}

/* ----------------------------------------------------------------------------
   A voté !
---------------------------------------------------------------------------- */

function AVote({ b }: { b: Ballot }) {
  const desktop = useIsDesktop()
  const body = (
    <>
      <div className="relative mx-auto grid size-[132px] place-items-center rounded-full bg-white ring-[12px] ring-white/15">
        <Vote className="size-14 text-leppi" strokeWidth={2} />
        <span className="absolute right-[-6px] bottom-1 grid size-12 place-items-center rounded-[15px] border-4 border-leppi bg-ok text-white">
          <Check className="size-6" strokeWidth={3} />
        </span>
      </div>
      <h1 className="titre m-0 text-center text-[46px] leading-none">A voté !</h1>
      <p className="m-0 text-center text-[17px] leading-[1.5] text-white/88">Ton bulletin est dans l’urne. Personne ne peut savoir ce que tu as choisi.</p>
      <div className="rounded-[12px] bg-white/10 px-4 py-3.5">
        <Participation ballot={b} dark />
      </div>
      <p className="m-0 text-center text-[15px] leading-[1.5] text-white/80">
        {b.status === 'ouvert' ? `Le vote ferme à ${hour(b.closes_at)}. ` : 'Le vote est fermé. '}Les résultats arrivent dans le fil dès que le bureau les publie.
      </p>
    </>
  )
  const actions = (
    <div className="flex flex-col gap-3">
      <ButtonLink to="/app/fil" variant="onblue">
        Retour au fil
      </ButtonLink>
      <ButtonLink to="/app/votes" variant="light">
        Voir l’assemblée générale
      </ButtonLink>
    </div>
  )
  if (desktop) {
    return (
      <div className="flex flex-1 items-center justify-center px-10 py-8">
        <div className="bg-tisse flex w-full max-w-[560px] flex-col gap-6 rounded-[12px] p-10 text-white">
          {body}
          {actions}
        </div>
      </div>
    )
  }
  return (
    <div className="bg-tisse flex min-h-dvh flex-1 flex-col px-5 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),20px)] text-white">
      <div className="flex flex-1 flex-col justify-center gap-6 py-8">{body}</div>
      {actions}
    </div>
  )
}
