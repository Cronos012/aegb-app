import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft } from 'lucide-react'

export function BackLink({ to, label = 'Retour', light = true }: { to: string; label?: string; light?: boolean }) {
  return (
    <Link to={to} aria-label={label} className={`-ml-2.5 grid size-11 place-items-center rounded-xl ${light ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-surface-2'}`}>
      <ChevronLeft className="size-6" strokeWidth={2.2} />
    </Link>
  )
}

type HeroProps = {
  back?: string
  right?: ReactNode
  kicker?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  className?: string
}

/** En-tête tissé indigo des écrans téléphone, suivi d'une feuille blanche qui le chevauche. */
export function Hero({ back, right, kicker, title, subtitle, children, className = '' }: HeroProps) {
  return (
    <header className={`bg-tisse shrink-0 px-5 pt-[max(env(safe-area-inset-top),8px)] pb-12 text-white ${className}`}>
      {back || right ? (
        <div className="flex min-h-11 items-center justify-between">
          {back ? <BackLink to={back} /> : <span />}
          {right}
        </div>
      ) : (
        <div className="h-3" />
      )}
      <div className="mt-2 flex flex-col gap-1.5">
        {kicker}
        <h1 className="titre m-0 text-[30px] leading-[1.08]">{title}</h1>
        {subtitle ? <p className="m-0 text-[15px] leading-[1.45] text-white/85">{subtitle}</p> : null}
      </div>
      {children}
    </header>
  )
}

export function Sheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`relative -mt-6 flex flex-1 flex-col rounded-t-[26px] bg-surface px-5 pt-[26px] pb-7 ${className}`}>{children}</div>
}

export function StepHeader({ back, step, total, title, subtitle }: { back: () => void; step: number; total: number; title: string; subtitle: string }) {
  return (
    <header className="bg-tisse shrink-0 px-5 pt-[max(env(safe-area-inset-top),8px)] pb-12 text-white">
      <div className="flex min-h-11 items-center justify-between">
        <button type="button" onClick={back} aria-label="Étape précédente" className="-ml-2.5 grid size-11 place-items-center rounded-xl text-white hover:bg-white/10">
          <ChevronLeft className="size-6" strokeWidth={2.2} />
        </button>
        <span className="text-[13px] font-bold text-white/80">
          Étape {step} sur {total}
        </span>
      </div>
      <div className="mt-3.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length: total }, (_, k) => (
          <div key={k} className={`h-[5px] rounded-full ${k < step ? 'bg-safran' : 'bg-white/20'}`} />
        ))}
      </div>
      <div className="mt-3.5 flex flex-col gap-1.5">
        <h1 className="titre m-0 text-[30px] leading-[1.08]">{title}</h1>
        <p className="m-0 text-[15px] leading-[1.45] text-white/85">{subtitle}</p>
      </div>
    </header>
  )
}
