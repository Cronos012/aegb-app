import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

/* ----------------------------------------------------------------------------
   Morceaux communs aux écrans « Élections » du bureau.
---------------------------------------------------------------------------- */

const STEPS = ['Préparation', 'Candidatures', 'Vote', 'Résultats']

/** La frise du bureau : préparation, candidatures, vote, résultats. */
export function Steps({ step, done = false }: { step: number; done?: boolean }) {
  return (
    <ol className="m-0 flex list-none items-center gap-3 rounded-[22px] bg-surface px-6 py-4" aria-label="Étapes de l’AG">
      {STEPS.map((label, i) => {
        const past = i < step || done
        const now = i === step && !done
        return (
          <li key={label} className={`flex items-center gap-3 ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${
                past ? 'bg-ok text-white' : now ? 'bg-leppi text-white ring-4 ring-safran/60' : 'border-2 border-line text-muted'
              }`}
              aria-hidden="true"
            >
              {past ? <Check className="size-4" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`text-[15px] font-bold whitespace-nowrap ${past ? 'text-ok' : now ? 'text-ink' : 'text-muted'}`}>
              {label}
              <span className="sr-only">{past ? ' : fait' : now ? ' : en cours' : ' : à venir'}</span>
            </span>
            {i < STEPS.length - 1 ? <span className={`h-0.5 flex-1 rounded ${past ? 'bg-ok' : 'bg-line'}`} aria-hidden="true" /> : null}
          </li>
        )
      })}
    </ol>
  )
}

export function Tile({ icon, tone, label, value, detail }: { icon: ReactNode; tone: string; label: string; value: ReactNode; detail: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[20px] bg-surface px-[18px] py-4">
      <span className={`flex items-center gap-2 text-[13px] font-bold ${tone.split(' ').find((c) => c.startsWith('text-')) ?? ''}`}>
        <span className={`grid size-7 place-items-center rounded-lg ${tone}`}>{icon}</span>
        {label}
      </span>
      <span className="titre truncate text-[28px] leading-tight">{value}</span>
      <span className="text-[13px] leading-snug text-muted">{detail}</span>
    </div>
  )
}

export function Panel({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-[22px] bg-surface p-5 lg:p-6 ${className}`}>
      {title || right ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {title ? <h2 className="titre m-0 text-[20px]">{title}</h2> : null}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** Une ligne cochée ou en attente, pour les conditions et les vérifications. */
export function CheckLine({ state, title, detail }: { state: 'ok' | 'warn' | 'todo'; title: ReactNode; detail?: ReactNode }) {
  const tone = state === 'ok' ? 'bg-ok-soft text-ok' : state === 'warn' ? 'bg-danger-soft text-danger' : 'bg-safran-pale text-[#6B4A00]'
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[13px] font-extrabold ${tone}`} aria-hidden="true">
        {state === 'ok' ? <Check className="size-3.5" strokeWidth={3} /> : state === 'warn' ? '!' : '?'}
      </span>
      <span className="flex min-w-0 flex-col">
        <strong className="text-[15px] leading-snug">{title}</strong>
        {detail ? <span className="text-[13px] leading-snug text-muted">{detail}</span> : null}
      </span>
    </div>
  )
}
