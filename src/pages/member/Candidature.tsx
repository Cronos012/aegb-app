import { useId, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { Check, Clock, Send } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { Hero, Sheet } from '../../components/Hero'
import { useToast } from '../../components/Toast'
import { day, personLine, useAssembly, useCandidacyActions, type Assembly } from '../../lib/elections'
import { errorMessage } from '../../lib/errors'
import { useIsDesktop } from '../../lib/media'
import { useMe } from '../../lib/queries'

/* ----------------------------------------------------------------------------
   « Je me présente » : le poste, la présentation lue dans l'isoloir, et les
   conditions de l'article 15.
---------------------------------------------------------------------------- */

const MAX = 500

export function Candidature() {
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
  const open = !!a && a.status === 'convoquee' && a.seats.length > 0 && !!a.candidacy_until && new Date(a.candidacy_until) > new Date(a.now)
  const active = a?.my.candidacy?.status === 'deposee' || a?.my.candidacy?.status === 'validee'
  if (!a || !open || active || !a.my.can_run) return <Navigate to="/app/votes" replace />
  return <Form a={a} />
}

function Form({ a }: { a: Assembly }) {
  const desktop = useIsDesktop()
  const me = useMe().data
  const navigate = useNavigate()
  const toast = useToast()
  const { submit } = useCandidacyActions()
  const [role, setRole] = useState<string | null>(a.seats.length === 1 ? a.seats[0].role : null)
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const textId = useId()
  const seatsId = useId()

  const missing = !role ? 'Choisis le poste.' : !text.trim() ? 'Écris quelques lignes pour te présenter.' : null
  const send = () => {
    setTried(true)
    if (missing || !role) return
    submit.mutate(
      { assembly: a.id, role, statement: text.trim() },
      {
        onSuccess: () => {
          toast('Candidature envoyée : le bureau la vérifie')
          navigate('/app/votes')
        },
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    )
  }

  const subtitle = `Élection du bureau ${a.mandate_year} · jusqu’au ${day(a.candidacy_until!)}`
  const form = (
    <>
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend id={seatsId} className="mb-2.5 p-0 text-[16px] font-bold">
          Le poste
        </legend>
        <div role="radiogroup" aria-labelledby={seatsId} className={`grid gap-3 ${desktop ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {a.seats.map((s) => {
            const n = s.candidates.length
            const selected = role === s.role
            return (
              <button
                key={s.role}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRole(s.role)}
                className={`flex flex-col items-start rounded-[18px] px-3.5 py-3 text-left transition-colors ${
                  selected ? 'border-2 border-leppi bg-select ring-4 ring-safran/45' : 'border-[1.5px] border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <span className="text-[16px] leading-tight font-extrabold">{s.label}</span>
                <span className="text-sm text-muted">{n ? `${n} candidat${n > 1 ? 's' : ''}` : 'Aucun candidat'}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={textId} className="text-[16px] font-bold">
            Ta présentation
          </label>
          <span className="text-sm text-muted">Lue dans l’isoloir</span>
        </div>
        <div className="flex flex-col gap-2.5 rounded-[20px] border-[1.5px] border-line bg-surface p-4 transition-colors focus-within:border-leppi focus-within:ring-4 focus-within:ring-safran/45">
          {me ? (
            <span className="flex min-w-0 items-center gap-3">
              <Avatar person={me.profile} size={40} />
              <span className="flex min-w-0 flex-col">
                <strong className="text-[16px] leading-tight">
                  {me.profile.first_name} {me.profile.last_name}
                </strong>
                {personLine(me.profile) ? <span className="truncate text-[13px] text-muted">{personLine(me.profile)}</span> : null}
              </span>
            </span>
          ) : null}
          <textarea
            id={textId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX}
            rows={desktop ? 5 : 4}
            placeholder="Pourquoi toi, et ce que tu veux faire pendant le mandat."
            className="min-h-[96px] w-full resize-y border-0 bg-transparent p-0 text-[16px] leading-[1.5] outline-none placeholder:text-muted"
          />
          <span className="self-end text-[13px] text-muted tabular-nums" aria-live="polite">
            {text.length} / {MAX}
          </span>
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-[22px] bg-surface-2 p-4">
        <h2 className="m-0 text-[16px] font-bold text-ink/85">Les conditions (article 15)</h2>
        <Condition done title="Statut étudiant, compte validé" detail="Vérifié par l’appli" />
        <Condition done title="Cotisation à jour" detail="Vérifié par l’appli" />
        <Condition done={false} title="Trois absences non justifiées au plus" detail="Au mandat précédent, le bureau le vérifie" />
      </section>

      <div className="flex flex-col gap-2">
        {tried && missing ? (
          <p className="m-0 text-center text-sm font-semibold text-danger" role="alert">
            {missing}
          </p>
        ) : null}
        <Button icon={<Send className="size-5" />} busy={submit.isPending} onClick={send}>
          Envoyer ma candidature
        </Button>
        <p className="m-0 text-center text-sm text-muted">Tu pourras la retirer jusqu’à l’ouverture du vote.</p>
      </div>
    </>
  )

  if (desktop) {
    return (
      <div className="flex flex-1 flex-col gap-6 px-10 py-8">
        <div>
          <h1 className="titre m-0 text-[34px]">Je me présente</h1>
          <p className="mt-1 mb-0 text-[15px] text-muted">{subtitle}</p>
        </div>
        <div className="flex max-w-[760px] flex-col gap-6 rounded-[26px] bg-surface p-7">{form}</div>
      </div>
    )
  }
  return (
    <div className="flex flex-1 flex-col">
      <Hero back="/app/votes" title="Je me présente" subtitle={subtitle} />
      <Sheet className="gap-6">{form}</Sheet>
    </div>
  )
}

function Condition({ done, title, detail }: { done: boolean; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${done ? 'bg-ok-soft text-ok' : 'bg-safran-pale text-[#6B4A00]'}`}>
        {done ? <Check className="size-[18px]" strokeWidth={2.8} /> : <Clock className="size-[18px]" />}
      </span>
      <span className="flex min-w-0 flex-col">
        <strong className="text-[16px] leading-snug">{title}</strong>
        <span className="text-sm text-muted">{detail}</span>
      </span>
    </div>
  )
}
