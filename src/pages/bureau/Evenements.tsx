import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Ban, CalendarDays, Check, ChevronRight, CircleDollarSign, Download, FileSpreadsheet, FileText, Hourglass, MessageSquare, Pencil, Plus, Send, Trash2, Users } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button, ButtonLink } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { DateBadge, EventCover } from '../../components/events/EventParts'
import { EmptyState, ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { SearchField, TextArea } from '../../components/Field'
import { Pill } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { downloadCsv } from '../../lib/csv'
import { euros, METHOD_LABELS } from '../../lib/dues'
import { capitalize, dayMonth, dayShort } from '../../lib/elections'
import { downloadEmargement } from '../../lib/emargementPdf'
import { errorMessage } from '../../lib/errors'
import { cardLine, hasStarted, isFull, isPast, reminderDay, useEventActions, useEventAdmin, useEventsAdmin, whenLong, type AdminCard, type AdminEvent, type AdminPerson, type EventDraft } from '../../lib/events'
import { TYPE_LABELS } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { can, useMe } from '../../lib/queries'
import { BureauPage, Card } from './BureauPage'

/* ----------------------------------------------------------------------------
   La liste, rangée en trois : à venir, brouillons, passés
---------------------------------------------------------------------------- */

function groups(list: AdminCard[]) {
  const now = Date.now()
  return [
    { title: 'À venir', items: list.filter((e) => e.status !== 'brouillon' && !isPast(e, now)) },
    { title: 'Brouillons', items: list.filter((e) => e.status === 'brouillon') },
    { title: 'Passés', items: list.filter((e) => e.status !== 'brouillon' && isPast(e, now)).reverse() },
  ].filter((g) => g.items.length)
}

function ListItem({ e, on }: { e: AdminCard; on: boolean }) {
  const past = isPast(e)
  let right: ReactNode = <span className="text-[12px] font-bold text-muted">{e.capacity ? `${e.going}/${e.capacity}` : e.going}</span>
  if (e.status === 'brouillon') right = <Pill>Brouillon</Pill>
  else if (e.status === 'annule') right = <Pill tone="danger">Annulé</Pill>
  else if (e.assembly_id) right = <Pill tone="brand">AG</Pill>
  else if (!past && isFull(e)) right = <Pill tone="danger">Complet</Pill>
  else if (past) right = null
  const line = e.status === 'brouillon' ? 'Pas encore publié' : e.assembly_id ? 'Ajoutée à la convocation' : past ? `${e.present} présent${e.present > 1 ? 's' : ''} sur ${e.going}` : cardLine(e)
  return (
    <Link
      to={`/bureau/evenements/${e.id}`}
      aria-current={on || undefined}
      className={`flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-ink no-underline ${on ? 'bg-[#F1F3FB] shadow-[inset_3px_0_0_var(--color-safran)]' : 'hover:bg-surface-2'} ${past ? 'opacity-75' : ''}`}
    >
      <DateBadge date={e.starts_at} size={40} muted={past} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14px] font-extrabold">{e.title}</span>
        <span className="truncate text-[12px] text-muted">{line}</span>
      </span>
      {right}
    </Link>
  )
}

function EventList({ list, selected }: { list: AdminCard[]; selected?: string }) {
  const gs = groups(list)
  if (!gs.length) {
    return (
      <EmptyState title="Aucun événement" icon={<CalendarDays className="size-6" />}>
        Crée le premier : il arrivera dans le fil et dans l’onglet Événements des membres.
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      {gs.map((g, i) => (
        <div key={g.title} className="flex flex-col gap-1">
          <span className={`px-3 text-[12px] font-extrabold tracking-[0.8px] text-muted uppercase ${i ? 'pt-2' : ''}`}>{g.title}</span>
          {g.items.map((e) => (
            <ListItem key={e.id} e={e} on={e.id === selected} />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------------------
   Le détail d'un événement
---------------------------------------------------------------------------- */

function Stat({ icon, tone, label, value, detail }: { icon: ReactNode; tone: string; label: string; value: ReactNode; detail: string }) {
  return (
    <div className="flex flex-col gap-[5px] rounded-2xl bg-[#F5F6FB] px-4 py-3.5">
      <span className={`flex items-center gap-2 text-[13px] font-bold ${tone}`}>
        <span className="grid size-6 place-items-center rounded-[7px] bg-current/12">{icon}</span>
        {label}
      </span>
      <span className="titre text-[24px] leading-none text-ink">{value}</span>
      <span className="text-[12px] text-muted">{detail}</span>
    </div>
  )
}

function duesWord(p: AdminPerson): string {
  const type = TYPE_LABELS[p.member_type]
  if (p.walk_in) return `${type} · sans inscription`
  if (p.dues_status === 'a_jour') return `${type} · à jour`
  if (p.dues_status === 'retard') return `${type} · en retard`
  return type
}

type Tab = 'inscrits' | 'attente' | 'a_regler' | 'presents'

function toDraft(e: AdminEvent): EventDraft {
  return {
    title: e.title,
    description: e.description,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    online: e.online,
    place: e.place,
    link: e.link,
    photo_path: e.photo_path,
    capacity: e.capacity,
    member_price_cents: e.member_price_cents,
    guest_price_cents: e.guest_price_cents,
    pay_in_app: e.pay_in_app,
    pay_on_site: e.pay_on_site,
    up_to_date_only: e.up_to_date_only,
    public_site: e.public_site,
  }
}

function exportCsv(e: AdminEvent) {
  const rows = e.people.map((p) => [
    p.last_name,
    p.first_name,
    p.status === 'inscrit' ? (p.walk_in ? 'Sans inscription' : 'Place confirmée') : 'Liste d’attente',
    TYPE_LABELS[p.member_type],
    p.dues_status === 'a_jour' ? 'À jour' : p.dues_status === 'retard' ? 'En retard' : '',
    e.member_price_cents > 0 ? (p.payment ? (p.payment.method === 'carte' ? 'Dans l’appli' : METHOD_LABELS[p.payment.method as keyof typeof METHOD_LABELS] ?? p.payment.method) : 'À régler') : 'Gratuit',
    p.payment ? (p.payment.amount_cents / 100).toFixed(2).replace('.', ',') : '',
    new Date(p.registered_at).toLocaleDateString('fr-FR'),
    p.present ? 'Oui' : '',
  ])
  downloadCsv(`inscriptions-${e.starts_at.slice(0, 10)}.csv`, ['Nom', 'Prénom', 'Statut', 'Type', 'Cotisation', 'Paiement', 'Montant (€)', 'Date d’inscription', 'Présent'], rows)
}

function ExportMenu({ e }: { e: AdminEvent }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (ev: MouseEvent) => !ref.current?.contains(ev.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="md" icon={<Download className="size-[18px]" />} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Exporter
      </Button>
      {open ? (
        <div role="menu" className="absolute top-12 left-0 z-20 flex w-[290px] flex-col rounded-[14px] bg-surface p-1.5 shadow-[0_10px_30px_rgba(18,22,43,0.18)]">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              exportCsv(e)
              setOpen(false)
            }}
            className="flex gap-2.5 rounded-[10px] p-2.5 text-left hover:bg-surface-2"
          >
            <FileSpreadsheet className="size-7 shrink-0 text-ok" />
            <span className="flex flex-col gap-px">
              <span className="text-[14px] font-bold">Tableur (CSV)</span>
              <span className="text-[12px] text-muted">Nom, statut, paiement, inscription, présence</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false)
              try {
                await downloadEmargement(e)
              } catch {
                toast('La feuille n’a pas pu être créée. Réessaie.', 'error')
              }
            }}
            className="flex gap-2.5 rounded-[10px] p-2.5 text-left hover:bg-surface-2"
          >
            <FileText className="size-7 shrink-0 text-danger" />
            <span className="flex flex-col gap-px">
              <span className="text-[14px] font-bold">Feuille d’émargement (PDF)</span>
              <span className="text-[12px] text-muted">Une colonne pour signer, à imprimer</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

function PaymentCell({ e, p, canCash }: { e: AdminEvent; p: AdminPerson; canCash: boolean }) {
  const { cash } = useEventActions()
  const toast = useToast()
  if (p.status === 'attente') return <span className="text-[13px] text-muted">Liste d’attente</span>
  if (e.member_price_cents <= 0) return <span className="text-[13px] text-muted">Gratuit</span>
  if (p.payment) {
    return (
      <span className="flex items-center gap-1.5 text-[13px] font-bold text-ok">
        <Check className="size-[15px]" strokeWidth={2.8} /> {p.payment.method === 'carte' ? 'Dans l’appli' : (METHOD_LABELS[p.payment.method as keyof typeof METHOD_LABELS] ?? 'Payé').replace(/^Espèces$/, 'En espèces')}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-2.5">
      <span className="text-[13px] font-bold text-[#8A5A00]">À régler</span>
      {canCash && e.status === 'publie' ? (
        <button
          type="button"
          disabled={cash.isPending}
          onClick={() =>
            cash.mutate(
              { event: e.id, member: p.id },
              { onSuccess: () => toast(`${p.first_name} : ${euros(e.member_price_cents)} en espèces, noté au journal.`), onError: (err) => toast(errorMessage(err), 'error') },
            )
          }
          className="h-[30px] rounded-[9px] bg-safran-pale px-2.5 text-[12px] font-extrabold text-[#4A3A00] disabled:opacity-60"
        >
          Marquer payé
        </button>
      ) : null}
    </span>
  )
}

function CancelDialog({ e, open, onClose }: { e: AdminEvent; open: boolean; onClose: () => void }) {
  const { cancel } = useEventActions()
  const toast = useToast()
  const navigate = useNavigate()
  const [reason, setReason] = useState('')
  const draft = e.status === 'brouillon'
  const going = e.people.filter((p) => p.status === 'inscrit').length
  const waiting = e.people.length - going
  const paid = e.people.filter((p) => p.payment).length
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={draft ? 'Supprimer ce brouillon ?' : `Annuler « ${e.title} » ?`}
      description={
        draft
          ? 'Personne ne l’a vu : il disparaît simplement.'
          : `${going > 1 ? `Les ${going} personnes inscrites` : going ? 'La personne inscrite' : 'Les personnes inscrites'}${waiting > 1 ? ` et les ${waiting} personnes de la liste d’attente` : waiting ? ' et la personne de la liste d’attente' : ''} ${going === 1 && !waiting ? 'reçoit' : 'reçoivent'} un message du compte AEGB avec ton motif. La carte reste dans le fil avec la mention « Annulé ».${paid ? ` La trésorerie rembourse ${paid > 1 ? `les ${paid} places payées` : 'la place payée'}.` : ''}`
      }
      footer={
        <>
          <Button variant="outline" size="md" className="flex-1" onClick={onClose}>
            {draft ? 'Garder le brouillon' : 'Garder l’événement'}
          </Button>
          <Button
            variant="danger"
            size="md"
            className="flex-1"
            busy={cancel.isPending}
            disabled={!draft && reason.trim().length < 3}
            icon={draft ? <Trash2 className="size-[18px]" /> : <Ban className="size-[18px]" />}
            onClick={() =>
              cancel.mutate(
                { id: e.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    onClose()
                    toast(draft ? 'Brouillon supprimé.' : 'Événement annulé, les personnes inscrites sont prévenues.')
                    if (draft) navigate('/bureau/evenements', { replace: true })
                  },
                  onError: (err) => toast(errorMessage(err), 'error'),
                },
              )
            }
          >
            {draft ? 'Supprimer' : 'Annuler l’événement'}
          </Button>
        </>
      }
    >
      {draft ? null : <TextArea label="Motif, envoyé aux personnes inscrites" value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={300} placeholder="La salle n’est plus disponible ce soir-là. Une nouvelle date arrive bientôt." />}
    </Dialog>
  )
}

function Refunds({ e, treasurer }: { e: AdminEvent; treasurer: boolean }) {
  if (!e.refunds.length) return null
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-[#F5D46B] bg-[#FFF8E0] p-4">
      <span className="flex items-center gap-2 text-[15px] font-extrabold text-[#6B5200]">
        <CircleDollarSign className="size-[18px]" /> {e.refunds.length} place{e.refunds.length > 1 ? 's' : ''} à rembourser
      </span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {e.refunds.map((r) => (
          <li key={r.payment} className="flex items-center justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate font-bold">{r.member_name}</span>
            <span className="shrink-0 text-[13px] text-[#4A3A00]">
              {euros(r.amount_cents)} · {r.method === 'carte' ? 'carte' : 'espèces'}
              {r.ledger_number ? ` · écriture n° ${r.ledger_number}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[13px] leading-[1.45] text-[#4A3A00]">
        Le trésorier rend l’argent, puis contre-passe l’écriture dans le journal financier avec le motif « Remboursé » : le membre reçoit un message.
      </p>
      {treasurer ? (
        <ButtonLink to="/bureau/journal-financier" variant="outline" size="sm" className="w-fit">
          Ouvrir le journal financier
        </ButtonLink>
      ) : null}
    </div>
  )
}

function EventPanel({ id }: { id: string }) {
  const q = useEventAdmin(id)
  const me = useMe().data!
  const desktop = useIsDesktop()
  const toast = useToast()
  const { save } = useEventActions()
  const [tab, setTab] = useState<Tab>('inscrits')
  const [query, setQuery] = useState('')
  const [cancel, setCancel] = useState(false)
  const edit = can(me, 'evenements')
  const canCash = edit || can(me, 'tresorerie')

  if (q.isPending) return <PageLoader />
  if (q.error || !q.data) return <ErrorNote error={q.error ?? 'Cet événement n’existe plus.'} />
  const e = q.data
  const past = isPast(e)
  const ag = !!e.assembly_id
  const going = e.people.filter((p) => p.status === 'inscrit')
  const waiting = e.people.filter((p) => p.status === 'attente')
  const due = going.filter((p) => e.member_price_cents > 0 && !p.payment)
  const present = going.filter((p) => p.present)
  const inApp = going.filter((p) => p.payment?.method === 'carte').length
  const cash = going.filter((p) => p.payment && p.payment.method !== 'carte').length
  const tabs: { value: Tab; label: string }[] = [
    { value: 'inscrits', label: `${ag ? 'En salle' : 'Inscriptions'} · ${going.length}` },
    ...(waiting.length || e.capacity ? [{ value: 'attente' as Tab, label: `Liste d’attente · ${waiting.length}` }] : []),
    ...(e.member_price_cents > 0 ? [{ value: 'a_regler' as Tab, label: `À régler · ${due.length}` }] : []),
    ...(hasStarted(e) ? [{ value: 'presents' as Tab, label: `Présences · ${present.length}` }] : []),
  ]
  const base = tab === 'attente' ? waiting : tab === 'a_regler' ? due : tab === 'presents' ? present : going
  const needle = query.trim().toLowerCase()
  const rows = base.filter((p) => !needle || `${p.first_name} ${p.last_name}`.toLowerCase().includes(needle))

  const publish = () =>
    save.mutate(
      { id: e.id, data: toDraft(e), publish: true },
      { onSuccess: () => toast('Publié : la carte est dans le fil.'), onError: (err) => toast(errorMessage(err), 'error') },
    )

  const pills = (
    <span className="flex flex-wrap items-center gap-2">
      {e.status === 'publie' ? (
        <Pill tone="ok" icon={<Check className="size-3" strokeWidth={3} />}>
          Publié
        </Pill>
      ) : e.status === 'annule' ? (
        <Pill tone="danger">Annulé</Pill>
      ) : (
        <Pill>Brouillon</Pill>
      )}
      {!past && e.status === 'publie' && isFull(e) ? <Pill tone="danger">Complet</Pill> : null}
      {past && e.status !== 'brouillon' ? <Pill>Terminé</Pill> : null}
      {e.up_to_date_only ? <Pill tone="safran">Membres à jour</Pill> : null}
      {e.public_site ? <Pill tone="brand">Sur le site</Pill> : null}
    </span>
  )

  const byLine = e.published_at
    ? `Publié le ${dayShort(e.published_at)} par ${e.created_by_name}`
    : `Brouillon de ${e.created_by_name}`
  const price = e.member_price_cents > 0 ? ` · ${euros(e.member_price_cents)}${e.guest_price_cents != null ? ` (${euros(e.guest_price_cents)} pour un invité)` : ''}` : ' · gratuit'

  return (
    <div className="flex flex-col gap-3.5">
      <Card className="flex flex-col gap-3.5 p-4 lg:px-6 lg:py-5">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="overflow-hidden rounded-2xl lg:w-[210px] lg:shrink-0">
            <EventCover event={e} className="h-[132px]" muted={e.status === 'annule'} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {pills}
            <h2 className="titre m-0 text-[24px] leading-tight lg:text-[26px]">{e.title}</h2>
            <span className="text-[14px] text-ink">
              {whenLong(e)} · {e.online ? 'en ligne' : e.place}
            </span>
            <span className="text-[13px] text-muted">
              {byLine}
              {ag ? '' : price}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            icon={<Users className="size-3.5" strokeWidth={2.4} />}
            tone="text-ok"
            label={ag ? 'En salle' : 'Inscriptions'}
            value={e.capacity ? `${going.length} / ${e.capacity}` : going.length}
            detail={e.capacity ? (isFull(e) ? 'Complet' : `${e.capacity - going.length} places libres`) : ag ? 'Ceux qui l’ont dit' : 'Places sans limite'}
          />
          {past ? (
            <Stat icon={<Check className="size-3.5" strokeWidth={2.6} />} tone="text-ok" label="Présences" value={`${present.length} / ${going.length}`} detail="Notées à l’entrée" />
          ) : (
            <Stat icon={<Hourglass className="size-3.5" strokeWidth={2.4} />} tone="text-[#6B5200]" label="Liste d’attente" value={waiting.length} detail="La 1re prend la place libérée" />
          )}
          {ag ? (
            <Stat icon={<MessageSquare className="size-3.5" strokeWidth={2.4} />} tone="text-leppi" label="Rappel" value="Convocation" detail="Envoyée par Élections" />
          ) : (
            <Stat
              icon={<MessageSquare className="size-3.5" strokeWidth={2.4} />}
              tone="text-leppi"
              label="Rappel"
              value={e.reminded_at ? 'Envoyé' : capitalize(reminderDay(e))}
              detail={e.reminded_at ? `Le ${dayMonth(e.reminded_at)}, aux personnes inscrites` : `À 18 h, ${going.length > 1 ? `aux ${going.length} personnes inscrites` : 'aux personnes inscrites'}`}
            />
          )}
          {e.member_price_cents > 0 ? (
            <Stat icon={<CircleDollarSign className="size-3.5" strokeWidth={2.4} />} tone="text-[#145A75]" label="Places payées" value={`${inApp + cash} / ${going.length}`} detail={`${inApp} dans l’appli, ${cash} en espèces`} />
          ) : (
            <Stat icon={<CircleDollarSign className="size-3.5" strokeWidth={2.4} />} tone="text-[#145A75]" label="Prix" value="Gratuit" detail="Rien à encaisser" />
          )}
        </div>

        {ag ? (
          <Note>
            L’assemblée générale s’est ajoutée toute seule à la convocation. Elle se modifie et s’annule depuis <Link to="/bureau/elections">Élections</Link>.
          </Note>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {edit && !ag && e.status !== 'annule' && !past ? (
            <ButtonLink to={`/bureau/evenements/${e.id}/modifier`} variant="outline" size="md" icon={<Pencil className="size-[18px]" />}>
              Modifier
            </ButtonLink>
          ) : null}
          {e.status === 'brouillon' && edit ? (
            <Button size="md" busy={save.isPending} icon={<Send className="size-[18px]" />} onClick={publish}>
              Publier
            </Button>
          ) : null}
          {e.status !== 'brouillon' && e.people.length ? <ExportMenu e={e} /> : null}
          {e.status === 'publie' && edit ? (
            <ButtonLink to={`/bureau/evenements/${e.id}/pointage`} variant="outline" size="md" icon={<Check className="size-[18px]" />}>
              Pointer les présences
            </ButtonLink>
          ) : null}
          <span className="flex-1" />
          {edit && !ag && (e.status === 'brouillon' || (e.status === 'publie' && !past)) ? (
            <Button variant="danger-outline" size="md" icon={e.status === 'brouillon' ? <Trash2 className="size-[18px]" /> : <Ban className="size-[18px]" />} onClick={() => setCancel(true)}>
              {e.status === 'brouillon' ? 'Supprimer le brouillon' : 'Annuler l’événement'}
            </Button>
          ) : null}
        </div>
        <ErrorNote error={save.error} />
      </Card>

      <Refunds e={e} treasurer={can(me, 'tresorerie')} />

      {e.status !== 'brouillon' ? (
        <Card className="flex flex-col gap-3 p-4 lg:px-6 lg:py-5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div role="tablist" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
              {tabs.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.value}
                  onClick={() => setTab(t.value)}
                  className={`h-[34px] shrink-0 rounded-full px-3.5 text-[13px] whitespace-nowrap ${tab === t.value ? 'bg-primary font-extrabold text-primary-ink' : 'border-[1.5px] border-line-soft font-bold text-ink'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="hidden flex-1 lg:block" />
            <SearchField value={query} onChange={setQuery} placeholder="Chercher un nom" label="Chercher un nom" className="h-10 lg:w-[220px]" />
          </div>
          {rows.length ? (
            desktop ? (
              <div className="flex flex-col">
                <div className="grid grid-cols-[minmax(0,1fr)_170px_200px_90px] gap-3 px-1 pb-1 text-[12px] font-extrabold tracking-[0.8px] text-muted uppercase">
                  <span>Membre</span>
                  <span>Statut</span>
                  <span>Paiement</span>
                  <span>Depuis le</span>
                </div>
                {rows.map((p) => (
                  <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_170px_200px_90px] items-center gap-3 border-t border-line-soft px-1 py-2 first:border-0">
                    <Link to={`/bureau/membres/${p.id}`} className="flex min-w-0 items-center gap-2.5 text-ink no-underline hover:underline">
                      <Avatar person={p} size={32} />
                      <span className="truncate text-[14px] font-bold">
                        {p.first_name} {p.last_name}
                      </span>
                      {p.present ? <Check className="size-4 shrink-0 text-ok" strokeWidth={3} aria-label="Présent" /> : null}
                    </Link>
                    <span className="truncate text-[13px] text-ink">{duesWord(p)}</span>
                    <PaymentCell e={e} p={p} canCash={canCash} />
                    <span className="text-[13px] text-muted">{dayShort(p.registered_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {rows.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 border-t border-line-soft py-2.5 first:border-0">
                    <Avatar person={p} size={38} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[15px] font-bold">
                        {p.first_name} {p.last_name}
                      </span>
                      <span className="truncate text-[12px] text-muted">
                        {duesWord(p)} · {dayShort(p.registered_at)}
                      </span>
                      <PaymentCell e={e} p={p} canCash={canCash} />
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <EmptyState title={query ? 'Personne à ce nom' : tab === 'a_regler' ? 'Tout est réglé' : 'Personne pour l’instant'} />
          )}
        </Card>
      ) : (
        <Note>Un brouillon ne se voit pas : publie-le pour que la carte arrive dans le fil et que les membres s’inscrivent.</Note>
      )}
      <CancelDialog e={e} open={cancel} onClose={() => setCancel(false)} />
    </div>
  )
}

/* ----------------------------------------------------------------------------
   La page
---------------------------------------------------------------------------- */

export default function Evenements() {
  const { id } = useParams()
  const me = useMe().data!
  const desktop = useIsDesktop()
  const list = useEventsAdmin()
  const edit = can(me, 'evenements')
  const create = edit ? (
    <ButtonLink to="/bureau/evenements/nouveau" variant="accent" size="md" icon={<Plus className="size-[18px]" />}>
      Créer un événement
    </ButtonLink>
  ) : null

  if (list.isPending) return <PageLoader />
  const items = list.data ?? []
  const first = groups(items)[0]?.items[0]

  if (!desktop && id) {
    const e = items.find((x) => x.id === id)
    return (
      <BureauPage title={e?.title ?? 'Événement'} subtitle={e ? cardLine(e) : undefined} back="/bureau/evenements">
        <EventPanel id={id} />
      </BureauPage>
    )
  }
  if (desktop && !id && first) return <Navigate to={`/bureau/evenements/${first.id}`} replace />

  return (
    <BureauPage title="Événements" subtitle="Ce que tu publies ici arrive dans le fil et dans l’onglet Événements des membres." actions={desktop ? create : null}>
      <ErrorNote error={list.error} />
      {!desktop && create ? <div className="flex">{create}</div> : null}
      {desktop ? (
        <div className="grid grid-cols-[360px_minmax(0,1fr)] items-start gap-[18px]">
          <Card className="px-2.5 py-4">
            <EventList list={items} selected={id} />
          </Card>
          {id ? <EventPanel key={id} id={id} /> : null}
        </div>
      ) : (
        <Card className="px-1.5 py-3">
          <EventList list={items} />
        </Card>
      )}
      {!desktop && items.length ? (
        <p className="m-0 flex items-center justify-center gap-1 text-center text-[13px] text-muted">
          Touche un événement pour voir les inscriptions <ChevronRight className="size-4" />
        </p>
      ) : null}
    </BureauPage>
  )
}
