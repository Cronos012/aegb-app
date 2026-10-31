import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { BureauGate, MemberGate, ScreenGate } from './auth/gates'
import { useSession } from './auth/session'
import { FullScreenLoader, PageLoader } from './components/Feedback'
import { BureauLayout } from './layouts/BureauLayout'
import { MemberLayout } from './layouts/MemberLayout'
import { useIsDesktop } from './lib/media'
import { Annuaire } from './pages/member/Annuaire'
import { Candidature } from './pages/member/Candidature'
import { Conversation } from './pages/member/Conversation'
import { Cotisation } from './pages/member/Cotisation'
import { Document } from './pages/member/Document'
import { Documents } from './pages/member/Documents'
import { Evenement } from './pages/member/Evenement'
import { EvenementPaiement } from './pages/member/EvenementPaiement'
import { Evenements } from './pages/member/Evenements'
import { Fil } from './pages/member/Fil'
import { Historique } from './pages/member/Historique'
import { InfosGroupe } from './pages/member/InfosGroupe'
import { Isoloir } from './pages/member/Isoloir'
import { MembreProfil } from './pages/member/MembreProfil'
import { Menu } from './pages/member/Menu'
import { Messages } from './pages/member/Messages'
import { ModifierProfil } from './pages/member/ModifierProfil'
import { NouveauMessage } from './pages/member/NouveauMessage'
import { Participants } from './pages/member/Participants'
import { PaiementRetour } from './pages/member/PaiementRetour'
import { Payer } from './pages/member/Payer'
import { Profil } from './pages/member/Profil'
import { Publication } from './pages/member/Publication'
import { Publier } from './pages/member/Publier'
import { Quittance } from './pages/member/Quittance'
import { Recherche } from './pages/member/Recherche'
import { Votes } from './pages/member/Votes'
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
const Annonces = lazy(() => import('./pages/bureau/Annonces'))
const Moderation = lazy(() => import('./pages/bureau/Moderation'))
const CompteAegb = lazy(() => import('./pages/bureau/CompteAegb'))
const Cotisations = lazy(() => import('./pages/bureau/Cotisations'))
const Encaisser = lazy(() => import('./pages/bureau/Encaisser'))
const ReglagesCotisation = lazy(() => import('./pages/bureau/ReglagesCotisation'))
const JournalFinancier = lazy(() => import('./pages/bureau/JournalFinancier'))
const Elections = lazy(() => import('./pages/bureau/Elections'))
const EvenementsBureau = lazy(() => import('./pages/bureau/Evenements'))
const EvenementForm = lazy(() => import('./pages/bureau/EvenementForm'))
const Pointage = lazy(() => import('./pages/bureau/Pointage'))
const DocumentsBureau = lazy(() => import('./pages/bureau/Documents'))

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
            <Route path="fil" element={<Fil />} />
            <Route path="fil/:id" element={<Publication />} />
            <Route path="publier" element={<Publier />} />
            <Route path="recherche" element={<Recherche />} />
            <Route path="menu" element={<Menu />} />
            <Route path="membres" element={<Annuaire />} />
            <Route path="membres/:id" element={<MembreProfil />} />
            <Route path="messages" element={<Messages />}>
              <Route path="nouveau" element={<NouveauMessage />} />
              <Route path=":id" element={<Conversation />} />
              <Route path=":id/infos" element={<InfosGroupe />} />
            </Route>
            <Route path="cotisation" element={<Cotisation />} />
            <Route path="cotisation/payer" element={<Payer />} />
            <Route path="cotisation/retour/:id" element={<PaiementRetour />} />
            <Route path="cotisation/historique" element={<Historique />} />
            <Route path="cotisation/quittances/:numero" element={<Quittance />} />
            <Route path="evenements" element={<Evenements />} />
            <Route path="evenements/:id" element={<Evenement />} />
            <Route path="evenements/:id/participants" element={<Participants />} />
            <Route path="evenements/paiement/:id" element={<EvenementPaiement />} />
            <Route path="votes" element={<Votes />} />
            <Route path="votes/candidature" element={<Candidature />} />
            <Route path="votes/isoloir" element={<Isoloir />} />
            <Route path="documents" element={<Documents />} />
            <Route path="documents/:id" element={<Document />} />
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
              <Route element={<ScreenGate screen="tresorerie" />}>
                <Route path="cotisations" element={<Suspense fallback={<PageLoader />}><Cotisations /></Suspense>} />
                <Route path="cotisations/encaisser" element={<Suspense fallback={<PageLoader />}><Encaisser /></Suspense>} />
                <Route path="cotisations/reglages" element={<Suspense fallback={<PageLoader />}><ReglagesCotisation /></Suspense>} />
                <Route path="journal-financier" element={<Suspense fallback={<PageLoader />}><JournalFinancier /></Suspense>} />
              </Route>
              <Route element={<ScreenGate screen="annonces" />}>
                <Route path="annonces" element={<Suspense fallback={<PageLoader />}><Annonces /></Suspense>} />
              </Route>
              <Route element={<ScreenGate screen="elections" />}>
                <Route path="elections" element={<Suspense fallback={<PageLoader />}><Elections /></Suspense>} />
              </Route>
              <Route element={<ScreenGate screen="evenements" />}>
                <Route path="evenements" element={<Suspense fallback={<PageLoader />}><EvenementsBureau /></Suspense>} />
                <Route path="evenements/nouveau" element={<Suspense fallback={<PageLoader />}><EvenementForm /></Suspense>} />
                <Route path="evenements/:id" element={<Suspense fallback={<PageLoader />}><EvenementsBureau /></Suspense>} />
                <Route path="evenements/:id/modifier" element={<Suspense fallback={<PageLoader />}><EvenementForm /></Suspense>} />
                <Route path="evenements/:id/pointage" element={<Suspense fallback={<PageLoader />}><Pointage /></Suspense>} />
              </Route>
              <Route element={<ScreenGate screen="documents" />}>
                <Route path="documents" element={<Suspense fallback={<PageLoader />}><DocumentsBureau /></Suspense>} />
              </Route>
              <Route element={<ScreenGate screen="moderation" />}>
                <Route path="moderation" element={<Suspense fallback={<PageLoader />}><Moderation /></Suspense>} />
              </Route>
              <Route element={<ScreenGate screen="bienvenue" />}>
                <Route path="aegb" element={<Suspense fallback={<PageLoader />}><CompteAegb /></Suspense>} />
                <Route path="aegb/:id" element={<Suspense fallback={<PageLoader />}><CompteAegb /></Suspense>} />
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
