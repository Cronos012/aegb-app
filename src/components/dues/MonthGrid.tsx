import { Banknote, Check } from 'lucide-react'
import { monthShort, monthYearLabel, type DuesMonth, type LegendKey, type MonthState } from '../../lib/dues'

const CELL: Record<MonthState, string> = {
  paye: 'bg-ok-soft text-ok',
  retard: 'bg-danger-soft text-danger',
  en_cours: 'border-[1.5px] border-dashed border-safran bg-surface text-muted',
  a_venir: 'border-[1.5px] border-dashed border-line bg-surface text-muted',
  pas_du: 'bg-surface-2 text-muted',
}

const STATE_LABELS: Record<MonthState, string> = {
  paye: 'payé',
  retard: 'en retard',
  en_cours: 'à payer ce mois-ci',
  a_venir: 'à venir',
  pas_du: 'pas dû',
}

function Mark({ state, cash }: { state: MonthState; cash?: boolean }) {
  if (state === 'paye') return cash ? <Banknote className="size-4" strokeWidth={2.4} /> : <Check className="size-4" strokeWidth={3} />
  if (state === 'retard') return <>!</>
  if (state === 'pas_du') return <>–</>
  return null
}

type Props = {
  months: DuesMonth[]
  /** Mois choisis pour payer (mode choix). */
  selected?: Set<string>
  /** Mois qu'on peut toucher pour choisir jusqu'où payer. */
  pickable?: Set<string>
  onPick?: (month: string) => void
  /** Les paiements en espèces, pour les distinguer dans la matrice du bureau. */
  cash?: Set<string>
  label?: string
}

/** Les 12 mois de l'année, en 2 rangées de 6. */
export function MonthGrid({ months, selected, pickable, onPick, cash, label = 'Mes mois' }: Props) {
  return (
    <ul aria-label={label} className="m-0 grid list-none grid-cols-6 gap-x-1 gap-y-3 p-0">
      {months.map((m) => {
        const chosen = selected?.has(m.month) ?? false
        const canPick = !!onPick && (pickable?.has(m.month) ?? false)
        const box = chosen ? 'bg-primary text-primary-ink' : CELL[m.state]
        const content = (
          <>
            <span className={`grid size-11 place-items-center rounded-[13px] text-base font-extrabold ${box} ${canPick ? 'group-hover:ring-2 group-hover:ring-safran/60' : ''}`} aria-hidden="true">
              {chosen ? <Check className="size-4" strokeWidth={3} /> : <Mark state={m.state} cash={!!m.payment_id && cash?.has(m.payment_id)} />}
            </span>
            <span className={`text-xs font-bold ${m.state === 'paye' || chosen ? 'text-ink' : 'text-muted'}`} aria-hidden="true">
              {monthShort(m.month)}
            </span>
            <span className="sr-only">
              {monthYearLabel(m.month)} : {chosen ? 'choisi' : STATE_LABELS[m.state]}
            </span>
          </>
        )
        return (
          <li key={m.month} className="flex justify-center">
            {canPick ? (
              <button type="button" onClick={() => onPick!(m.month)} aria-pressed={chosen} className="group flex flex-col items-center gap-[5px] rounded-[14px] p-0">
                {content}
              </button>
            ) : (
              <span className="flex flex-col items-center gap-[5px]">{content}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Une seule case, pour la matrice du bureau. */
export function MonthCell({ month, cash, label }: { month: DuesMonth; cash?: Set<string>; label: string }) {
  return (
    <span role="img" aria-label={`${label} : ${STATE_LABELS[month.state]}`} className={`mx-auto grid size-9 place-items-center rounded-[11px] text-sm font-extrabold ${CELL[month.state]}`}>
      <Mark state={month.state} cash={!!month.payment_id && cash?.has(month.payment_id)} />
    </span>
  )
}

const STRIP: Record<MonthState, string> = {
  paye: 'bg-ok',
  retard: 'bg-danger',
  en_cours: 'border border-dashed border-safran',
  a_venir: 'border border-dashed border-line',
  pas_du: 'bg-line-soft',
}

/** Une ligne de 12 petites cases, pour la liste du bureau sur téléphone. */
export function MonthStrip({ months, label }: { months: DuesMonth[]; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex gap-[3px]">
      {months.slice(0, 12).map((m) => (
        <span key={m.month} className={`size-3 rounded-[3px] ${STRIP[m.state]}`} />
      ))}
    </span>
  )
}

const LEGEND: Record<LegendKey, { box: string; label: string }> = {
  paye: { box: 'bg-ok-soft', label: 'Payé' },
  choisi: { box: 'bg-primary', label: 'Choisi' },
  retard: { box: 'bg-danger-soft', label: 'En retard' },
  en_cours: { box: 'border-[1.5px] border-dashed border-safran', label: 'Ce mois-ci' },
  a_venir: { box: 'border-[1.5px] border-dashed border-line', label: 'À venir' },
  pas_du: { box: 'bg-surface-2', label: 'Pas dû' },
}

export function MonthLegend({ items }: { items: LegendKey[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1.5 p-0 text-xs text-muted">
      {items.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={`size-3 rounded-[4px] ${LEGEND[k].box}`} aria-hidden="true" />
          {LEGEND[k].label}
        </li>
      ))}
    </ul>
  )
}
