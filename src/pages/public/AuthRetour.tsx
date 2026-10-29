import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { useSession } from '../../auth/session'
import { ButtonLink } from '../../components/Button'
import { FullScreenLoader } from '../../components/Feedback'
import { Logo } from '../../components/Logo'

/** Page d'arrivée des liens envoyés par email (confirmation de l'adresse). */
export function AuthRetour() {
  const { session, loading, recovery } = useSession()
  const [linkError] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search)
    return params.get('error_description') ?? params.get('error')
  })
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 4000)
    return () => clearTimeout(t)
  }, [])

  if (recovery) return <Navigate to="/nouveau-mot-de-passe" replace />
  if (session) return <Navigate to="/app" replace />
  if (!linkError && (loading || !waited)) return <FullScreenLoader />

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-surface px-6 text-center">
      <Logo size={64} />
      <h1 className="titre m-0 text-[28px]">Ce lien ne marche plus</h1>
      <p className="m-0 max-w-sm text-[15px] leading-[1.5] text-muted">
        Il a peut-être déjà servi, ou il a expiré. Si tu as déjà confirmé ton adresse, connecte-toi simplement.
      </p>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <ButtonLink to="/connexion">Se connecter</ButtonLink>
        <ButtonLink to="/inscription" variant="outline">
          Créer un compte
        </ButtonLink>
      </div>
    </div>
  )
}
