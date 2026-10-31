import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'

/** L'en-tête blanc des écrans de réglages sur téléphone. Sur ordinateur, la page Réglages porte le titre. */
export function SettingsHeader({ title, back = '/app/reglages' }: { title: string; back?: string }) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 flex h-[calc(60px+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-line-soft bg-surface px-3 pt-[env(safe-area-inset-top)] lg:hidden">
      <button type="button" onClick={() => navigate(back)} aria-label="Retour" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-surface-2">
        <ChevronLeft className="size-6" strokeWidth={2.2} />
      </button>
      <h1 className="titre m-0 min-w-0 flex-1 truncate text-[22px]">{title}</h1>
    </header>
  )
}

/** Un groupe de réglages : son titre en petites capitales, puis une carte blanche. */
export function Group({ title, children, note, className = '' }: { title: ReactNode; children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className="m-0 px-1 pb-2 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">{title}</h2>
      <div className="divide-y divide-line-soft overflow-hidden rounded-[22px] bg-surface">{children}</div>
      {note ? <Hint className="mt-2.5">{note}</Hint> : null}
    </section>
  )
}

export function Hint({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`m-0 flex items-start gap-2 px-1 text-[13px] leading-[1.45] text-muted ${className}`}>
      <Info className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** L'interrupteur seul, indigo quand il est mis. */
export function Switch({ checked, disabled = false }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition peer-focus-visible:ring-[3px] peer-focus-visible:ring-safran/60 ${checked ? (disabled ? 'bg-[#8F97C2]' : 'bg-leppi') : 'bg-line'}`}
      aria-hidden="true"
    >
      <span className={`absolute top-[3px] size-6 rounded-full bg-surface shadow transition-all ${checked ? 'left-[23px]' : 'left-[3px]'}`} />
    </span>
  )
}

type SwitchRowProps = {
  title: ReactNode
  detail?: ReactNode
  checked: boolean
  onChange?: (v: boolean) => void
  /** Toujours mis, ne se coupe pas (les annonces du bureau). */
  locked?: boolean
  children?: ReactNode
}

export function SwitchRow({ title, detail, checked, onChange, locked = false, children }: SwitchRowProps) {
  return (
    <label className={`flex min-h-[60px] items-center gap-4 px-4 py-3 ${locked ? '' : 'cursor-pointer'}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold">{title}</span>
        {detail ? <span className="block text-[14px] text-muted">{detail}</span> : null}
        {children}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={locked} onChange={(e) => onChange?.(e.target.checked)} className="peer sr-only" />
      <Switch checked={checked} disabled={locked} />
    </label>
  )
}

type LinkRowProps = {
  to?: string
  onClick?: () => void
  icon: ReactNode
  tone: string
  title: ReactNode
  detail?: ReactNode
  value?: ReactNode
  danger?: boolean
  chevron?: boolean
}

/** Une ligne du menu Réglages : une icône dans un carré de couleur, un titre, et souvent une flèche. */
export function LinkRow({ to, onClick, icon, tone, title, detail, value, danger = false, chevron = true }: LinkRowProps) {
  const body = (
    <>
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[16px] font-bold ${danger ? 'text-danger' : ''}`}>{title}</span>
        {detail ? <span className="block truncate text-[14px] text-muted">{detail}</span> : null}
      </span>
      {value ? <span className="max-w-[45%] truncate text-[15px] text-muted">{value}</span> : null}
      {chevron ? <ChevronRight className="size-5 shrink-0 text-muted" /> : null}
    </>
  )
  const cls = 'flex min-h-[64px] w-full items-center gap-3.5 px-4 py-2.5 text-left text-ink no-underline hover:bg-surface-2'
  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    )
  }
  return <div className={cls.replace(' hover:bg-surface-2', '')}>{body}</div>
}
