import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Check, Circle, KeyRound } from 'lucide-react'
import { useSession } from '../../auth/session'
import { Button, ButtonLink } from '../../components/Button'
import { ErrorNote, FullScreenLoader } from '../../components/Feedback'
import { PasswordField } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { errorMessage } from '../../lib/errors'
import { passwordChecks, passwordIsValid } from '../../lib/password'
import { supabase } from '../../lib/supabase'

export function NouveauMotDePasse() {
  const { session, loading } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <FullScreenLoader />

  if (!session) {
    return (
      <div className="flex min-h-app flex-col items-center justify-center gap-5 bg-surface px-6 text-center">
        <h1 className="titre m-0 text-[28px]">Ce lien ne marche plus</h1>
        <p className="m-0 max-w-sm text-[15px] leading-[1.5] text-muted">Le lien a expiré ou a déjà servi. Demande-en un nouveau.</p>
        <ButtonLink to="/mot-de-passe-oublie" className="w-full max-w-sm">
          Recevoir un nouveau lien
        </ButtonLink>
      </div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!passwordIsValid(password)) return setError('Il faut au moins 8 caractères, dont un chiffre.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    toast('Ton mot de passe est changé.')
    navigate('/app', { replace: true })
  }

  return (
    <div className="flex min-h-app justify-center bg-page lg:items-center lg:py-10">
      <form onSubmit={submit} noValidate className="flex w-full max-w-[480px] flex-col bg-surface px-5 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)] lg:rounded-[12px] lg:px-10 lg:py-10 lg:shadow-sm">
        <span className="mt-6 grid size-[60px] place-items-center rounded-2xl bg-leppi text-ciel">
          <KeyRound className="size-7" />
        </span>
        <h1 className="titre mt-6 mb-0 text-[30px] leading-tight">Nouveau mot de passe</h1>
        <p className="mt-3 mb-0 text-[16px] leading-[1.5] text-muted">Choisis un mot de passe que tu n'utilises pas ailleurs.</p>
        <PasswordField
          className="mt-7"
          label="Nouveau mot de passe"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {passwordChecks(password).map((c) => (
                <li key={c.label} className={`flex items-center gap-2 text-[13px] ${c.ok ? 'font-semibold text-ok' : 'text-muted'}`}>
                  {c.ok ? <Check className="size-4" strokeWidth={2.5} /> : <Circle className="size-4" />}
                  {c.label}
                </li>
              ))}
            </ul>
          }
        />
        <ErrorNote error={error} className="mt-4" />
        <div className="mt-6">
          <Button type="submit" busy={busy} className="w-full">
            Enregistrer
          </Button>
        </div>
      </form>
    </div>
  )
}
