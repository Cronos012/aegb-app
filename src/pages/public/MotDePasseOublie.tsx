import { useState, type FormEvent } from 'react'
import { useLocation } from 'react-router'
import { KeyRound, MailCheck } from 'lucide-react'
import { Button, ButtonLink } from '../../components/Button'
import { ErrorNote } from '../../components/Feedback'
import { TextField } from '../../components/Field'
import { BackLink } from '../../components/Hero'
import { errorMessage, isEmail } from '../../lib/errors'
import { appUrl, supabase } from '../../lib/supabase'

export function MotDePasseOublie() {
  const location = useLocation()
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!isEmail(email)) return setError("Cette adresse email n'est pas valide.")
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('nouveau-mot-de-passe') })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setSent(true)
  }

  return (
    <div className="flex min-h-dvh justify-center bg-page lg:items-center lg:py-10">
      <div className="flex w-full max-w-[480px] flex-col bg-surface px-5 pt-[max(env(safe-area-inset-top),8px)] pb-[max(env(safe-area-inset-bottom),24px)] lg:rounded-[12px] lg:px-10 lg:py-10 lg:shadow-sm">
        <div className="min-h-11">
          <BackLink to="/connexion" light={false} />
        </div>
        {sent ? (
          <div className="flex flex-1 flex-col">
            <span className="mt-6 grid size-[60px] place-items-center rounded-2xl bg-ok-soft text-ok">
              <MailCheck className="size-7" />
            </span>
            <h1 className="titre mt-6 mb-0 text-[30px] leading-tight">Regarde tes emails</h1>
            <p className="mt-3 mb-0 text-[16px] leading-[1.5] text-muted">
              Si un compte existe pour <strong className="text-ink">{email.trim()}</strong>, tu vas recevoir un lien pour choisir un nouveau mot de passe. Pense aux spams.
            </p>
            <div className="mt-6">
              <ButtonLink to="/connexion" className="w-full">
                Retour à la connexion
              </ButtonLink>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-1 flex-col" noValidate>
            <span className="mt-6 grid size-[60px] place-items-center rounded-2xl bg-leppi text-ciel">
              <KeyRound className="size-7" />
            </span>
            <h1 className="titre mt-6 mb-0 text-[30px] leading-tight">Mot de passe oublié ?</h1>
            <p className="mt-3 mb-0 text-[16px] leading-[1.5] text-muted">Pas de souci. Entre ton email, on t'envoie un lien pour en choisir un nouveau.</p>
            <TextField className="mt-7" label="Adresse email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <ErrorNote error={error} className="mt-4" />
            <div className="mt-6">
              <Button type="submit" busy={busy} className="w-full">
                Envoyer le lien
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
