import { useState } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Save, Send, Trash2, Users } from 'lucide-react'
import { Button } from '../../../components/Button'
import { Dialog } from '../../../components/Dialog'
import { TextArea, TextField } from '../../../components/Field'
import { Pill } from '../../../components/Pill'
import { useToast } from '../../../components/Toast'
import {
  dayMonth,
  isoToParis,
  parisToIso,
  plainDay,
  quorumOf,
  useElectionActions,
  votants,
  useSaveAndConvene,
  type AdminView,
  type Assembly,
  type AssemblyKind,
  type Draft,
  type DraftItem,
  type ItemKind,
} from '../../../lib/elections'
import { errorMessage } from '../../../lib/errors'
import { useNow } from '../../../lib/feed'
import { useIsDesktop } from '../../../lib/media'
import { BureauPage } from '../BureauPage'
import { CheckLine, Panel, Steps } from './shared'

/* ----------------------------------------------------------------------------
   Préparer l'AG : le type, la date, le lieu, l'ordre du jour. Rien ne part
   aux membres avant l'envoi de la convocation.
---------------------------------------------------------------------------- */

type Form = {
  kind: AssemblyKind
  date: string
  time: string
  place: string
  voteFrom: string
  voteTo: string
  candidacyUntil: string
  mandateStart: string
  items: DraftItem[]
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Un samedi au moins un mois plus tard, 14 h ; vote de 15 h à 17 h ; candidatures jusqu'au samedi d'avant. */
function blank(now: number, roles: AdminView['roles']): Form {
  const d = new Date(now + 30 * 86_400_000)
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7))
  const before = new Date(d)
  before.setDate(before.getDate() - 7)
  const year = d.getFullYear()
  return {
    kind: 'ordinaire',
    date: ymd(d),
    time: '14:00',
    place: '',
    voteFrom: '15:00',
    voteTo: '17:00',
    candidacyUntil: `${ymd(before)}T23:59`,
    mandateStart: `${year + 1}-01-01`,
    items: [
      { kind: 'resolution', title: `Rapport moral ${year}`, detail: 'Présenté par la présidence', seats: [] },
      { kind: 'resolution', title: `Rapport financier ${year}`, detail: 'Présenté par la trésorerie', seats: [] },
      { kind: 'election', title: `Élection du bureau ${year + 1}`, detail: '', seats: roles.map((r) => r.code) },
      { kind: 'discussion', title: 'Questions diverses', detail: 'Discussion libre', seats: [] },
    ],
  }
}

function fromAssembly(a: Assembly): Form {
  const held = isoToParis(a.held_at)
  return {
    kind: a.kind,
    date: held.slice(0, 10),
    time: held.slice(11),
    place: a.place,
    voteFrom: isoToParis(a.vote_opens_at).slice(11),
    voteTo: isoToParis(a.vote_closes_at).slice(11),
    candidacyUntil: a.candidacy_until ? isoToParis(a.candidacy_until) : '',
    mandateStart: a.mandate_start ?? '',
    items: a.items.map((i) => ({ kind: i.kind, title: i.title, detail: i.detail ?? '', seats: i.seats })),
  }
}

function toDraft(id: string | null, f: Form): Draft {
  const election = f.items.some((i) => i.kind === 'election')
  return {
    id,
    kind: f.kind,
    held_at: parisToIso(`${f.date}T${f.time}`),
    place: f.place.trim(),
    vote_opens_at: parisToIso(`${f.date}T${f.voteFrom}`),
    vote_closes_at: parisToIso(`${f.date}T${f.voteTo}`),
    candidacy_until: election && f.candidacyUntil ? parisToIso(f.candidacyUntil) : null,
    mandate_start: election && f.mandateStart ? f.mandateStart : null,
    items: f.items,
  }
}

const KINDS: Record<ItemKind, { label: string; tone: 'brand' | 'safran' | 'neutral' }> = {
  resolution: { label: 'Résolution', tone: 'brand' },
  election: { label: 'Élection', tone: 'safran' },
  discussion: { label: 'Sans vote', tone: 'neutral' },
}

export function Preparer({ view, full, onCancelNew }: { view: AdminView; full: boolean; onCancelNew?: () => void }) {
  const desktop = useIsDesktop()
  const toast = useToast()
  const now = useNow()
  const draftA = view.assembly?.status === 'brouillon' ? view.assembly : null
  const [form, setForm] = useState<Form>(() => (draftA ? fromAssembly(draftA) : blank(now, view.roles)))
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [confirm, setConfirm] = useState<'send' | 'force' | 'delete' | null>(null)
  const { save, cancel } = useElectionActions()
  const send = useSaveAndConvene()

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const election = form.items.find((i) => i.kind === 'election')
  const heldMs = Date.parse(parisToIso(`${form.date}T${form.time || '00:00'}`))
  const days = Number.isNaN(heldMs) ? null : Math.ceil((heldMs - now) / 86_400_000)
  const early = days !== null && days >= 15
  const electorate = view.electorate ?? 0
  const quorum = quorumOf(form.kind, 1, electorate)
  const title = Number.isNaN(heldMs) ? 'Préparer l’AG' : `Préparer l’AG du ${dayMonth(new Date(heldMs))}`

  // mutateAsync : l'écran change dès que la base répond (brouillon créé, AG convoquée), le message doit suivre.
  const doSave = () =>
    save.mutateAsync(toDraft(draftA?.id ?? null, form)).then(
      () => toast('Brouillon enregistré'),
      (e) => toast(errorMessage(e), 'error'),
    )
  const doSend = (force: boolean) =>
    send.mutateAsync({ draft: toDraft(draftA?.id ?? null, form), force }).then(
      (n) => {
        setConfirm(null)
        toast(`Convocation envoyée à ${n} membre${n > 1 ? 's' : ''}`)
      },
      (e) => {
        if ((e as { hint?: string }).hint === 'trop_proche') setConfirm('force')
        else {
          setConfirm(null)
          toast(errorMessage(e), 'error')
        }
      },
    )

  const actions = full ? (
    <>
      {draftA ? (
        <Button variant="ghost" size="md" icon={<Trash2 className="size-[18px]" />} onClick={() => setConfirm('delete')}>
          Supprimer
        </Button>
      ) : onCancelNew ? (
        <Button variant="ghost" size="md" onClick={onCancelNew}>
          Annuler
        </Button>
      ) : null}
      <Button variant="outline" size="md" busy={save.isPending} icon={<Save className="size-[18px]" />} onClick={doSave}>
        Enregistrer le brouillon
      </Button>
      <Button variant="accent" size="md" icon={<Send className="size-[18px]" />} onClick={() => setConfirm('send')}>
        Envoyer la convocation
      </Button>
    </>
  ) : null

  const assembly = (
    <Panel title="L’assemblée">
      <fieldset className="m-0 flex flex-col gap-[7px] border-0 p-0">
        <legend className="mb-[7px] p-0 text-sm font-bold">Type</legend>
        <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-surface-2 p-1" role="radiogroup" aria-label="Type d’AG">
          {(['ordinaire', 'extraordinaire'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={form.kind === k}
              disabled={!full}
              onClick={() => set('kind', k)}
              className={`h-11 rounded-[11px] text-[15px] font-bold capitalize ${form.kind === k ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {k}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-muted">{form.kind === 'ordinaire' ? 'Rapports, cotisation, élection du bureau (article 13).' : 'Modification des statuts, dissolution (article 14).'}</span>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Date" type="date" value={form.date} disabled={!full} onChange={(e) => set('date', e.target.value)} />
        <TextField label="Heure" type="time" value={form.time} disabled={!full} onChange={(e) => set('time', e.target.value)} />
      </div>
      <TextField label="Lieu" value={form.place} maxLength={120} disabled={!full} placeholder="UFR Sciences, Brest" onChange={(e) => set('place', e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Ouverture du vote" type="time" value={form.voteFrom} disabled={!full} onChange={(e) => set('voteFrom', e.target.value)} />
        <TextField label="Fermeture du vote" type="time" value={form.voteTo} disabled={!full} onChange={(e) => set('voteTo', e.target.value)} />
      </div>
      <p className="-mt-2 mb-0 text-[13px] text-muted">Le vote se fait dans l’appli, le jour de l’AG, en salle ou à distance.</p>
      {election ? (
        <>
          <TextField
            label="Candidatures jusqu’au"
            type="datetime-local"
            value={form.candidacyUntil}
            disabled={!full}
            onChange={(e) => set('candidacyUntil', e.target.value)}
          />
          <TextField
            label="Prise de poste des titulaires"
            type="date"
            value={form.mandateStart}
            disabled={!full}
            onChange={(e) => set('mandateStart', e.target.value)}
            hint={form.mandateStart ? `Le ${plainDay(form.mandateStart)} (article 16).` : 'Vide : élection partielle, prise de poste dès la passation.'}
          />
        </>
      ) : null}
    </Panel>
  )

  const agenda = (
    <Panel title="Ordre du jour" right={<span className="text-[13px] text-muted">Seuls ces points sont votés</span>}>
      <ol className="m-0 flex list-none flex-col p-0">
        {form.items.map((item, i) => (
          <li key={i} className="flex items-center gap-3 border-t border-line-soft py-2.5 first:border-0">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-extrabold">{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] leading-snug font-bold">{item.title || 'Sans titre'}</span>
              {item.kind === 'election' ? (
                <span className="text-[13px] text-muted">
                  {item.seats.length} poste{item.seats.length > 1 ? 's' : ''}, article 15
                </span>
              ) : item.detail ? (
                <span className="truncate text-[13px] text-muted">{item.detail}</span>
              ) : null}
            </span>
            <Pill tone={KINDS[item.kind].tone}>{KINDS[item.kind].label}</Pill>
            {full ? (
              <span className="flex shrink-0 items-center">
                <button
                  type="button"
                  aria-label={`Monter le point ${i + 1}`}
                  disabled={i === 0}
                  onClick={() => set('items', move(form.items, i, i - 1))}
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Descendre le point ${i + 1}`}
                  disabled={i === form.items.length - 1}
                  onClick={() => set('items', move(form.items, i, i + 1))}
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"
                >
                  <ArrowDown className="size-4" />
                </button>
                <button type="button" aria-label={`Modifier le point ${i + 1}`} onClick={() => setEditing(i)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
                  <Pencil className="size-4" />
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {full && form.items.length < 20 ? (
        <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-2 self-start rounded-xl px-2 py-2 text-[15px] font-bold text-ink hover:bg-surface-2">
          <Plus className="size-5" /> Ajouter un point
        </button>
      ) : null}
    </Panel>
  )

  const before = (
    <Panel title="Avant d’envoyer">
      <CheckLine
        state={days === null ? 'todo' : early ? 'ok' : 'warn'}
        title="Au moins 15 jours avant"
        detail={days === null ? 'Choisis la date de l’AG.' : days < 0 ? 'Cette date est passée.' : `Il reste ${days} jour${days > 1 ? 's' : ''} avant l’AG (article 12).`}
      />
      <CheckLine state="ok" title={`${view.members} membres convoqués`} detail="En message du compte AEGB et en annonce officielle dans le fil." />
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-select text-ink" aria-hidden="true">
          <Users className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-col">
          <strong className="text-[15px] leading-snug">Liste électorale : {votants(electorate)}</strong>
          <span className="text-[13px] leading-snug text-muted">Étudiants actifs et à jour aujourd’hui. Elle bouge jusqu’au vote, avec les paiements.</span>
        </span>
      </div>
      <div className="flex flex-col gap-1.5 rounded-[16px] bg-surface-2 p-4 text-sm leading-[1.5]">
        <span className="text-xs font-extrabold tracking-[0.08em] text-muted uppercase">Règles qui s’appliqueront</span>
        <span>
          <strong>Quorum</strong> : {form.kind === 'ordinaire' ? 'un tiers' : 'la moitié'} de la liste, soit {quorum} votant{quorum > 1 ? 's' : ''} aujourd’hui.
        </span>
        <span>
          <strong>Majorité</strong> : {form.kind === 'ordinaire' ? 'plus de « pour » que de « contre »' : 'deux tiers des suffrages exprimés'}
          {election ? ' ; pour un poste, le plus de voix' : ''}.
        </span>
        <span className="text-muted">{form.kind === 'ordinaire' ? 'Articles 13 et 15' : 'Articles 14 et 15'}</span>
      </div>
    </Panel>
  )

  const dialogs = (
    <>
      <ItemDialog
        key={String(editing)}
        open={editing !== null}
        item={typeof editing === 'number' ? form.items[editing] : null}
        roles={view.roles}
        electionTaken={form.items.some((x, k) => x.kind === 'election' && k !== editing)}
        onClose={() => setEditing(null)}
        onSave={(item) => {
          set('items', typeof editing === 'number' ? form.items.map((x, k) => (k === editing ? item : x)) : [...form.items, item])
          setEditing(null)
        }}
        onDelete={
          typeof editing === 'number'
            ? () => {
                set('items', form.items.filter((_, k) => k !== editing))
                setEditing(null)
              }
            : undefined
        }
      />
      <Dialog
        open={confirm === 'send'}
        onClose={() => setConfirm(null)}
        title="Envoyer la convocation ?"
        description={`${view.members} membres la reçoivent en message du compte AEGB, et une annonce officielle est épinglée dans le fil. Ensuite, l’AG ne se modifie plus.`}
      >
        <div className="flex flex-col gap-3 pb-2">
          <Button variant="accent" icon={<Send className="size-5" />} busy={send.isPending} onClick={() => doSend(false)}>
            Envoyer la convocation
          </Button>
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Relire encore
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={confirm === 'force'}
        onClose={() => setConfirm(null)}
        title="Moins de 15 jours avant l’AG"
        description="Les statuts demandent d’envoyer la convocation au moins 15 jours avant (article 12). Envoie-la quand même seulement si le bureau l’a décidé, par exemple pour une AG d’essai."
      >
        <div className="flex flex-col gap-3 pb-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Changer la date
          </Button>
          <Button variant="danger-outline" busy={send.isPending} onClick={() => doSend(true)}>
            Envoyer quand même
          </Button>
        </div>
      </Dialog>
      <Dialog open={confirm === 'delete'} onClose={() => setConfirm(null)} title="Supprimer ce brouillon ?" description="Rien n’est parti aux membres : le brouillon disparaît simplement.">
        <div className="flex flex-col gap-3 pb-2">
          <Button
            variant="danger"
            busy={cancel.isPending}
            onClick={() =>
              draftA &&
              cancel.mutateAsync({ id: draftA.id }).then(
                () => {
                  setConfirm(null)
                  toast('Brouillon supprimé')
                },
                (e) => toast(errorMessage(e), 'error'),
              )
            }
          >
            Supprimer le brouillon
          </Button>
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Garder
          </Button>
        </div>
      </Dialog>
    </>
  )

  return (
    <BureauPage title={title} subtitle="Brouillon : rien ne part aux membres avant l’envoi de la convocation." actions={desktop ? actions : null}>
      {desktop ? <Steps step={0} /> : null}
      {desktop ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.8fr)] items-start gap-4">
          {assembly}
          {agenda}
          {before}
        </div>
      ) : (
        <>
          {assembly}
          {agenda}
          {before}
          {full ? <div className="flex flex-col gap-2.5 px-2 pt-1">{actions}</div> : null}
        </>
      )}
      {dialogs}
    </BureauPage>
  )
}

function move<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list]
  const [x] = copy.splice(from, 1)
  copy.splice(to, 0, x)
  return copy
}

function ItemDialog({
  open,
  item,
  roles,
  electionTaken,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  item: DraftItem | null
  roles: AdminView['roles']
  electionTaken: boolean
  onClose: () => void
  onSave: (item: DraftItem) => void
  onDelete?: () => void
}) {
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? 'resolution')
  const [title, setTitle] = useState(item?.title ?? '')
  const [detail, setDetail] = useState(item?.detail ?? '')
  const [seats, setSeats] = useState<string[]>(item?.seats.length ? item.seats : roles.map((r) => r.code))
  const ok = title.trim().length > 0 && (kind !== 'election' || seats.length > 0)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item ? 'Modifier le point' : 'Ajouter un point'}
      footer={
        <>
          {onDelete ? (
            <Button variant="danger-outline" className="flex-1" icon={<Trash2 className="size-5" />} onClick={onDelete}>
              Retirer
            </Button>
          ) : null}
          <Button className="flex-1" disabled={!ok} onClick={() => onSave({ kind, title: title.trim(), detail: detail.trim(), seats: kind === 'election' ? seats : [] })}>
            {item ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Nature du point">
          {(Object.keys(KINDS) as ItemKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              disabled={k === 'election' && electionTaken}
              onClick={() => setKind(k)}
              className={`h-10 rounded-full px-4 text-sm font-bold disabled:opacity-40 ${kind === k ? 'bg-primary text-primary-ink' : 'border border-line bg-surface text-ink hover:bg-surface-2'}`}
            >
              {k === 'election' ? 'Élection du bureau' : KINDS[k].label}
            </button>
          ))}
        </div>
        <TextField label="Titre" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'election' ? 'Élection du bureau 2027' : 'Cotisation 2027'} />
        {kind === 'election' ? (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-sm font-bold">Postes à élire</legend>
            {roles.map((r) => (
              <label key={r.code} className="flex items-center gap-3 rounded-xl px-1 py-1.5 text-[15px]">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--color-leppi)]"
                  checked={seats.includes(r.code)}
                  onChange={(e) => setSeats((s) => (e.target.checked ? roles.map((x) => x.code).filter((c) => c === r.code || s.includes(c)) : s.filter((c) => c !== r.code)))}
                />
                {r.label}
              </label>
            ))}
          </fieldset>
        ) : (
          <TextArea
            label={kind === 'resolution' ? 'Texte soumis au vote' : 'Précision'}
            value={detail}
            maxLength={300}
            counter
            onChange={(e) => setDetail(e.target.value)}
            placeholder={kind === 'resolution' ? 'L’assemblée générale fixe la cotisation 2027 des membres étudiants à 5 € par mois.' : 'Discussion libre'}
          />
        )}
      </div>
    </Dialog>
  )
}
