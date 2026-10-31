import { Navigate, Outlet, useLocation } from 'react-router'
import { Button } from '../components/Button'
import { ErrorNote, FullScreenLoader } from '../components/Feedback'
import { AccepterCharte } from '../pages/member/AccepterCharte'
import { Attente } from '../pages/member/Attente'
import { Bienvenue } from '../pages/member/Bienvenue'
import { StatutCompte } from '../pages/member/StatutCompte'
import { CompteFermeGate } from '../pages/public/CompteFerme'
import { MemberServices } from '../layouts/MemberServices'
import { can, isBureau, useCharter, useMe, type ScreenCode } from '../lib/queries'
import { signOut, useSession } from './session'

/**
 * Entrée de l'appli : il faut être connecté, puis le statut du compte décide
 * de l'écran. Seul un membre validé passe.
 */
export function MemberGate() {
  const { session, loading } = useSession()
  const location = useLocation()
  const me = useMe()
  const charter = useCharter()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
  if (me.isPending) return <FullScreenLoader />
  if (me.isError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
        <ErrorNote error={me.error} className="w-full max-w-sm" />
        <Button variant="outline" onClick={() => me.refetch()} className="w-full max-w-sm">
          Réessayer
        </Button>
        <Button variant="ghost" onClick={signOut} className="w-full max-w-sm">
          Se déconnecter
        </Button>
      </div>
    )
  }

  const data = me.data
  const p = data.profile
  if (p.deletion_requested_at) return <CompteFermeGate me={data} />
  if (p.status === 'en_attente') return <Attente me={data} />
  if (p.status === 'refuse' || p.status === 'suspendu') return <StatutCompte me={data} />
  if (charter.data && (p.charter_version ?? 0) < charter.data.version) return <AccepterCharte charter={charter.data} />
  if (!p.welcomed_at) return <Bienvenue me={data} />
  return (
    <MemberServices>
      <Outlet />
    </MemberServices>
  )
}

/** Le mode bureau n'existe que pour les membres qui ont un poste. */
export function BureauGate() {
  const me = useMe().data
  if (!isBureau(me)) return <Navigate to="/app/profil" replace />
  return <Outlet />
}

/** Chaque écran du bureau n'est ouvert qu'aux postes qui y ont droit. */
export function ScreenGate({ screen }: { screen: ScreenCode }) {
  const me = useMe().data
  if (!can(me, screen, 'lecture')) return <Navigate to="/bureau" replace />
  return <Outlet />
}
