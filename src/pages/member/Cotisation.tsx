import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, CreditCard, FileText, HeartHandshake, ShieldCheck, Vote } from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { StatusBox } from '../../components/dues/DuesParts'
import { MonthGrid, MonthLegend } from '../../components/dues/MonthGrid'
import { PayPanel } from '../../components/dues/PayPanel'
import { ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { Hero, Sheet } from '../../components/Hero'
import { byExercise, duesSummary, euros, exerciseLabel, legendFor, solidarityLine, frenchDay, METHOD_LABELS, monthsLabel, payableMonths, shortDay, useMyDues, usePayments, type DuesState, type Payment } from '../../lib/dues'
import { useIsDesktop } from '../../lib/media'
import { useMe } from '../../lib/queries'

function Row({ to, icon, tone, title, detail }: { to?: string; icon: ReactNode; tone: string; title: string; detail: string }) {
  const body = (
    <>
      <span className={`grid size-10 shrink-0 place-items-center rounded-[14px] ${tone}`}>{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold">{title}</span>
        <span className="truncate text-[13px] text-muted">{detail}</span>
      </span>
      {to ? <ChevronRight className="size-[18px] shrink-0 text-muted" /> : null}
    </>
  )
  return to ? (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-2">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 px-4 py-3">{body}</div>
  )
}

/** Ce qu'on dit sous les mois, selon la situation. */
function Advice({ state }: { state: DuesState }) {
  if (state.status === 'pas_due') {
    return (
      <Note>
        <strong>Tu gardes tous tes droits.</strong> Droit de solidarité, élections et événements, comme les membres qui cotisent.
      </Note>
    )
  }
  if (state.status === 'pas_encore') {
    return (
      <Note>
        <strong>Rien à faire pour l'instant.</strong> Tu pourras payer ici dès le {frenchDay(state.dues_from ?? state.start_month)}. D'ici là, tu as tous tes droits.
      </Note>
    )
  }
  if (state.solidarity_suspended) {
    return <Note tone="danger">Tant que tu n'es pas à jour, ton droit de solidarité (article 8) est suspendu.</Note>
  }
  if (state.late.length) {
    return <Note tone="warn">Règle ton retard avant {state.solidarity_months} mois : au-delà, ton droit de solidarité (article 8) est suspendu jusqu'au paiement.</Note>
  }
  return null
}

function payLabel(state: DuesState): string | null {
  if (!state.paying || state.status === 'pas_encore' || !payableMonths(state).length) return null
  return state.status === 'retard' ? `Régulariser maintenant · ${euros(state.late_cents)}` : 'Payer les mois suivants'
}

function historyLine(payments: Payment[] | undefined): string {
  const done = (payments ?? []).filter((p) => p.status === 'confirme')
  if (!done.length) return 'Aucun paiement pour l’instant'
  return `${done.length} paiement${done.length > 1 ? 's' : ''} · dernier le ${shortDay(done[0].paid_on ?? done[0].created_at)}`
}

function Months({ state }: { state: DuesState }) {
  const groups = byExercise(state.months)
  return (
    <>
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-base font-extrabold">Mes mois</h2>
        <span className="text-sm text-muted">{state.paying ? `${euros(state.monthly_cents)} par mois` : 'Rien à payer cette année'}</span>
      </div>
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-2">
          {groups.length > 1 ? <p className="m-0 text-[13px] font-bold text-muted">Année {g.label}</p> : null}
          <MonthGrid months={g.months} label={`Mes mois de l'année ${g.label}`} />
        </div>
      ))}
      <MonthLegend items={legendFor(state.months)} />
    </>
  )
}

function Receipts({ payments }: { payments: Payment[] }) {
  const done = payments.filter((p) => p.receipt_number)
  const paid = payments.filter((p) => p.status === 'confirme').reduce((sum, p) => sum + p.amount_cents, 0)
  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-base font-extrabold">Quittances</h2>
        <span className="text-[13px] text-muted">Payé en tout : {euros(paid)}</span>
      </div>
      {done.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {done.slice(0, 6).map((p) => (
            <li key={p.id} className="border-t border-line-soft first:border-0">
              <Link to={`/app/cotisation/quittances/${p.receipt_number}`} className="flex items-center gap-3 py-2.5 text-ink no-underline hover:opacity-80">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-select text-[10px] font-extrabold text-link">PDF</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate text-sm font-bold ${p.status === 'annule' ? 'line-through' : ''}`}>{monthsLabel(p.months)}</span>
                  <span className="truncate text-xs text-muted">
                    n° {p.receipt_number} · {METHOD_LABELS[p.method].toLowerCase()} · {shortDay(p.paid_on ?? p.created_at)}
                    {p.status === 'annule' ? ' · annulé' : ''}
                  </span>
                </span>
                <span className="text-sm font-bold">{euros(p.amount_cents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-muted">Tes quittances apparaîtront ici après ton premier paiement.</p>
      )}
      {done.length > 6 ? (
        <Link to="/app/cotisation/historique" className="text-sm font-bold">
          Tout l'historique
        </Link>
      ) : null}
      <p className="m-0 text-xs leading-[1.45] text-muted">Chaque quittance arrive aussi dans ta conversation avec le compte AEGB.</p>
    </section>
  )
}

function Why() {
  const items = [
    { icon: <ShieldCheck className="size-5" />, text: 'Le droit de solidarité (article 8) quand tu en as besoin' },
    { icon: <Vote className="size-5" />, text: 'Le droit de voter aux élections du bureau' },
    { icon: <HeartHandshake className="size-5" />, text: "Les événements de l'asso, gratuits ou moins chers" },
  ]
  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-surface p-5">
      <h2 className="m-0 text-base font-extrabold">Pourquoi cotiser ?</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((i) => (
          <li key={i.text} className="flex items-start gap-3 text-sm leading-[1.45]">
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-ok-soft text-ok">{i.icon}</span>
            {i.text}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Cotisation() {
  const me = useMe().data
  const dues = useMyDues()
  const payments = usePayments(me?.profile.id)
  const desktop = useIsDesktop()

  if (dues.isPending) return <PageLoader />
  if (!dues.data) {
    return (
      <div className="p-5">
        <ErrorNote error={dues.error ?? 'Ta cotisation est introuvable.'} />
      </div>
    )
  }
  const s = dues.data
  const label = payLabel(s)
  const subtitle = `Année ${exerciseLabel(s.exercise_start)}, de septembre à août`

  if (desktop) {
    const summary = duesSummary(s)
    return (
      <div className="flex flex-1 flex-col gap-6 px-10 py-8">
        <div>
          <h1 className="titre m-0 text-[34px]">Ma cotisation</h1>
          <p className="mt-1 mb-0 text-[15px] text-muted">
            {subtitle}
            {s.paying ? ` · ${euros(s.monthly_cents)} par mois` : ''}
          </p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
          <section className="overflow-hidden rounded-[26px] bg-surface">
            <div className="bg-tisse px-6 py-5 text-white">
              <StatusBox state={s} extra={s.paying && summary.tone === 'ok' ? `droit de solidarité (article 8) actif` : undefined} />
            </div>
            <div className="flex flex-col gap-[18px] px-6 py-6">
              {label ? (
                <>
                  <Advice state={s} />
                  <PayPanel state={s} footerClass="lg:max-w-[360px]" />
                </>
              ) : (
                <>
                  <Months state={s} />
                  <Advice state={s} />
                </>
              )}
            </div>
          </section>
          <div className="flex flex-col gap-4">
            {payments.data ? <Receipts payments={payments.data} /> : null}
            <Why />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <Hero title="Ma cotisation" subtitle={subtitle}>
        <div className="mt-[18px]">
          <StatusBox state={s} />
        </div>
      </Hero>
      <Sheet className="gap-[18px]">
        <Months state={s} />
        <Advice state={s} />
        {label ? (
          <ButtonLink to="/app/cotisation/payer" variant={s.status === 'retard' ? 'accent' : 'primary'} icon={<CreditCard className="size-5" />}>
            {label}
          </ButtonLink>
        ) : null}
        {s.status === 'retard' ? (
          <p className="m-0 text-center text-[13px] leading-[1.45] text-muted">
            Une difficulté pour payer ? Écris au bureau dans la <Link to="/app/messages">conversation AEGB</Link>, on trouvera une solution.
          </p>
        ) : null}
        <div className="overflow-hidden rounded-[18px] border-[1.5px] border-line-soft">
          <Row to="/app/cotisation/historique" icon={<FileText className="size-[22px]" />} tone="bg-select text-link" title="Historique et quittances" detail={historyLine(payments.data)} />
          {s.paying ? (
            <div className="border-t border-line-soft">
              <Row
                icon={<ShieldCheck className="size-[22px]" />}
                tone={s.solidarity_suspended ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok'}
                title="Droit de solidarité (article 8)"
                detail={solidarityLine(s)}
              />
            </div>
          ) : null}
        </div>
      </Sheet>
    </div>
  )
}
