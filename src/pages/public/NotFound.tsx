import { ButtonLink } from '../../components/Button'
import { Logo } from '../../components/Logo'

export function NotFound() {
  return (
    <div className="flex min-h-app flex-col items-center justify-center gap-5 bg-surface px-6 text-center">
      <Logo size={64} />
      <h1 className="titre m-0 text-[28px]">Cette page n'existe pas</h1>
      <p className="m-0 max-w-sm text-[15px] text-muted">Le lien est peut-être incomplet.</p>
      <ButtonLink to="/" className="w-full max-w-sm">
        Retour à l'accueil
      </ButtonLink>
    </div>
  )
}
