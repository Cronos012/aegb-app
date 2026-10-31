import { useState } from 'react'
import { Info, Lock } from 'lucide-react'
import { Button } from '../Button'
import { ErrorNote, Note } from '../Feedback'
import { byExercise, defaultUntil, legendFor, euros, monthsLabel, monthsUntil, payableMonths, startCardPayment, useCardPayments, type DuesState } from '../../lib/dues'
import { MonthGrid, MonthLegend } from './MonthGrid'

/** Choisir jusqu'à quel mois payer, voir le total, puis partir chez HelloAsso. */
export function PayPanel({ state, footerClass = '' }: { state: DuesState; footerClass?: string }) {
  const card = useCardPayments()
  const payable = payableMonths(state)
  const [until, setUntil] = useState<string | null>(() => defaultUntil(state))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const chosen = until ? monthsUntil(state, until) : []
  const total = chosen.length * state.monthly_cents
  const ready = card.data?.ready ?? !card.isError
  const notReady = card.data && !card.data.ready

  // Toucher un mois paie jusqu'à lui. Toucher à nouveau le dernier choisi le retire.
  function pick(month: string) {
    if (month === until) {
      const i = payable.indexOf(month)
      setUntil(i > 0 ? payable[i - 1] : month)
    } else {
      setUntil(month)
    }
  }

  async function pay() {
    if (!until) return
    setBusy(true)
    setError(null)
    try {
      window.location.assign(await startCardPayment(until))
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  if (!payable.length) {
    return <Note>Tout est payé jusqu'à la fin de l'année. Merci ! Tu pourras payer l'année suivante à partir du 1er décembre.</Note>
  }

  const groups = byExercise(state.months)
  const earlier = chosen.filter((m) => m < state.months[0].month)

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[17px] font-extrabold">Choisis les mois à payer</h2>
        <p className="m-0 text-sm text-muted">Touche le dernier mois à payer : un mois, plusieurs, ou toute l'année d'un coup.</p>
      </div>
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-2">
          {groups.length > 1 ? <p className="m-0 text-[13px] font-bold text-muted">Année {g.label}</p> : null}
          <MonthGrid months={g.months} selected={new Set(chosen)} pickable={new Set(payable)} onPick={pick} label={`Mois de l'année ${g.label}`} />
        </div>
      ))}
      <MonthLegend items={legendFor(state.months, true)} />
      {earlier.length ? <Note tone="warn">Le paiement comprend aussi {monthsLabel(earlier).toLowerCase()}, de l'année précédente.</Note> : null}

      <div className="flex flex-col gap-2.5 rounded-[12px] bg-surface-2 p-4">
        <div className="flex justify-between gap-3 text-[15px]">
          <span>{chosen.length ? monthsLabel(chosen) : 'Aucun mois choisi'}</span>
          <span className="shrink-0 text-muted">
            {chosen.length} × {euros(state.monthly_cents)}
          </span>
        </div>
        <div className="h-px bg-line-soft" />
        <div className="flex items-baseline justify-between">
          <span className="text-base font-extrabold">Total</span>
          <span className="titre text-[28px]">{euros(total)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border-2 border-primary px-4 py-3.5">
        <span className="grid size-[42px] place-items-center rounded-xl bg-ok-soft text-[13px] font-extrabold text-ok">HA</span>
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-extrabold">Carte bancaire</span>
          <span className="text-[13px] text-muted">Paiement sécurisé par HelloAsso{card.data?.mode === 'sandbox' ? ', en mode essai' : ''}</span>
        </span>
        <span className="size-6 rounded-full border-[7px] border-primary" aria-hidden="true" />
      </div>

      {notReady ? (
        <Note tone="warn">Le paiement par carte n'est pas encore branché. En attendant, tu peux régler en espèces, par virement ou par chèque auprès de la trésorerie.</Note>
      ) : (
        <div className="flex gap-2.5 rounded-[14px] bg-safran-pale px-3.5 py-3 text-[13px] leading-[1.45] text-[#163F93]">
          <Info className="mt-px size-[18px] shrink-0" />
          <span>HelloAsso te proposera un pourboire pour leur service. Il est facultatif : tu peux le mettre à 0 €.</span>
        </div>
      )}
      <ErrorNote error={error} />

      <div className={`flex flex-col gap-2 ${footerClass}`}>
        <Button onClick={pay} busy={busy} disabled={!chosen.length || !ready} icon={<Lock className="size-5" />}>
          Payer {euros(total)} avec HelloAsso
        </Button>
        <span className="text-center text-xs text-muted">Tu reviens dans l'appli juste après le paiement.</span>
      </div>
    </div>
  )
}
