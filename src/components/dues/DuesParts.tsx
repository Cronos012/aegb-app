import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Check, ChevronLeft, Clock, Minus, TriangleAlert } from 'lucide-react'
import { duesSummary, type DuesState } from '../../lib/dues'

const ICONS = {
  ok: { box: 'bg-gn-vert text-white', icon: <Check className="size-[26px]" strokeWidth={3} /> },
  danger: { box: 'bg-gn-rouge text-white', icon: <TriangleAlert className="size-6" strokeWidth={2.6} /> },
  neutral: { box: 'bg-white/20 text-white', icon: <Minus className="size-6" strokeWidth={3} /> },
}

/** L'encadré du statut, sur fond indigo. */
export function StatusBox({ state, extra }: { state: DuesState; extra?: string }) {
  const s = duesSummary(state)
  const pending = state.status === 'a_jour' && !state.paid_until
  return (
    <div className="flex items-center gap-3.5 rounded-[12px] border border-white/18 bg-white/10 px-4 py-3.5">
      <span className={`grid size-12 shrink-0 place-items-center rounded-full ${ICONS[s.tone].box}`} aria-hidden="true">
        {pending ? <Clock className="size-6" strokeWidth={2.6} /> : ICONS[s.tone].icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="titre text-[22px] leading-tight">{s.title}</span>
        <span className="text-sm text-white/85">
          {s.detail}
          {extra ? ` · ${extra}` : ''}
        </span>
      </span>
    </div>
  )
}

/** En-tête des écrans de la cotisation : retour, titre, et une action à droite. */
export function TopBar({ title, subtitle, fallback, right }: { title: string; subtitle?: ReactNode; fallback: string; right?: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  function back() {
    if (location.key !== 'default') navigate(-1)
    else navigate(fallback)
  }
  return (
    <header className="sticky top-0 z-20 flex min-h-[calc(62px+env(safe-area-inset-top))] items-center gap-1.5 border-b border-line-soft bg-surface px-3 pt-[env(safe-area-inset-top)] lg:static lg:min-h-0 lg:border-0 lg:bg-transparent lg:p-0 lg:pb-5">
      <button type="button" onClick={back} aria-label="Retour" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-surface-2">
        <ChevronLeft className="size-6" strokeWidth={2.2} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="titre m-0 truncate text-[20px] leading-tight lg:text-[30px]">{title}</h1>
        {subtitle ? <p className="m-0 truncate text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {right}
    </header>
  )
}
