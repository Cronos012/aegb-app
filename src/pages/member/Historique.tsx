import { Link } from 'react-router'
import { ChevronRight, FileText } from 'lucide-react'
import { TopBar } from '../../components/dues/DuesParts'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { Pill } from '../../components/Pill'
import { euros, exerciseLabel, frenchDay, METHOD_LABELS, monthName, monthsLabel, shortDay, useMyDues, usePayments, type DuesState, type Payment } from '../../lib/dues'
import { useMe } from '../../lib/queries'

/** L'année de cotisation d'un paiement : celle de son premier mois. */
function exerciseOf(p: Payment): string {
  return exerciseLabel([...p.months].sort()[0])
}

function Totals({ state, payments }: { state: DuesState; payments: Payment[] }) {
  const year = state.months.slice(0, 12)
  const paid = year.filter((m) => m.state === 'paye')
  const due = year.filter((m) => m.state !== 'pas_du').length
  const cents = paid.reduce((sum, m) => sum + (m.amount_cents ?? 0), 0)
  const before = state.paying && state.dues_from && state.dues_from > state.exercise_start ? state.dues_from : null
  return (
    <section className="bg-tisse flex flex-col gap-1 rounded-[12px] px-5 py-[18px] text-white">
      <span className="text-[13px] font-semibold text-white/80">Payé en {exerciseLabel(state.exercise_start)}</span>
      <span className="titre text-[34px] leading-none">{euros(cents)}</span>
      <span className="text-[13px] text-white/85">
        {state.paying ? `${paid.length} mois payé${paid.length > 1 ? 's' : ''} sur ${due} ${due > 1 ? 'dus' : 'dû'}` : "Ta cotisation n'est pas due"}
        {state.paid_until ? ` · à jour jusqu'au ${frenchDay(state.paid_until)}` : ''}
      </span>
      {before ? (
        <span className="mt-1 text-xs text-white/70">
          Rien n'est dû avant {monthName(before)}, {before === state.start_month ? 'le début des cotisations' : 'le mois de ton arrivée'}.
        </span>
      ) : null}
      {payments.some((p) => p.status === 'annule') ? <span className="mt-1 text-xs text-white/70">Les paiements annulés ne comptent pas.</span> : null}
    </section>
  )
}

export function Historique() {
  const me = useMe().data
  const dues = useMyDues()
  const payments = usePayments(me?.profile.id)

  if (payments.isPending || dues.isPending) return <PageLoader />
  const list = payments.data ?? []
  const groups: { label: string; items: Payment[] }[] = []
  for (const p of list) {
    const label = exerciseOf(p)
    const g = groups.find((x) => x.label === label)
    if (g) g.items.push(p)
    else groups.push({ label, items: [p] })
  }

  return (
    <div className="flex flex-1 flex-col bg-surface lg:mx-10 lg:my-8 lg:max-w-[720px] lg:rounded-[12px] lg:p-6">
      <TopBar title="Historique et quittances" fallback="/app/cotisation" />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6 lg:px-0">
        <ErrorNote error={payments.error ?? dues.error} />
        {dues.data ? <Totals state={dues.data} payments={list} /> : null}
        {!list.length ? (
          <EmptyState title="Aucun paiement pour l'instant" icon={<FileText className="size-6" />}>
            Chaque paiement aura sa quittance ici, et dans ta conversation avec le compte AEGB.
          </EmptyState>
        ) : null}
        {groups.map((g) => (
          <section key={g.label} className="flex flex-col gap-2">
            <h2 className="m-0 text-[13px] font-bold tracking-wide text-muted uppercase">{g.label}</h2>
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[12px] border-[1.5px] border-line-soft p-0">
              {g.items.map((p) => {
                const body = (
                  <>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={`truncate text-[15px] font-bold ${p.status === 'annule' ? 'text-muted line-through' : ''}`}>{monthsLabel(p.months)}</span>
                      <span className="truncate text-[13px] text-muted">
                        {METHOD_LABELS[p.method]} · {shortDay(p.paid_on ?? p.created_at)}
                        {p.receipt_number ? ` · quittance n° ${p.receipt_number}` : ''}
                      </span>
                    </span>
                    {p.status === 'annule' ? <Pill tone="danger">Annulé</Pill> : null}
                    <span className={`text-[15px] font-extrabold ${p.status === 'annule' ? 'text-muted line-through' : ''}`}>{euros(p.amount_cents)}</span>
                    {p.receipt_number ? <ChevronRight className="size-[18px] shrink-0 text-muted" /> : null}
                  </>
                )
                return (
                  <li key={p.id} className="border-t border-line-soft first:border-0">
                    {p.receipt_number ? (
                      <Link to={`/app/cotisation/quittances/${p.receipt_number}`} className="flex items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-2">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        <p className="m-0 text-[13px] leading-[1.5] text-muted">
          Chaque quittance est aussi dans ta conversation avec le compte AEGB. Pour la carte, HelloAsso t'envoie en plus son reçu par email.
        </p>
      </div>
    </div>
  )
}
