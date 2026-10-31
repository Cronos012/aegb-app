import { Link } from 'react-router'
import { ButtonLink } from '../../components/Button'
import { FloatingCards } from '../../components/FloatingCards'
import { Brand } from '../../components/Logo'

/** Premier écran de l'appli sur téléphone. */
export function Accueil() {
  return (
    <div className="bg-tisse relative flex min-h-app flex-col px-5 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),28px)] text-white">
      <Brand size={44} />
      <div className="flex flex-1 items-center justify-center py-6">
        <FloatingCards compact />
      </div>
      <p className="m-0 text-xs font-extrabold tracking-[0.14em] text-ciel uppercase">Réseau privé des membres</p>
      <h1 className="titre mt-3 mb-0 text-[44px] leading-[1.02]">
        Ta communauté,
        <br />
        <span className="text-ciel">dans ta poche.</span>
      </h1>
      <p className="mt-4 mb-0 text-[16px] leading-[1.5] text-white/85">
        Les actus, les messages, les cotisations et les votes de l'AEGB. Ouvert aux membres validés par le bureau.
      </p>
      <div className="mt-7 flex flex-col gap-3">
        <ButtonLink to="/inscription" variant="onblue">
          Créer mon compte
        </ButtonLink>
        <ButtonLink to="/connexion" variant="light">
          J'ai déjà un compte
        </ButtonLink>
      </div>
      <Link to="/association" className="mt-5 text-center text-sm font-semibold text-white/80">
        Découvrir l'association
      </Link>
      <div className="barre-tricolore absolute inset-x-0 bottom-0 h-1.5" aria-hidden="true" />
    </div>
  )
}
