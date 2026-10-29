import type { ReactNode } from 'react'
import { CircleAlert, Info, LoaderCircle, TriangleAlert } from 'lucide-react'
import { errorMessage } from '../lib/errors'

export function Spinner({ className = 'size-6' }: { className?: string }) {
  return <LoaderCircle className={`animate-spin text-muted ${className}`} aria-label="Chargement" />
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50dvh] flex-1 place-items-center" role="status">
      <Spinner className="size-8" />
    </div>
  )
}

export function FullScreenLoader() {
  return (
    <div className="bg-tisse grid min-h-dvh place-items-center" role="status">
      <LoaderCircle className="size-9 animate-spin text-white/80" aria-label="Chargement" />
    </div>
  )
}

type NoteTone = 'info' | 'warn' | 'danger'

const NOTE: Record<NoteTone, { box: string; icon: ReactNode }> = {
  info: { box: 'bg-surface-2 text-ink', icon: <Info className="mt-px size-[18px] shrink-0 text-muted" /> },
  warn: { box: 'bg-warn-soft text-ink', icon: <TriangleAlert className="mt-px size-[18px] shrink-0 text-warn" /> },
  danger: { box: 'bg-danger-soft text-ink', icon: <CircleAlert className="mt-px size-[18px] shrink-0 text-danger" /> },
}

export function Note({ tone = 'info', children, className = '' }: { tone?: NoteTone; children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-[14px] px-3.5 py-3 text-[13px] leading-[1.45] ${NOTE[tone].box} ${className}`} role={tone === 'danger' ? 'alert' : undefined}>
      {NOTE[tone].icon}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function ErrorNote({ error, className = '' }: { error: unknown; className?: string }) {
  if (!error) return null
  return (
    <Note tone="danger" className={className}>
      {typeof error === 'string' ? error : errorMessage(error)}
    </Note>
  )
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="mb-1 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div> : null}
      <p className="m-0 text-[15px] font-bold">{title}</p>
      {children ? <p className="m-0 max-w-sm text-sm leading-[1.45] text-muted">{children}</p> : null}
    </div>
  )
}
