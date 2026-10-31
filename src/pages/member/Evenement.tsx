import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Ban, CalendarPlus, Check, ChevronLeft, ChevronRight, CreditCard, Lock, MapPin, Share2, Ticket, Users, Video, Vote } from 'lucide-react'
import { Button, ButtonLink } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { Faces, EventCover } from '../../components/events/EventParts'
import { ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { Logo } from '../../components/Logo'
import { useToast } from '../../components/Toast'
import { euros, frenchDay, METHOD_LABELS, useCardPayments } from '../../lib/dues'
import { capitalize, day, dayMonth, hour } from '../../lib/elections'
import { errorMessage } from '../../lib/errors'
import { downloadIcs, goingLine, hasStarted, isFull, isPast, mapUrl, rank, startEventPayment, useEvent, useEventActions, whenLong, type EventDetail } from '../../lib/events'
import { frenchSpaces } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { useMe } from '../../lib/queries'

function InfoRow({ icon, main, sub }: { icon: ReactNode; main: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-leppi">{icon}</span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className="text-[15px] font-bold">{main}</span>
        {sub ? <span className="text-[13px] text-muted">{sub}</span> : null}
      </span>
    </div>
  )
}

function payWays(e: EventDetail): string {
  if (e.pay_in_app && e.pay_on_site) return 'Dans l’appli, ou à l’entrée en espèces'
  return e.pay_in_app ? 'Dans l’appli, avant l’événement' : 'À l’entrée, en espèces'
}

function placesRow(e: EventDetail) {
  if (e.assembly_id) return <InfoRow icon={<Users className="size-5" />} main={`${e.going} membre${e.going > 1 ? 's' : ''} ${e.going > 1 ? 'viennent' : 'vient'} en salle`} sub="Tu peux aussi voter à distance" />
  if (e.capacity == null) return <InfoRow icon={<Users className="size-5" />} main={`${e.going} participant${e.going > 1 ? 's' : ''}`} sub="Places sans limite" />
  if (isFull(e)) {
    return <InfoRow icon={<Users className="size-5" />} main={`${e.going} participants sur ${e.capacity} places`} sub={`Complet${e.waiting ? ` · ${e.waiting} sur la liste d’attente` : ''}`} />
  }
  const left = e.capacity - e.going
  return <InfoRow icon={<Users className="size-5" />} main={`${e.going} participant${e.going > 1 ? 's' : ''} sur ${e.capacity} places`} sub={`Il reste ${left} place${left > 1 ? 's' : ''}`} />
}

/** Le prix, ma place à payer, ou ma place payée. */
function PriceBlock({ e, onPay, paying, cardReady }: { e: EventDetail; onPay: () => void; paying: boolean; cardReady: boolean }) {
  if (e.member_price_cents <= 0) return null
  const price = euros(e.member_price_cents)
  if (e.mine?.status === 'inscrit' && e.payment) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-ok-soft p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gn-vert text-white">
          <Check className="size-5" strokeWidth={2.8} />
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="text-[15px] font-extrabold text-ok">Place payée · {euros(e.payment.amount_cents)}</span>
          <span className="text-[13px] text-ink">
            {e.payment.paid_on ? `Le ${frenchDay(e.payment.paid_on)}, ` : ''}
            {e.payment.method === 'carte' ? 'dans l’appli' : (METHOD_LABELS[e.payment.method as keyof typeof METHOD_LABELS] ?? e.payment.method).toLowerCase()} ·{' '}
            <Link to="/app/messages" className="font-bold text-ok">
              Reçu dans AEGB
            </Link>
          </span>
        </span>
      </div>
    )
  }
  if (e.mine?.status === 'inscrit' && e.status === 'publie' && !isPast(e)) {
    const inApp = e.pay_in_app && cardReady
    return (
      <div className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-[#F5D46B] bg-[#FFF8E0] p-3">
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-safran text-white">
            <Ticket className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col gap-px">
            <span className="text-[15px] font-extrabold">Ta place : {price}</span>
            <span className="text-[13px] text-[#4A3A00]">{e.pay_in_app && !cardReady ? (e.pay_on_site ? 'À l’entrée, en espèces (la carte arrive bientôt)' : 'Le paiement par carte arrive bientôt') : payWays(e)}</span>
          </span>
        </span>
        {inApp ? (
          <Button size="md" busy={paying} icon={<CreditCard className="size-[18px]" />} onClick={onPay}>
            Payer {price} dans l’appli
          </Button>
        ) : null}
      </div>
    )
  }
  const guest = e.guest_price_cents != null ? ` · ${euros(e.guest_price_cents)} pour un invité` : ''
  const ways = e.pay_in_app && e.pay_on_site ? 'Dans l’appli ou à l’entrée' : e.pay_in_app ? 'Dans l’appli' : 'À l’entrée'
  return <InfoRow icon={<Ticket className="size-5" />} main={`${price} pour un membre`} sub={`${ways}${guest}`} />
}

/** Le bouton du bas, et la petite ligne au-dessus. */
function useMainAction(e: EventDetail) {
  const { join, leave } = useEventActions()
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const busy = join.isPending || leave.isPending
  const run = (m: typeof join, okText: string) =>
    m.mutate(e.id, {
      onSuccess: () => {
        setConfirm(false)
        toast(okText)
      },
      onError: (err) => toast(errorMessage(err), 'error'),
    })

  const off = 'bg-surface-2 text-muted cursor-not-allowed'
  let label: ReactNode
  let tone = 'bg-primary text-primary-ink'
  let note: { text: string; tone?: string } | null = null
  let onClick: (() => void) | undefined
  let check = false

  if (e.status === 'annule') {
    label = 'Événement annulé'
    tone = off
  } else if (isPast(e)) {
    label = 'Événement terminé'
    tone = off
  } else if (e.assembly_id) {
    const inRoom = e.mine?.status === 'inscrit'
    label = inRoom ? 'Je viens en salle' : 'Je viens en salle ?'
    tone = inRoom ? 'bg-ok-soft text-ok font-extrabold' : tone
    check = inRoom
    note = { text: inRoom ? 'Merci, ça aide le bureau à préparer la salle' : 'Ça sert seulement à préparer la salle' }
    onClick = hasStarted(e) ? undefined : () => (inRoom ? run(leave, 'C’est noté : tu ne viens pas en salle.') : run(join, 'C’est noté : tu viens en salle.'))
    if (hasStarted(e)) tone = inRoom ? tone : off
  } else if (hasStarted(e)) {
    label = e.mine?.status === 'inscrit' ? 'J’y vais' : 'C’est en cours'
    tone = e.mine?.status === 'inscrit' ? 'bg-ok-soft text-ok font-extrabold' : off
    check = e.mine?.status === 'inscrit'
    note = { text: 'Les inscriptions sont fermées depuis le début' }
  } else if (e.mine?.status === 'inscrit') {
    label = 'J’y vais'
    tone = 'bg-ok-soft text-ok font-extrabold'
    check = true
    note = { text: 'Le compte AEGB te le rappellera la veille à 18 h' }
    onClick = () => setConfirm(true)
  } else if (e.mine?.status === 'attente') {
    label = 'Quitter la liste d’attente'
    tone = 'border-[1.5px] border-line bg-surface text-ink'
    note = { text: `Tu es ${rank(e.mine.rank ?? 1)} sur la liste d’attente, on te prévient`, tone: 'text-[#163F93]' }
    onClick = () => run(leave, 'Tu as quitté la liste d’attente.')
  } else if (e.up_to_date_only && !e.dues_ok) {
    label = 'Je participe'
    tone = off
  } else if (isFull(e)) {
    label = 'Rejoindre la liste d’attente'
    tone = 'bg-safran text-white font-extrabold'
    note = { text: 'Si une place se libère, la 1re personne de la liste la prend' }
    onClick = () => run(join, 'Tu es sur la liste d’attente.')
  } else {
    label = 'Je participe'
    if (e.capacity != null) {
      const left = e.capacity - e.going
      note = { text: left <= 10 ? `Il reste ${left} place${left > 1 ? 's' : ''}, inscris-toi vite` : `${left} places libres` }
    }
    onClick = () => run(join, e.member_price_cents > 0 ? 'C’est noté ! Il te reste à payer ta place.' : 'C’est noté, tu y vas !')
  }

  const button = (
    <button type="button" onClick={onClick} disabled={!onClick || busy} aria-busy={busy || undefined} className={`flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl text-base font-bold transition ${tone} ${onClick ? '' : 'cursor-default'}`}>
      {check ? <Check className="size-5" strokeWidth={2.8} /> : null}
      {label}
    </button>
  )

  const dialog = (
    <Dialog
      open={confirm}
      onClose={() => setConfirm(false)}
      title="Tu ne viens plus ?"
      description={
        e.payment
          ? `Ta place sera libérée. Tu avais payé ${euros(e.payment.amount_cents)} : le trésorier te rembourse.`
          : 'Ta place sera libérée pour la première personne de la liste d’attente.'
      }
      footer={
        <>
          <Button variant="outline" size="md" className="flex-1" onClick={() => setConfirm(false)}>
            Je viens toujours
          </Button>
          <Button variant="danger" size="md" className="flex-1" busy={leave.isPending} onClick={() => run(leave, 'C’est noté, tu ne viens plus.')}>
            Me désinscrire
          </Button>
        </>
      }
    >
      <p className="m-0 text-[15px]">{e.title}, {whenLong(e).replace(/^\S/, (c) => c.toLowerCase())}.</p>
    </Dialog>
  )

  return { button, note, dialog }
}

function share(e: EventDetail, toast: (m: string, t?: 'ok' | 'error') => void) {
  const url = window.location.href
  if (navigator.share) {
    navigator.share({ title: e.title, text: `${e.title}, ${whenLong(e)}`, url }).catch(() => {})
    return
  }
  navigator.clipboard?.writeText(url).then(
    () => toast('Lien copié : seuls les membres connectés peuvent l’ouvrir.'),
    () => toast('Copie impossible sur ce navigateur.', 'error'),
  )
}

/** Le détail d'un événement : où, quand, combien, qui y va, et le bouton « Je participe ». */
export function Evenement() {
  const { id } = useParams()
  const q = useEvent(id)
  const me = useMe().data
  const desktop = useIsDesktop()
  const navigate = useNavigate()
  const toast = useToast()
  const card = useCardPayments()
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<unknown>(null)

  if (q.isPending) return <PageLoader />
  if (q.error || !q.data) {
    return (
      <div className="flex flex-1 flex-col gap-4 bg-surface px-5 pt-[max(env(safe-area-inset-top),24px)] lg:mx-auto lg:my-10 lg:w-full lg:max-w-[560px] lg:flex-none lg:rounded-[12px] lg:pb-6">
        <ErrorNote error={q.error ?? 'Cet événement n’existe plus.'} />
        <ButtonLink to="/app/evenements" variant="outline">
          Retour aux événements
        </ButtonLink>
      </div>
    )
  }
  return <Detail e={q.data} uid={me?.profile.id} desktop={desktop} cardReady={!!card.data?.ready} paying={paying} payError={payError} onBack={() => navigate('/app/evenements')} onShare={() => share(q.data!, toast)} onPay={async () => {
    setPaying(true)
    setPayError(null)
    try {
      window.location.assign(await startEventPayment(q.data!.id))
    } catch (err) {
      setPayError(err)
      setPaying(false)
    }
  }} />
}

type DetailProps = { e: EventDetail; uid: string | undefined; desktop: boolean; cardReady: boolean; paying: boolean; payError: unknown; onBack: () => void; onShare: () => void; onPay: () => void }

function Detail({ e, uid, desktop, cardReady, paying, payError, onBack, onShare, onPay }: DetailProps) {
  const { button, note, dialog } = useMainAction(e)
  const ag = e.assembly
  const kicker = ag ? `${day(e.starts_at)} · ${hour(e.starts_at)}` : whenLong(e).replace(', ', ' · ')

  const where = e.online ? (
    <InfoRow
      icon={<Video className="size-5" />}
      main="En ligne"
      sub={
        e.link && e.mine?.status === 'inscrit' ? (
          <a href={e.link} target="_blank" rel="noopener noreferrer" className="font-bold text-leppi underline underline-offset-2">
            Rejoindre la visio
          </a>
        ) : (
          'Le lien s’affiche après ton inscription'
        )
      }
    />
  ) : e.place ? (
    <InfoRow
      icon={<MapPin className="size-5" />}
      main={e.place}
      sub={
        <a href={mapUrl(e.place)} target="_blank" rel="noopener noreferrer" className="font-bold text-leppi underline underline-offset-2">
          Voir le plan
        </a>
      }
    />
  ) : null

  const sheet = (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-extrabold tracking-[0.6px] text-gn-rouge uppercase">{kicker}</span>
        <h1 className="titre m-0 text-[27px] leading-[1.1] lg:text-[32px]">{e.title}</h1>
        <span className="flex items-center gap-2 text-[13px] text-muted">
          {ag ? (
            ag.convocation === 2 ? 'Seconde convocation, par le bureau' : 'Convoquée par le bureau'
          ) : (
            <>
              <Logo size={22} /> Organisé par le bureau de l’AEGB
            </>
          )}
        </span>
      </div>

      {e.status === 'annule' ? (
        <div className="flex gap-2.5 rounded-2xl bg-danger-soft px-3.5 py-3 text-[#8A0C20]">
          <Ban className="mt-px size-5 shrink-0" />
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-extrabold">Annulé par le bureau</span>
            {e.cancel_reason ? <span className="text-[13px] leading-[1.4] text-[#5C1420]">{frenchSpaces(e.cancel_reason)}</span> : null}
          </span>
        </div>
      ) : null}

      {e.status === 'publie' && e.up_to_date_only && !e.dues_ok && !e.mine && !isPast(e) ? (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-safran-pale px-3.5 py-3">
          <span className="flex gap-2.5 text-[#163F93]">
            <Lock className="mt-px size-[19px] shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-extrabold">Réservé aux membres à jour</span>
              <span className="text-[13px] leading-[1.4] text-[#4A3A00]">Ta cotisation n’est pas à jour. Dès qu’elle l’est, tu peux t’inscrire (article 8 des statuts).</span>
            </span>
          </span>
          <ButtonLink to="/app/cotisation/payer" size="md" icon={<CreditCard className="size-[18px]" />}>
            Régler ma cotisation
          </ButtonLink>
        </div>
      ) : null}

      {where}
      {placesRow(e)}
      {ag ? null : <PriceBlock e={e} onPay={onPay} paying={paying} cardReady={cardReady} />}
      <ErrorNote error={payError} />

      {ag ? (
        <div className="bg-tisse flex flex-col gap-2.5 rounded-[12px] p-3.5 text-white">
          <span className="flex items-center gap-2 text-[15px] font-extrabold">
            <Vote className="size-[19px]" /> Le vote se fait dans l’appli
          </span>
          <span className="text-[13px] leading-[1.45] text-white/86">
            De {hour(ag.vote_opens_at)} à {hour(ag.vote_closes_at)}, en salle ou à distance. « Je viens en salle » sert seulement à préparer la salle.
          </span>
          <ButtonLink to="/app/votes" variant="onblue" size="md">
            Voir l’assemblée générale
          </ButtonLink>
        </div>
      ) : null}

      {ag?.items.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-extrabold">Ordre du jour</span>
          <ol className="m-0 pl-5 text-[14px] leading-[1.5] text-ink">
            {ag.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </div>
      ) : e.description ? (
        <p className="m-0 text-[15px] leading-[1.5] whitespace-pre-line text-ink">{frenchSpaces(e.description)}</p>
      ) : null}

      {!ag && (e.going > 0 || e.waiting > 0) ? (
        <Link to={`/app/evenements/${e.id}/participants`} className="flex items-center gap-2.5 text-ink no-underline">
          <Faces faces={e.faces} />
          <span className="flex-1 text-[13px] text-muted">{goingLine(e, uid)}</span>
          <ChevronRight className="size-[18px] text-muted" />
        </Link>
      ) : null}
    </div>
  )

  const agenda = (
    <button type="button" onClick={() => downloadIcs([e])} aria-label="Ajouter à mon agenda" title="Ajouter à mon agenda" className="grid size-[52px] shrink-0 place-items-center rounded-2xl border-[1.5px] border-line text-ink hover:bg-surface-2">
      <CalendarPlus className="size-[22px]" />
    </button>
  )
  const noteLine = note ? <span className={`flex items-center justify-center gap-1.5 text-center text-[12px] font-semibold ${note.tone ?? 'text-muted'}`}>{note.text}</span> : null

  if (desktop) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-10 py-8">
        <Link to="/app/evenements" className="flex w-fit items-center gap-1.5 text-[14px] font-bold text-leppi no-underline">
          <ChevronLeft className="size-4" strokeWidth={2.4} /> Événements
        </Link>
        <div className="grid max-w-[1100px] grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
          <article className="overflow-hidden rounded-[12px] bg-surface">
            <EventCover event={e} className="h-[260px]" muted={e.status === 'annule'} />
            <div className="px-7 py-6">{sheet}</div>
          </article>
          <aside className="sticky top-8 flex flex-col gap-3 rounded-[12px] bg-surface p-5">
            <p className="m-0 text-[15px] font-extrabold">{capitalize(day(e.starts_at))}</p>
            <p className="m-0 -mt-2 text-[13px] text-muted">
              {hour(e.starts_at)}
              {e.ends_at ? ` à ${hour(e.ends_at)}` : ''} · {e.online ? 'en ligne' : e.place}
            </p>
            {noteLine}
            <div className="flex gap-2.5">
              {button}
              {agenda}
            </div>
            <Button variant="ghost" size="sm" icon={<Share2 className="size-4" />} onClick={onShare}>
              Partager
            </Button>
            {e.status === 'publie' && !isPast(e) && !e.assembly_id ? (
              <Note>Le compte AEGB écrit aux personnes inscrites la veille à 18 h, et si l’heure ou le lieu change.</Note>
            ) : null}
            {e.published_at ? <p className="m-0 text-center text-[12px] text-muted">Publié le {dayMonth(e.published_at)}</p> : null}
          </aside>
        </div>
        {dialog}
      </div>
    )
  }

  return (
    <div className="flex min-h-app flex-1 flex-col bg-surface">
      <div className="relative shrink-0">
        <EventCover event={e} className={ag ? 'h-[196px]' : 'h-[228px]'} muted={e.status === 'annule'} />
        <button type="button" onClick={onBack} aria-label="Retour aux événements" className="absolute top-[max(env(safe-area-inset-top),10px)] left-3 grid size-[42px] place-items-center rounded-full bg-nuit/50 text-white">
          <ChevronLeft className="size-[22px]" strokeWidth={2.2} />
        </button>
        <button type="button" onClick={onShare} aria-label="Partager l’événement" className="absolute top-[max(env(safe-area-inset-top),10px)] right-3 grid size-[42px] place-items-center rounded-full bg-nuit/50 text-white">
          <Share2 className="size-5" />
        </button>
      </div>
      <div className="relative -mt-6 flex flex-1 flex-col rounded-t-[12px] bg-surface px-5 pt-[22px] pb-4">{sheet}</div>
      <div className="sticky bottom-0 flex shrink-0 flex-col gap-2 border-t border-line-soft bg-surface px-5 pt-2.5 pb-[max(env(safe-area-inset-bottom),20px)]">
        {noteLine}
        <div className="flex gap-2.5">
          {button}
          {agenda}
        </div>
      </div>
      {dialog}
    </div>
  )
}
