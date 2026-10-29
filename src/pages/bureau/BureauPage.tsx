import type { ReactNode } from 'react'
import { Hero } from '../../components/Hero'
import { useIsDesktop } from '../../lib/media'

type Props = {
  title: string
  subtitle?: ReactNode
  back?: string | null
  kicker?: ReactNode
  actions?: ReactNode
  /** Filtres et recherche : dans l'en-tête indigo sur téléphone, sous le titre sur ordinateur. */
  controls?: (onDark: boolean) => ReactNode
  children: ReactNode
}

export function BureauPage({ title, subtitle, back = '/bureau', kicker, actions, controls, children }: Props) {
  const desktop = useIsDesktop()

  if (desktop) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {kicker}
            <h1 className="titre m-0 text-[34px] leading-tight">{title}</h1>
            {subtitle ? <p className="mt-1 mb-0 text-[15px] text-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
        </div>
        {controls?.(false)}
        {children}
      </div>
    )
  }

  return (
    <>
      <Hero back={back ?? undefined} kicker={kicker} title={title} subtitle={subtitle}>
        {controls ? <div className="mt-4">{controls(true)}</div> : null}
      </Hero>
      <div className="relative -mt-6 flex flex-1 flex-col gap-3 px-3 pb-6">{children}</div>
    </>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[22px] bg-surface ${className}`}>{children}</div>
}

type Chip<T extends string> = { value: T; label: string; count?: number }

/** Rangée de pastilles de filtre, qui défile sur téléphone. */
export function Chips<T extends string>({ options, value, onChange, onDark = false, label }: { options: Chip<T>[]; value: T; onChange: (v: T) => void; onDark?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
      {options.map((o) => {
        const active = o.value === value
        const tone = onDark
          ? active
            ? 'bg-safran text-nuit'
            : 'bg-white/12 text-white hover:bg-white/18'
          : active
            ? 'bg-primary text-primary-ink'
            : 'border border-line bg-surface text-ink hover:bg-surface-2'
        return (
          <button key={o.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.value)} className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap ${tone}`}>
            {o.label}
            {o.count != null ? ` · ${o.count}` : ''}
          </button>
        )
      })}
    </div>
  )
}
