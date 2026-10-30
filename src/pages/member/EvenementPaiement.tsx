import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Hourglass, X } from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { euros, verifyCardPayment } from '../../lib/dues'
import { useEventPayment } from '../../lib/events'
import { frenchSpaces } from '../../lib/format'
import { useMe } from '../../lib/queries'

type View = 'verif' | 'confirme' | 'attente' | 'echec'

const TRIES = 20

/** Le retour de HelloAsso après le paiement d'une place : le serveur demande à HelloAsso, le téléphone seul ne confirme rien. */
export function EvenementPaiement() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const me = useMe().data
  const payment = useEventPayment(id)
  const [view, setView] = useState<View>('verif')
  const [error, setError] = useState<unknown>(null)
  const [slow, setSlow] = useState(false)
  const tries = useRef(0)
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
          await queryClient.invalidateQueries({ queryKey: ['evenements'] })
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
        <ButtonLink to="/app/evenements" variant="outline">
          Retour aux événements
        </ButtonLink>
      </div>
    )
  }

  const shown: View = view === 'attente' && abandoned ? 'echec' : view
  const back = `/app/evenements/${p.event}`
  const head = {
    verif: { icon: <Hourglass className="size-8" />, box: 'bg-safran-pale text-[#6B4A00]', title: 'Paiement en cours de confirmation', text: 'HelloAsso nous confirme ton paiement. Ça prend quelques secondes, tu peux rester sur cette page.' },
    attente: { icon: <Hourglass className="size-8" />, box: 'bg-safran-pale text-[#6B4A00]', title: 'Paiement en cours de confirmation', text: 'HelloAsso nous confirme ton paiement. Ça prend quelques secondes, tu peux rester sur cette page.' },
    echec: { icon: <X className="size-8" strokeWidth={2.6} />, box: 'bg-danger-soft text-danger', title: 'Paiement non terminé', text: 'Rien n’a été débité. Ta place reste à toi : tu peux réessayer, ou payer à l’entrée si c’est possible.' },
    confirme: { icon: <Check className="size-9" strokeWidth={3} />, box: 'bg-gn-vert text-white', title: frenchSpaces(`Merci ${me?.profile.first_name ?? ''} !`), text: 'Ta place est payée. Le reçu est dans ta conversation AEGB.' },
  }[shown]

  return (
    <div className="flex flex-1 flex-col bg-surface lg:mx-auto lg:my-10 lg:w-full lg:max-w-[480px] lg:flex-none lg:rounded-[26px]">
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

        <div className="flex items-center gap-3 rounded-[18px] bg-surface-2 p-4">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] font-bold">{p.title}</span>
            <span className="text-[13px] text-muted">{shown === 'confirme' ? 'Ta place · carte bancaire' : shown === 'echec' ? 'Ta place · carte bancaire' : 'En attente de HelloAsso'}</span>
          </span>
          <span className="titre text-[22px]">{euros(p.amount_cents)}</span>
        </div>

        {shown === 'attente' && slow ? (
          <p className="m-0 text-center text-sm text-muted">C’est plus long que d’habitude. Tu peux fermer l’appli : ta place sera comptée payée dès que HelloAsso l’aura confirmé.</p>
        ) : shown === 'verif' || shown === 'attente' ? (
          <p className="m-0 text-center text-sm text-muted">Tu peux aussi fermer l’appli : ta place sera comptée payée dès que HelloAsso l’aura confirmé.</p>
        ) : null}
        <ErrorNote error={error} />

        <div className="mt-auto flex flex-col gap-2.5">
          <ButtonLink to={back} variant={shown === 'confirme' ? 'primary' : 'outline'}>
            {shown === 'echec' ? 'Retour à l’événement pour réessayer' : 'Retour à l’événement'}
          </ButtonLink>
          {shown === 'confirme' ? (
            <ButtonLink to="/app/messages" variant="outline">
              Voir le reçu dans AEGB
            </ButtonLink>
          ) : null}
          {shown === 'echec' ? (
            <p className="m-0 mt-2 text-center text-[13px] leading-[1.45] text-muted">
              Ta banque a quand même débité ton compte ? Écris au bureau dans la <Link to="/app/messages">conversation AEGB</Link>.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
