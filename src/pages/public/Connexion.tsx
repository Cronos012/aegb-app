import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Smartphone } from 'lucide-react'
import { useSession } from '../../auth/session'
import { Button } from '../../components/Button'
import { ErrorNote } from '../../components/Feedback'
import { PasswordField, TextField } from '../../components/Field'
import { Brand } from '../../components/Logo'
import { useToast } from '../../components/Toast'
import { AuthFrame } from '../../layouts/AuthFrame'
import { errorMessage, isEmail } from '../../lib/errors'
import { setRememberMe, supabase } from '../../lib/supabase'

export function Connexion() {
  const { session } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const initialEmail = (location.state as { email?: string } | null)?.email ?? ''
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pendant la connexion, on attend de savoir si le compte était fermé.
  if (session && !busy) return <Navigate to="/app" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isEmail(email)) return setError("Cette adresse email n'est pas valide.")
    if (!password) return setError('Entre ton mot de passe.')
    setBusy(true)
    setRememberMe(remember)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setBusy(false)
      if (error.code === 'email_not_confirmed') {
        navigate('/verifier-email', { state: { email: email.trim() } })
        return
      }
      return setError(errorMessage(error))
    }
    // Se reconnecter avant l'effacement annule la suppression du compte.
    const { data: reopened } = await supabase.rpc('cancel_account_deletion')
    if (reopened) {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      toast('Ton compte est rouvert. Content de te revoir !')
    }
    setBusy(false)
    navigate('/app', { replace: true })
  }

  const forgot = (
    <Link to="/mot-de-passe-oublie" state={{ email }} className="text-[13px] font-semibold">
      Mot de passe oublié ?
    </Link>
  )

  return (
    <AuthFrame
      hero={
        <header className="bg-tisse px-5 pt-[max(env(safe-area-inset-top),20px)] pb-14 text-white">
          <Link to="/" className="text-white no-underline">
            <Brand size={40} />
          </Link>
          <h1 className="titre mt-16 mb-0 text-[40px] leading-[1.04]">
            Content de <span className="text-ciel">te revoir.</span>
          </h1>
          <p className="mt-3 mb-0 text-[15px] text-white/85">Connecte-toi pour retrouver la communauté.</p>
        </header>
      }
      heading="Se connecter"
      sub="Accède à ton espace membre AEGB."
      panelTitle={
        <>
          Content de <span className="text-ciel">te revoir.</span>
        </>
      }
      panelText="Le fil, tes messages et ta cotisation t'attendent."
      topRight={
        <>
          Pas encore membre ? <Link to="/inscription" className="font-bold">Créer mon compte</Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-1 flex-col gap-[18px]" noValidate>
        <TextField label="Adresse email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Mot de passe" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} labelRight={forgot} />
        <label className="hidden items-center gap-2.5 text-sm lg:flex">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-[18px] accent-[#1B4DB1]" />
          Rester connecté sur cet ordinateur
        </label>
        <ErrorNote error={error} />
        <div className="mt-auto flex flex-col gap-4 pt-4 lg:mt-2 lg:pt-0">
          <Button type="submit" busy={busy}>
            Se connecter
          </Button>
          <p className="m-0 text-center text-sm text-muted lg:hidden">
            Pas encore de compte ? <Link to="/inscription" className="font-bold">Créer mon compte</Link>
          </p>
          <div className="hidden items-start gap-2.5 rounded-[14px] bg-surface-2 px-3.5 py-3 text-[13px] leading-[1.45] lg:flex">
            <Smartphone className="mt-px size-4 shrink-0 text-muted" aria-hidden="true" />
            Ton compte marche aussi dans l'appli Android et sur iPhone.
          </div>
        </div>
      </form>
    </AuthFrame>
  )
}
