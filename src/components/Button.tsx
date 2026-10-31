import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { LoaderCircle } from 'lucide-react'

export type Variant = 'primary' | 'accent' | 'onblue' | 'outline' | 'light' | 'danger' | 'danger-outline' | 'ghost' | 'soft'
export type Size = 'lg' | 'md' | 'sm'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:opacity-92',
  accent: 'bg-safran text-white hover:brightness-105',
  onblue: 'bg-white text-leppi hover:bg-white/90',
  outline: 'border-[1.5px] border-line bg-surface text-ink hover:bg-surface-2',
  light: 'border-[1.5px] border-white/45 text-white hover:bg-white/10',
  danger: 'bg-[#B3122A] text-white hover:brightness-110',
  'danger-outline': 'border-[1.5px] border-danger/40 bg-surface text-danger hover:bg-danger-soft',
  ghost: 'text-ink hover:bg-surface-2',
  soft: 'bg-select text-ink hover:brightness-97',
}

const SIZES: Record<Size, string> = {
  lg: 'h-12 rounded-lg px-6 text-base',
  md: 'h-10 rounded-lg px-4 text-[15px]',
  sm: 'h-9 rounded-md px-3 text-sm',
}

export function buttonClass(variant: Variant = 'primary', size: Size = 'lg', extra = '') {
  return `inline-flex shrink-0 items-center justify-center gap-2 font-semibold no-underline transition disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  busy?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'lg', busy = false, icon, className = '', children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}

type ButtonLinkProps = LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }

export function ButtonLink({ variant = 'primary', size = 'lg', icon, className = '', children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, typeof className === 'string' ? className : '')} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
