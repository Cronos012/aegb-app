import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Mail, Send } from 'lucide-react'
import { useSession } from '../../auth/session'
import { Button } from '../../components/Button'
import { ErrorNote, Note } from '../../components/Feedback'
import { errorMessage } from '../../lib/errors'
import { appUrl, supabase } from '../../lib/supabase'

const COOLDOWN_S = 60

export function VerifierEmail() {
  const { session } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const email = (location.state as { email?: string } | null)?.email ?? ''
  const [wait, setWait] = useState(COOLDOWN_S)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  if (session) return <Navigate to="/app" replace />
  if (!email) return <Navigate to="/connexion" replace />

  async function resend() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl('auth/retour') } })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setSent(true)
    setWait(COOLDOWN_S)
  }

  return (
    <div className="flex min-h-app flex-col items-center bg-surface px-5 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="flex w-full max-w-[440px] flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center">
          <div className="bg-anneau relative rounded-full p-[6px]">
            <div className="rounded-full bg-surface p-[6px]">
              <div className="grid size-[120px] place-items-center rounded-full bg-leppi text-white">
                <Mail className="size-12" strokeWidth={1.8} />
              </div>
            </div>
            <span className="absolute top-2 -right-1 grid size-10 place-items-center rounded-full border-4 border-surface bg-safran text-white">
              <Send className="size-4" />
            </span>
          </div>
          <h1 className="titre m-0 text-[30px]">Vérifie ta boîte mail</h1>
          <p className="m-0 text-[16px] leading-[1.5] text-muted">
            On a envoyé un lien à <strong className="text-ink">{email}</strong>. Clique dessus pour confirmer ton adresse.
          </p>
          <Note className="w-full text-left">Rien reçu ? Regarde dans les spams ou l'onglet Promotions.</Note>
          {sent ? <p className="m-0 text-sm font-semibold text-ok">Un nouvel email est parti.</p> : null}
          <ErrorNote error={error} className="w-full text-left" />
        </div>
        <div className="flex flex-col gap-3">
          <Button onClick={() => navigate('/connexion', { state: { email } })}>J'ai confirmé mon email</Button>
          <Button variant="outline" onClick={resend} busy={busy} disabled={wait > 0}>
            {wait > 0 ? `Renvoyer l'email (${wait} s)` : "Renvoyer l'email"}
          </Button>
          <p className="m-0 mt-1 text-center text-sm text-muted">
            Mauvaise adresse ? <Link to="/inscription" className="font-bold">La modifier</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
