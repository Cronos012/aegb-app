import { Link } from 'react-router'
import { Banknote } from 'lucide-react'
import { ButtonLink } from '../Button'
import { ErrorNote, PageLoader } from '../Feedback'
import { Pill } from '../Pill'
import { byExercise, duesSummary, euros, legendFor, METHOD_LABELS, monthsLabel, shortDay, statusShort, useMemberDues, usePayments } from '../../lib/dues'
import { MonthGrid, MonthLegend } from './MonthGrid'

/** La cotisation d'un membre, dans sa fiche. Seulement pour les postes qui ont accès à l'argent. */
export function MemberDues({ memberId, canCollect }: { memberId: string; canCollect: boolean }) {
  const dues = useMemberDues(memberId)
  const payments = usePayments(memberId)
  if (dues.isPending) return <PageLoader />
  if (!dues.data) return <ErrorNote error={dues.error ?? 'Cotisation introuvable.'} />
  const s = dues.data
  const st = statusShort(s)
  const summary = duesSummary(s)
  const year = byExercise(s.months)[0]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Pill tone={st.tone}>{st.label}</Pill>
          <p className="m-0 mt-1.5 text-[13px] text-muted">{summary.detail}</p>
        </div>
        {canCollect && s.paying && s.status !== 'pas_encore' ? (
          <ButtonLink to={`/bureau/cotisations/encaisser?membre=${memberId}`} size="sm" icon={<Banknote className="size-4" />}>
            Encaisser
          </ButtonLink>
        ) : null}
      </div>
      {year ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[12px] font-bold tracking-wide text-muted uppercase">Année {year.label}</p>
          <MonthGrid months={year.months} label={`Mois de l'année ${year.label}`} />
          <MonthLegend items={legendFor(year.months)} />
        </div>
      ) : null}
      <div>
        <p className="m-0 mb-2 text-[12px] font-bold tracking-wide text-muted uppercase">Paiements</p>
        {payments.data?.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {payments.data.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-t border-line-soft py-2.5 text-[14px] first:border-0">
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-bold ${p.status === 'annule' ? 'text-muted line-through' : ''}`}>{monthsLabel(p.months)}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {METHOD_LABELS[p.method]} · {shortDay(p.paid_on ?? p.created_at)}
                    {p.receipt_number ? (
                      <>
                        {' · '}
                        <Link to={`/app/cotisation/quittances/${p.receipt_number}`}>quittance n° {p.receipt_number}</Link>
                      </>
                    ) : null}
                  </span>
                </span>
                {p.status === 'annule' ? <Pill tone="danger">Annulé</Pill> : null}
                <span className="font-extrabold">{euros(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px] text-muted">Aucun paiement pour l'instant.</p>
        )}
      </div>
    </div>
  )
}
