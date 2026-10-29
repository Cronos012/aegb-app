import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { Check, Circle, Heart, Lock } from 'lucide-react'
import { useSession } from '../../auth/session'
import { Button } from '../../components/Button'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { PasswordField, TextField } from '../../components/Field'
import { StepHeader } from '../../components/Hero'
import { AuthFrame } from '../../layouts/AuthFrame'
import { RULE_ICONS, RULE_TONES } from '../../lib/charter'
import { errorMessage, isEmail } from '../../lib/errors'
import { SIGNUP_TYPES, TYPE_LABELS, type MemberType } from '../../lib/format'
import { passwordChecks, passwordIsValid, passwordLabel, passwordScore } from '../../lib/password'
import { useCharter } from '../../lib/queries'
import { appUrl, supabase } from '../../lib/supabase'

const STORE = 'aegb.inscription'
const TOTAL = 3

type Draft = { email: string; firstName: string; lastName: string; phone: string; type: MemberType }

const EMPTY: Draft = { email: '', firstName: '', lastName: '', phone: '', type: 'etudiant' }

function loadDraft(): Draft {
  try {
    return { ...EMPTY, ...JSON.parse(sessionStorage.getItem(STORE) ?? '{}') }
  } catch {
    return EMPTY
  }
}

const STEPS = [
  { title: 'Crée ton compte', sub: 'Ton email et ton mot de passe te serviront à te connecter.' },
  { title: 'Qui es-tu ?', sub: "Le bureau s'en sert pour valider ton compte." },
  { title: "La charte de l'AEGB", sub: 'Quatre règles simples pour que chacun se sente bien.' },
]


function phoneIsValid(phone: string) {
  return (phone.match(/\d/g) ?? []).length >= 8 && /^[+\d\s().-]+$/.test(phone.trim())
}

export function Inscription() {
  const { session } = useSession()
  const navigate = useNavigate()
  const charter = useCharter()
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(draft))
    } catch {
      /* navigation privée : on garde juste en mémoire */
    }
  }, [draft])

  if (session) return <Navigate to="/app" replace />

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const back = () => (step === 1 ? navigate('/') : setStep(step - 1))

  function next(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (step === 1) {
      if (!isEmail(draft.email)) errs.email = "Cette adresse email n'est pas valide."
      if (!passwordIsValid(password)) errs.password = 'Il faut au moins 8 caractères, dont un chiffre.'
    }
    if (step === 2) {
      if (!draft.firstName.trim()) errs.firstName = 'Indique ton prénom.'
      if (!draft.lastName.trim()) errs.lastName = 'Indique ton nom.'
      if (!phoneIsValid(draft.phone)) errs.phone = 'Indique un numéro de téléphone valide.'
    }
    setErrors(errs)
    if (Object.keys(errs).length) return
    setStep(step + 1)
    window.scrollTo(0, 0)
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!accepted || !charter.data) return
    setBusy(true)
    setSubmitError(null)
    const email = draft.email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: appUrl('auth/retour'),
        data: {
          first_name: draft.firstName.trim(),
          last_name: draft.lastName.trim(),
          phone: draft.phone.trim(),
          member_type: draft.type,
          charter_version: String(charter.data.version),
        },
      },
    })
    setBusy(false)
    if (error) return setSubmitError(errorMessage(error))
    try {
      sessionStorage.removeItem(STORE)
    } catch {
      /* rien */
    }
    if (data.session) navigate('/app', { replace: true })
    else navigate('/verifier-email', { replace: true, state: { email } })
  }

  const { title, sub } = STEPS[step - 1]
  const score = passwordScore(password)

  const progress = (
    <div className="mb-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-muted">
          Étape {step} sur {TOTAL}
        </span>
        {step > 1 ? (
          <button type="button" onClick={back} className="text-[13px] font-semibold text-link underline">
            Étape précédente
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((k) => (
          <div key={k} className={`h-[5px] rounded-full ${k <= step ? 'bg-safran' : 'bg-line-soft'}`} />
        ))}
      </div>
    </div>
  )

  return (
    <AuthFrame
      hero={<StepHeader back={back} step={step} total={TOTAL} title={title} subtitle={sub} />}
      heading={title}
      sub={sub}
      above={progress}
      panelTitle={
        <>
          Bienvenue dans <span className="text-safran">la famille.</span>
        </>
      }
      panelText="Trois étapes, puis le bureau valide ton compte. Tu retrouves ensuite toute la communauté."
      topRight={
        <>
          Déjà membre ? <Link to="/connexion" className="font-bold">Se connecter</Link>
        </>
      }
    >
      {step === 1 ? (
        <form onSubmit={next} className="flex flex-1 flex-col gap-[18px]" noValidate>
          <TextField label="Adresse email" type="email" autoComplete="email" inputMode="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} error={errors.email} />
          <PasswordField
            label="Mot de passe"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint={
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
                    {[1, 2, 3, 4].map((k) => (
                      <div key={k} className={`h-1 rounded-full ${k <= score ? (score >= 3 ? 'bg-gn-vert' : 'bg-safran') : 'bg-line-soft'}`} />
                    ))}
                  </div>
                  <span className={`text-[13px] font-bold ${score >= 3 ? 'text-ok' : 'text-muted'}`}>{passwordLabel(score)}</span>
                </div>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {passwordChecks(password).map((c) => (
                    <li key={c.label} className={`flex items-center gap-2 text-[13px] ${c.ok ? 'font-semibold text-ok' : 'text-muted'}`}>
                      {c.ok ? <Check className="size-4" strokeWidth={2.5} /> : <Circle className="size-4" />}
                      {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            }
          />
          <div className="mt-auto flex flex-col gap-4 pt-4 lg:mt-2">
            <Button type="submit">Continuer</Button>
            <p className="m-0 text-center text-sm text-muted lg:hidden">
              Déjà membre ? <Link to="/connexion" className="font-bold">Se connecter</Link>
            </p>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <form onSubmit={next} className="flex flex-1 flex-col gap-[18px]" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Prénom" autoComplete="given-name" value={draft.firstName} maxLength={60} onChange={(e) => set({ firstName: e.target.value })} error={errors.firstName} />
            <TextField label="Nom" autoComplete="family-name" value={draft.lastName} maxLength={60} onChange={(e) => set({ lastName: e.target.value })} error={errors.lastName} />
          </div>
          <TextField
            label="Téléphone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={draft.phone}
            maxLength={30}
            onChange={(e) => set({ phone: e.target.value })}
            error={errors.phone}
            hint={
              <>
                <Lock className="size-3.5" /> Visible seulement par le bureau.
              </>
            }
          />
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-sm font-bold">Tu es…</legend>
            {SIGNUP_TYPES.map((t) => {
              const selected = draft.type === t.value
              return (
                <label
                  key={t.value}
                  className={`flex cursor-pointer items-center gap-3.5 rounded-2xl border-[1.5px] px-4 py-3 ${selected ? 'border-primary bg-select ring-[3px] ring-safran/35' : 'border-line bg-surface'}`}
                >
                  <input type="radio" name="type" value={t.value} checked={selected} onChange={() => set({ type: t.value })} className="size-5 accent-[#1A2352]" />
                  <span className="flex flex-col">
                    <span className="text-[15px] font-bold">{TYPE_LABELS[t.value]}</span>
                    <span className="text-[13px] text-muted">{t.hint}</span>
                  </span>
                </label>
              )
            })}
          </fieldset>
          <div className="mt-auto pt-4 lg:mt-2">
            <Button type="submit" className="w-full">
              Continuer
            </Button>
          </div>
        </form>
      ) : null}

      {step === 3 ? (
        charter.isPending ? (
          <PageLoader />
        ) : (
          <form onSubmit={create} className="flex flex-1 flex-col gap-4" noValidate>
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {(charter.data?.rules ?? []).map((rule, i) => {
                const Icon = RULE_ICONS[rule.icon] ?? Heart
                return (
                  <li key={rule.title} className="flex items-start gap-3.5">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${RULE_TONES[i % RULE_TONES.length]}`}>
                      <Icon className="size-5" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[15px] font-bold">{rule.title}</span>
                      <span className="text-[14px] leading-[1.4] text-muted">{rule.text}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <Link to="/charte" target="_blank" className="text-sm font-semibold">
              Lire la charte complète
            </Link>
            <div className="mt-auto flex flex-col gap-3 pt-4 lg:mt-3">
              <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-[15px] font-semibold ${accepted ? 'border-primary bg-select' : 'border-line'}`}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="size-5 accent-[#1A2352]" />
                J'ai lu et j'accepte la charte de l'AEGB
              </label>
              <ErrorNote error={submitError ?? charter.error} />
              <Button type="submit" busy={busy} disabled={!accepted}>
                Créer mon compte
              </Button>
            </div>
          </form>
        )
      ) : null}
    </AuthFrame>
  )
}
