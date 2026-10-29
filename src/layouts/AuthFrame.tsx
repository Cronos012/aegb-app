import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Brand } from '../components/Logo'
import { FloatingCards } from '../components/FloatingCards'
import { useIsDesktop } from '../lib/media'

type Props = {
  /** En-tête du téléphone (tissé indigo). */
  hero: ReactNode
  /** Titre et sous-titre du formulaire sur ordinateur. */
  heading: ReactNode
  sub?: ReactNode
  /** Grande phrase du panneau gauche sur ordinateur. */
  panelTitle: ReactNode
  panelText: string
  topRight?: ReactNode
  above?: ReactNode
  children: ReactNode
}

/** Écrans d'accès : plein écran sur téléphone, deux panneaux sur ordinateur. */
export function AuthFrame({ hero, heading, sub, panelTitle, panelText, topRight, above, children }: Props) {
  const desktop = useIsDesktop()

  if (!desktop) {
    return (
      <div className="flex min-h-dvh flex-col bg-surface">
        {hero}
        <div className="relative -mt-6 flex flex-1 flex-col rounded-t-[26px] bg-surface px-5 pt-[26px] pb-[max(env(safe-area-inset-bottom),24px)]">{children}</div>
      </div>
    )
  }

  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)_minmax(0,1fr)] bg-surface">
      <section className="bg-tisse relative flex flex-col overflow-hidden px-12 pt-10 pb-14 text-white">
        <Link to="/" className="text-white no-underline">
          <Brand size={40} />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <FloatingCards />
        </div>
        <h2 className="titre m-0 text-[52px] leading-[1.02]">{panelTitle}</h2>
        <p className="mt-4 mb-0 max-w-md text-[17px] leading-[1.5] text-white/82">{panelText}</p>
        <div className="barre-tricolore absolute inset-x-0 bottom-0 h-2" aria-hidden="true" />
      </section>
      <section className="flex flex-col px-12 py-8">
        <div className="min-h-6 text-right text-sm text-muted">{topRight}</div>
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
          {above}
          <h1 className="titre m-0 text-[36px] leading-tight">{heading}</h1>
          {sub ? <p className="mt-2 mb-0 text-[15px] leading-[1.5] text-muted">{sub}</p> : null}
          <div className="mt-7 flex flex-col">{children}</div>
        </div>
        <nav className="flex justify-center gap-6 text-[13px] text-muted" aria-label="Liens utiles">
          <Link to="/association" className="text-muted">
            Retour au site
          </Link>
          <Link to="/charte" className="text-muted">
            Charte des membres
          </Link>
        </nav>
      </section>
    </div>
  )
}
