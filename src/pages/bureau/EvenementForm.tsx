import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Check, ChevronLeft, ImagePlus, Info, Lock, MapPin, Send, Video } from 'lucide-react'
import { Button } from '../../components/Button'
import { DateBadge, EventBadge, EventCover } from '../../components/events/EventParts'
import { OfficialBadge } from '../../components/feed/PostCard'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { inputClass, TextArea, TextField } from '../../components/Field'
import { Logo } from '../../components/Logo'
import { Pill } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { euros } from '../../lib/dues'
import { day, isoToParis, parisToIso } from '../../lib/elections'
import { errorMessage } from '../../lib/errors'
import { cardLine, useEventActions, useEventAdmin, type AdminEvent, type EventCard, type EventDraft } from '../../lib/events'
import { shrinkImage } from '../../lib/images'
import { useIsDesktop } from '../../lib/media'
import { supabase } from '../../lib/supabase'
import { BureauPage, Card } from './BureauPage'

type Form = {
  title: string
  description: string
  date: string
  start: string
  end: string
  online: boolean
  place: string
  link: string
  limit: boolean
  capacity: string
  price: string
  guest: string
  payInApp: boolean
  payOnSite: boolean
  upToDate: boolean
  publicSite: boolean
}

function fromEvent(e: AdminEvent | undefined): Form {
  const start = e ? isoToParis(e.starts_at) : ''
  return {
    title: e?.title ?? '',
    description: e?.description ?? '',
    date: start.slice(0, 10),
    start: start.slice(11) || '19:00',
    end: e?.ends_at ? isoToParis(e.ends_at).slice(11) : '',
    online: e?.online ?? false,
    place: e?.place ?? '',
    link: e?.link ?? '',
    limit: e ? e.capacity != null : false,
    capacity: e?.capacity != null ? String(e.capacity) : '',
    price: e && e.member_price_cents > 0 ? (e.member_price_cents / 100).toString().replace('.', ',') : '',
    guest: e?.guest_price_cents != null ? (e.guest_price_cents / 100).toString().replace('.', ',') : '',
    payInApp: e?.pay_in_app ?? true,
    payOnSite: e?.pay_on_site ?? true,
    upToDate: e?.up_to_date_only ?? false,
    publicSite: e?.public_site ?? false,
  }
}

/** « 3 », « 3,50 » ou « 3.5 » en centimes ; null si vide, NaN si illisible. */
function cents(text: string): number | null {
  const t = text.trim().replace(/\s|€/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN
}

function check(f: Form): string | null {
  if (f.title.trim().length < 2) return 'Donne un titre à l’événement.'
  if (!f.date || !f.start) return 'Choisis la date et l’heure du début.'
  if (!f.online && f.place.trim().length < 2) return 'Indique le lieu.'
  if (f.online && !/^https?:\/\/\S+$/.test(f.link.trim())) return 'Colle le lien de la visio (il commence par https://).'
  if (f.limit && !(Number(f.capacity) >= 1)) return 'Indique le nombre de places.'
  const price = cents(f.price)
  if (Number.isNaN(price) || Number.isNaN(cents(f.guest))) return 'Écris le prix en euros, par exemple 5 ou 3,50.'
  if (price && !f.payInApp && !f.payOnSite) return 'Coche au moins une façon de payer.'
  return null
}

function toDraft(f: Form, photo: string | null): EventDraft {
  const starts = parisToIso(`${f.date}T${f.start}`)
  let ends: string | null = f.end ? parisToIso(`${f.date}T${f.end}`) : null
  // Une fin avant le début : c'est le lendemain (une soirée qui finit à 1 h).
  if (ends && new Date(ends) <= new Date(starts)) ends = new Date(new Date(ends).getTime() + 86_400_000).toISOString()
  const price = cents(f.price) ?? 0
  return {
    title: f.title.trim(),
    description: f.description.trim(),
    starts_at: starts,
    ends_at: ends,
    online: f.online,
    place: f.online ? null : f.place.trim(),
    link: f.online ? f.link.trim() : null,
    photo_path: photo,
    capacity: f.limit ? Number(f.capacity) : null,
    member_price_cents: price,
    guest_price_cents: price ? cents(f.guest) : null,
    pay_in_app: price ? f.payInApp : true,
    pay_on_site: price ? f.payOnSite : true,
    up_to_date_only: f.upToDate,
    public_site: f.publicSite,
  }
}

function Box({ checked, onChange, title, detail }: { checked: boolean; onChange: (v: boolean) => void; title: string; detail?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className={`mt-px grid size-[22px] shrink-0 place-items-center rounded-md peer-focus-visible:ring-[3px] peer-focus-visible:ring-safran/60 ${checked ? 'bg-leppi text-white' : 'border-2 border-line text-transparent'}`} aria-hidden="true">
        <Check className="size-3.5" strokeWidth={3.2} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[14px] font-bold">{title}</span>
        {detail ? <span className="text-[12px] leading-[1.4] text-muted">{detail}</span> : null}
      </span>
    </label>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-sm font-bold">{children}</span>
}

/** Créer un événement, ou modifier un événement qui existe. */
export default function EvenementForm() {
  const { id: existing } = useParams()
  const q = useEventAdmin(existing)
  if (existing && q.isPending) return <PageLoader />
  if (existing && (q.error || !q.data)) return <ErrorNote error={q.error ?? 'Cet événement n’existe plus.'} />
  return <Editor key={existing ?? 'nouveau'} event={q.data} />
}

function Editor({ event }: { event: AdminEvent | undefined }) {
  const desktop = useIsDesktop()
  const navigate = useNavigate()
  const toast = useToast()
  const { save } = useEventActions()
  const [id] = useState(() => event?.id ?? crypto.randomUUID())
  const [f, setF] = useState<Form>(() => fromEvent(event))
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setF((x) => ({ ...x, [key]: value }))
  const published = event?.status === 'publie'

  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo])

  async function pick(file: File | undefined) {
    if (!file) return
    try {
      const blob = await shrinkImage(file, 1600)
      setPhoto({ blob, url: URL.createObjectURL(blob) })
    } catch {
      toast('Cette photo ne s’ouvre pas. Choisis une photo JPEG ou PNG.', 'error')
    }
  }

  async function submit(publish: boolean) {
    const problem = check(f)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setBusy(publish ? 'publish' : 'draft')
    let uploaded: string | null = null
    try {
      let path = event?.photo_path ?? null
      if (photo) {
        uploaded = `evenements/${id}/photo-${Date.now()}.${photo.blob.type === 'image/webp' ? 'webp' : 'jpg'}`
        const up = await supabase.storage.from('publications').upload(uploaded, photo.blob, { contentType: photo.blob.type, upsert: false })
        if (up.error) throw up.error
        path = uploaded
      }
      await save.mutateAsync({ id, data: toDraft(f, path), publish: publish || published })
      // L'ancienne photo ne sert plus.
      if (uploaded && event?.photo_path) await supabase.storage.from('publications').remove([event.photo_path])
      toast(publish ? 'Publié : la carte est dans le fil.' : published ? 'Modifications enregistrées.' : 'Brouillon enregistré.')
      navigate(`/bureau/evenements/${id}`, { replace: true })
    } catch (e) {
      if (uploaded) await supabase.storage.from('publications').remove([uploaded])
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  const price = cents(f.price)
  const draft = (() => {
    try {
      return f.date && f.start ? toDraft(f, event?.photo_path ?? null) : null
    } catch {
      return null
    }
  })()
  const previewCard: EventCard | null = draft
    ? {
        ...draft,
        id,
        status: 'publie',
        assembly_id: null,
        post_id: null,
        cancel_reason: null,
        going: event?.going ?? 0,
        waiting: 0,
        faces: [],
        mine: null,
        paid: false,
        member_price_cents: Number.isNaN(price) ? 0 : (price ?? 0),
        guest_price_cents: null,
      }
    : null

  const form = (
    <Card className="flex flex-col gap-4 p-4 lg:px-6 lg:py-[22px]">
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-[18px]">
        <div className="flex flex-col gap-[7px]">
          <Label>Photo</Label>
          <button type="button" onClick={() => input.current?.click()} className="relative overflow-hidden rounded-[14px] text-left" aria-label="Choisir la photo de l’événement">
            {photo ? <img src={photo.url} alt="" className="block h-[132px] w-full object-cover" /> : <EventCover event={{ photo_path: event?.photo_path ?? null, assembly_id: null, title: f.title }} className="h-[132px]" />}
            <span className="absolute bottom-2.5 left-2.5 flex h-[30px] items-center gap-1.5 rounded-full bg-nuit/70 px-2.5 text-[12px] font-bold text-white">
              <ImagePlus className="size-3.5" /> {photo || event?.photo_path ? 'Changer' : 'Ajouter une photo'}
            </span>
          </button>
          <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pick(e.target.files?.[0]).then(() => (e.target.value = ''))} />
        </div>
        <div className="flex flex-col gap-3">
          <TextField label="Titre" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={100} placeholder="Soirée de fin de semestre" />
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
            <TextField label="Date" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
            <TextField label="Début" type="time" value={f.start} onChange={(e) => set('start', e.target.value)} />
            <TextField label="Fin" type="time" value={f.end} onChange={(e) => set('end', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Où</Label>
        <div role="radiogroup" aria-label="Où" className="flex w-max gap-1 rounded-xl bg-[#ECEEF5] p-1">
          {(
            [
              [false, 'Sur place', <MapPin key="p" className="size-4" />],
              [true, 'En ligne', <Video key="v" className="size-4" />],
            ] as const
          ).map(([online, label, icon]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={f.online === online}
              onClick={() => set('online', online)}
              className={`flex h-[34px] items-center gap-1.5 rounded-[9px] px-3.5 text-[13px] ${f.online === online ? 'bg-surface font-extrabold text-ink shadow-[0_1px_3px_rgba(18,22,43,0.12)]' : 'font-bold text-muted'}`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        {f.online ? (
          <input className={inputClass} value={f.link} onChange={(e) => set('link', e.target.value)} placeholder="https://…" aria-label="Lien de la visio" maxLength={300} />
        ) : (
          <input className={inputClass} value={f.place} onChange={(e) => set('place', e.target.value)} placeholder="Maison de l’étudiant, campus du Bouguen, Brest" aria-label="Lieu" maxLength={160} />
        )}
        <span className="text-[12px] text-muted">{f.online ? 'Le lien n’est montré qu’après l’inscription.' : 'Les membres pourront ouvrir l’adresse sur un plan.'}</span>
      </div>

      <TextArea label="Description" value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} counter placeholder="Ce qui est prévu, ce qu’il faut apporter…" />

      <div className="grid gap-[18px] lg:grid-cols-2">
        <div className="flex flex-col gap-2.5">
          <Box checked={f.limit} onChange={(v) => set('limit', v)} title="Limiter les places" detail="Quand c’est complet, une liste d’attente s’ouvre." />
          {f.limit ? (
            <span className="ml-8 flex items-center gap-2">
              <input className={`${inputClass} !h-[38px] w-[84px] text-center font-bold`} inputMode="numeric" value={f.capacity} onChange={(e) => set('capacity', e.target.value.replace(/\D/g, ''))} aria-label="Nombre de places" />
              <span className="text-[13px] text-muted">places</span>
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label>Prix (facultatif)</Label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex h-[42px] items-center gap-2 rounded-xl border-[1.5px] border-line bg-surface px-3 focus-within:border-primary">
              <span className="text-[13px] text-muted">Membre</span>
              <input value={f.price} onChange={(e) => set('price', e.target.value)} inputMode="decimal" placeholder="0" className="min-w-0 flex-1 bg-transparent text-right text-[14px] font-extrabold outline-none" />
              <span className="text-[14px] font-extrabold">€</span>
            </label>
            <label className={`flex h-[42px] items-center gap-2 rounded-xl border-[1.5px] border-line bg-surface px-3 focus-within:border-primary ${price ? '' : 'opacity-50'}`}>
              <span className="text-[13px] text-muted">Invité</span>
              <input value={f.guest} onChange={(e) => set('guest', e.target.value)} disabled={!price} inputMode="decimal" placeholder="–" className="min-w-0 flex-1 bg-transparent text-right text-[14px] font-extrabold outline-none" />
              <span className="text-[14px] font-extrabold">€</span>
            </label>
          </div>
          {price ? (
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="text-[13px] text-muted">Payer :</span>
              <Box checked={f.payInApp} onChange={(v) => set('payInApp', v)} title="Dans l’appli" />
              <Box checked={f.payOnSite} onChange={(v) => set('payOnSite', v)} title="Sur place" />
            </div>
          ) : (
            <span className="text-[12px] text-muted">Vide : l’événement est gratuit. Un invité paie toujours sur place.</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] bg-[#F5F6FB] px-4 py-3.5">
        <Box checked={f.upToDate} onChange={(v) => set('upToDate', v)} title="Réservé aux membres à jour de leur cotisation" detail="Article 8 des statuts. Les autres voient l’événement, avec le bouton pour régler leur cotisation." />
        <Box checked={f.publicSite} onChange={(v) => set('publicSite', v)} title="Montrer sur le site public" detail="Titre, date, lieu et photo seulement, jamais les participants." />
      </div>
    </Card>
  )

  const when = draft ? day(new Date(new Date(draft.starts_at).getTime() - 86_400_000)) : null
  const pay = price ? `, et paieront ${euros(price)}${f.payInApp && f.payOnSite ? ' dans l’appli ou sur place' : f.payInApp ? ' dans l’appli' : ' sur place'}` : ''

  const preview = (
    <Card className="flex flex-col gap-3 px-[18px] py-[18px]">
      <span className="text-[12px] font-extrabold tracking-[0.8px] text-muted uppercase">Aperçu dans le fil</span>
      <div className="flex flex-col overflow-hidden rounded-[12px] border-[1.5px] border-line-soft">
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <Logo size={36} />
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[14px] font-extrabold">
              Bureau de l’AEGB <OfficialBadge />
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              À l’instant · <EventBadge />
            </span>
          </span>
        </div>
        <div className="relative">
          {photo ? <img src={photo.url} alt="" className="block h-[120px] w-full object-cover" /> : <EventCover event={{ photo_path: event?.photo_path ?? null, assembly_id: null, title: f.title }} className="h-[120px]" />}
          {previewCard ? (
            <span className="absolute top-3 left-3">
              <DateBadge date={previewCard.starts_at} size={46} />
            </span>
          ) : null}
          {f.upToDate ? (
            <span className="absolute top-3 right-3">
              <Pill tone="safran" icon={<Lock className="size-3" />}>
                Membres à jour
              </Pill>
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2.5 px-3.5 pt-3 pb-3.5">
          <span className="flex flex-col gap-0.5">
            <span className="text-[17px] font-extrabold">{f.title || 'Titre de l’événement'}</span>
            <span className="text-[13px] text-muted">{previewCard ? cardLine(previewCard) : 'Date, heure et lieu'}</span>
          </span>
          <span className="flex items-center justify-between">
            <span className="text-[13px] text-muted">{f.limit && f.capacity ? `0 sur ${f.capacity} places` : '0 participant'}</span>
            <span className="flex h-9 items-center rounded-xl bg-primary px-3 text-[13px] font-bold text-primary-ink">Je participe</span>
          </span>
        </div>
      </div>
    </Card>
  )

  const info = (
    <Card className="px-4 py-3.5">
      <span className="flex gap-2.5 text-[13px] leading-[1.5] text-ink">
        <Info className="mt-px size-[18px] shrink-0 text-leppi" />
        <span>
          {published
            ? 'Si la date, l’heure ou le lieu changent, chaque personne inscrite reçoit un message du compte AEGB qui dit ce qui a changé.'
            : 'À la publication, la carte arrive dans le fil et dans l’onglet Événements.'}{' '}
          {when ? (
            <>
              Les personnes inscrites recevront un rappel du compte AEGB le <b>{when} à 18 h</b>
              {pay}.
            </>
          ) : null}
        </span>
      </span>
    </Card>
  )

  const buttons = (
    <div className="flex flex-wrap justify-end gap-2.5">
      {published ? (
        <Button size="md" busy={busy === 'draft'} icon={<Check className="size-[18px]" />} onClick={() => submit(false)}>
          Enregistrer les changements
        </Button>
      ) : (
        <>
          <Button variant="outline" size="md" busy={busy === 'draft'} disabled={!!busy} onClick={() => submit(false)}>
            Enregistrer le brouillon
          </Button>
          <Button size="md" busy={busy === 'publish'} disabled={!!busy} icon={<Send className="size-[18px]" />} onClick={() => submit(true)}>
            Publier
          </Button>
        </>
      )}
    </div>
  )

  const title = event ? 'Modifier l’événement' : 'Créer un événement'
  const subtitle = event ? event.title : 'Tu peux l’enregistrer en brouillon et le publier plus tard.'

  if (desktop) {
    return (
      <div className="flex flex-col gap-[18px]">
        <Link to={event ? `/bureau/evenements/${event.id}` : '/bureau/evenements'} className="-mb-2 flex w-fit items-center gap-1.5 text-[14px] font-bold text-leppi no-underline">
          <ChevronLeft className="size-4" strokeWidth={2.4} /> Événements
        </Link>
        <div>
          <h1 className="titre m-0 text-[34px] leading-tight">{title}</h1>
          <p className="mt-1 mb-0 text-[15px] text-muted">{subtitle}</p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-5">
          {form}
          <div className="sticky top-8 flex flex-col gap-3.5">
            {preview}
            {info}
            <ErrorNote error={error ? (typeof error === 'string' ? error : errorMessage(error)) : null} />
            {buttons}
          </div>
        </div>
      </div>
    )
  }

  return (
    <BureauPage title={title} subtitle={subtitle} back={event ? `/bureau/evenements/${event.id}` : '/bureau/evenements'}>
      {form}
      {info}
      <ErrorNote error={error ? (typeof error === 'string' ? error : errorMessage(error)) : null} />
      {buttons}
    </BureauPage>
  )
}
