import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { BureauGate, MemberGate, ScreenGate } from './auth/gates'
import { useSession } from './auth/session'
import { FullScreenLoader, PageLoader } from './components/Feedback'
import { BureauLayout } from './layouts/BureauLayout'
import { MemberLayout } from './layouts/MemberLayout'
import { useIsDesktop } from './lib/media'
import { Bientot } from './pages/member/Bientot'
import { ModifierProfil } from './pages/member/ModifierProfil'
import { Profil } from './pages/member/Profil'
import { Accueil } from './pages/public/Accueil'
import { AuthRetour } from './pages/public/AuthRetour'
import { Charte } from './pages/public/Charte'
import { Connexion } from './pages/public/Connexion'
import { Inscription } from './pages/public/Inscription'
import { MotDePasseOublie } from './pages/public/MotDePasseOublie'
import { NotFound } from './pages/public/NotFound'
import { NouveauMotDePasse } from './pages/public/NouveauMotDePasse'
import { VerifierEmail } from './pages/public/VerifierEmail'

const Site = lazy(() => import('./pages/public/Site'))
const Dashboard = lazy(() => import('./pages/bureau/Dashboard'))
const Comptes = lazy(() => import('./pages/bureau/Comptes'))
const Membres = lazy(() => import('./pages/bureau/Membres'))
const FicheMembre = lazy(() => import('./pages/bureau/FicheMembre'))
const Postes = lazy(() => import('./pages/bureau/Postes'))
const Journal = lazy(() => import('./pages/bureau/Journal'))

/** Sur téléphone, l'accueil de l'appli ; sur ordinateur, le site de l'association. */
function Home() {
  const { session, loading } = useSession()
  const desktop = useIsDesktop()
  if (loading) return <FullScreenLoader />
  if (session) return <Navigate to="/app" replace />
  return desktop ? <Site /> : <Accueil />
}

export function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/association" element={<Site />} />
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/inscription" element={<Inscription />} />
        <Route path="/verifier-email" element={<VerifierEmail />} />
        <Route path="/auth/retour" element={<AuthRetour />} />
        <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
        <Route path="/nouveau-mot-de-passe" element={<NouveauMotDePasse />} />
        <Route path="/charte" element={<Charte />} />

        <Route element={<MemberGate />}>
          <Route path="/app" element={<MemberLayout />}>
            <Route index element={<Navigate to="/app/fil" replace />} />
            <Route path="fil" element={<Bientot page="fil" />} />
            <Route path="messages" element={<Bientot page="messages" />} />
            <Route path="cotisation" element={<Bientot page="cotisation" />} />
            <Route path="profil" element={<Profil />} />
            <Route path="profil/modifier" element={<ModifierProfil />} />
          </Route>

          <Route element={<BureauGate />}>
            <Route path="/bureau" element={<BureauLayout />}>
              <Route index element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
              <Route element={<ScreenGate screen="comptes" />}>
                <Route path="comptes" element={<Suspense fallback={<PageLoader />}><Comptes /></Suspense>} />
              </Route>
              <Route element={<ScreenGate screen="membres" />}>
                <Route path="membres" element={<Suspense fallback={<PageLoader />}><Membres /></Suspense>} />
                <Route path="membres/:id" element={<Suspense fallback={<PageLoader />}><FicheMembre /></Suspense>} />
              </Route>
              <Route element={<ScreenGate screen="postes" />}>
                <Route path="postes" element={<Suspense fallback={<PageLoader />}><Postes /></Suspense>} />
              </Route>
              <Route element={<ScreenGate screen="journal" />}>
                <Route path="journal" element={<Suspense fallback={<PageLoader />}><Journal /></Suspense>} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
