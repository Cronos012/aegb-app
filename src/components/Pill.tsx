import type { ReactNode } from 'react'

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'safran'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  brand: 'bg-select text-ink',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  safran: 'bg-safran-pale text-[#6B4A00]',
}

export function Pill({ tone = 'neutral', icon, children, className = '' }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-xs font-bold whitespace-nowrap ${TONES[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  )
}
