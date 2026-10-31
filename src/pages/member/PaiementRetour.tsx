import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Hourglass, X } from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { euros, frenchDay, monthsLabel, useMyDues, usePayment, verifyCardPayment } from '../../lib/dues'
import { frenchSpaces } from '../../lib/format'
import { useMe } from '../../lib/queries'

type View = 'verif' | 'confirme' | 'attente' | 'echec'

const TRIES = 20

/** Le retour de HelloAsso : on demande au serveur, qui demande à HelloAsso. Le téléphone seul ne confirme rien. */
export function PaiementRetour() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const me = useMe().data
  const payment = usePayment(id)
  const dues = useMyDues()
  const [view, setView] = useState<View>('verif')
  const [error, setError] = useState<unknown>(null)
  const [slow, setSlow] = useState(false)
  const tries = useRef(0)
  // HelloAsso ajoute « code=succeeded » au retour d'un paiement réussi, « error » sinon.
  const abandoned = params.has('error') || (params.has('code') && params.get('code') !== 'succeeded')

  useEffect(() => {
    if (!id) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function check() {
      try {
        const status = await verifyCardPayment(id!)
        if (stop) return
        setError(null)
        if (status === 'confirme') {
          setView('confirme')
          await queryClient.invalidateQueries({ queryKey: ['cotisation'] })
          return
        }
        if (status === 'echec' || status === 'annule') {
          setView('echec')
          return
        }
        setView('attente')
      } catch (e) {
        if (!stop) setError(e)
      }
      tries.current += 1
      if (stop) return
      if (tries.current < TRIES) timer = setTimeout(check, 3000)
      else setSlow(true)
    }
    check()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [id, queryClient])

  if (payment.isPending) return <PageLoader />
  const p = payment.data
  if (!p) {
    return (
      <div className="flex flex-1 flex-col gap-4 bg-surface px-5 pt-[max(env(safe-area-inset-top),24px)]">
        <ErrorNote error="Ce paiement est introuvable." />
        <ButtonLink to="/app/cotisation" variant="outline">
          Retour à ma cotisation
        </ButtonLink>
      </div>
    )
  }

  const shown: View = view === 'attente' && abandoned ? 'echec' : view
  const label = monthsLabel(p.months)
  const head = {
    verif: { icon: <Hourglass className="size-8" />, box: 'bg-safran-pale text-[#163F93]', title: 'Paiement en cours de confirmation', text: 'HelloAsso nous confirme ton paiement. Ça prend quelques secondes, tu peux rester sur cette page.' },
    attente: { icon: <Hourglass className="size-8" />, box: 'bg-safran-pale text-[#163F93]', title: 'Paiement en cours de confirmation', text: 'HelloAsso nous confirme ton paiement. Ça prend quelques secondes, tu peux rester sur cette page.' },
    echec: { icon: <X className="size-8" strokeWidth={2.6} />, box: 'bg-danger-soft text-danger', title: 'Paiement non terminé', text: "Rien n'a été débité et aucun mois n'est compté. Tu peux réessayer quand tu veux." },
    confirme: {
      icon: <Check className="size-9" strokeWidth={3} />,
      box: 'bg-gn-vert text-white',
      title: frenchSpaces(`Merci ${me?.profile.first_name ?? ''} !`),
      text: dues.data?.paid_until ? `Ta cotisation est à jour jusqu'au ${frenchDay(dues.data.paid_until)}.` : 'Ton paiement est bien reçu.',
    },
  }[shown]

  return (
    <div className="flex flex-1 flex-col bg-surface lg:mx-auto lg:my-10 lg:w-full lg:max-w-[480px] lg:flex-none lg:rounded-[12px]">
      <div className="flex flex-1 flex-col gap-6 px-5 pt-[max(env(safe-area-inset-top),40px)] pb-6 lg:pt-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className={`grid size-[76px] place-items-center rounded-full ${head.box} ${shown === 'verif' || shown === 'attente' ? 'animate-pulse' : ''}`} aria-hidden="true">
            {head.icon}
          </span>
          {shown === 'confirme' ? <p className="m-0 text-sm font-bold text-ok">Paiement réussi</p> : null}
          <h1 className="titre m-0 text-[28px] leading-tight" aria-live="polite">
            {head.title}
          </h1>
          <p className="m-0 max-w-[340px] text-[15px] leading-[1.5] text-muted">{head.text}</p>
        </div>

        {shown === 'confirme' && p.receipt_number ? (
          <Link to={`/app/cotisation/quittances/${p.receipt_number}`} className="flex items-center gap-3 rounded-[12px] border-[1.5px] border-line-soft p-4 text-ink no-underline hover:bg-surface-2">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-select text-[11px] font-extrabold text-link">PDF</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold">Quittance n° {p.receipt_number}</span>
              <span className="truncate text-[13px] text-muted">
                {label} · {euros(p.amount_cents)} · carte
              </span>
              <span className="text-xs font-semibold text-ok">Dans ta conversation AEGB</span>
            </span>
            <ChevronRight className="size-5 text-muted" />
          </Link>
        ) : (
          <div className="flex items-center gap-3 rounded-[12px] bg-surface-2 p-4">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold">{label}</span>
              <span className="text-[13px] text-muted">{shown === 'echec' ? `${p.months.length} × ${euros(p.monthly_cents)} · carte bancaire` : 'En attente de HelloAsso'}</span>
            </span>
            <span className="titre text-[22px]">{euros(p.amount_cents)}</span>
          </div>
        )}

        {shown === 'attente' && slow ? (
          <p className="m-0 text-center text-sm text-muted">C'est plus long que d'habitude. Tu peux fermer l'appli : ton paiement sera compté dès que HelloAsso l'aura confirmé.</p>
        ) : shown === 'verif' || shown === 'attente' ? (
          <p className="m-0 text-center text-sm text-muted">Tu peux aussi fermer l'appli : ton paiement sera compté dès que HelloAsso l'aura confirmé.</p>
        ) : null}
        <ErrorNote error={error} />

        <div className="mt-auto flex flex-col gap-2.5">
          {shown === 'echec' ? (
            <>
              <ButtonLink to="/app/cotisation/payer">Réessayer le paiement</ButtonLink>
              <ButtonLink to="/app/cotisation" variant="outline">
                Retour à ma cotisation
              </ButtonLink>
              <p className="m-0 mt-2 text-center text-[13px] leading-[1.45] text-muted">
                Ta banque a quand même débité ton compte ? Écris au bureau dans la <Link to="/app/messages">conversation AEGB</Link>.
              </p>
            </>
          ) : shown === 'confirme' ? (
            <>
              <ButtonLink to="/app/cotisation">Retour à ma cotisation</ButtonLink>
              <ButtonLink to="/app/fil" variant="outline">
                Aller au fil
              </ButtonLink>
            </>
          ) : (
            <ButtonLink to="/app/cotisation" variant="outline">
              Retour à ma cotisation
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  )
}
