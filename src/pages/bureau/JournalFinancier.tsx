import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Download, EyeOff, Lock, Plus, ReceiptText, Undo2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EncaisserForm } from '../../components/dues/EncaisserForm'
import { EmptyState, ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { inputClass, SearchField } from '../../components/Field'
import { Pill, type Tone } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { downloadCsv } from '../../lib/csv'
import { LEDGER_CATEGORIES, LEDGER_METHODS, monthYearLabel, REVERSE_REASONS, shortDay, signedEuros, eurosExact, useLedger, type LedgerEntry } from '../../lib/dues'
import { fullName } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { can, useActiveMembers, useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { BureauPage, Card, Chips } from './BureauPage'

type Kind = 'toutes' | 'entrees' | 'sorties' | 'corrections'

const CATEGORY_TONES: Record<string, Tone> = {
  cotisation: 'ok',
  evenements: 'safran',
  dons: 'brand',
  subventions: 'brand',
  fonctionnement: 'neutral',
  banque: 'neutral',
  ouverture: 'neutral',
  correction: 'danger',
  autre: 'neutral',
}

function num(n: number) {
  return String(n).padStart(3, '0')
}

function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}


function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function Who({ e }: { e: LedgerEntry }) {
  return (
    <>
      {e.created_by_name}
      {e.discreet ? (
        <span title="Les autres voient « Le bureau »" className="ml-1 inline-flex align-[-2px] text-muted">
          <EyeOff className="size-3.5" />
          <span className="sr-only">(les autres voient « Le bureau »)</span>
        </span>
      ) : null}
    </>
  )
}

/* ----------------------------------------------------------------------------
   Nouvelle écriture
---------------------------------------------------------------------------- */

const ENTRY_CATEGORIES = ['cotisation', 'evenements', 'dons', 'subventions', 'fonctionnement', 'banque', 'ouverture', 'autre']
const ENTRY_METHODS = ['especes', 'virement', 'carte', 'cheque', 'prelevement']

/** « 12,5 » ou « 12.50 » → 1250 centimes. */
function parseCents(text: string): number | null {
  const clean = text.replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  return Math.round(Number(clean) * 100)
}

function NewEntryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const members = useActiveMembers(open).data ?? []
  const [direction, setDirection] = useState<'entree' | 'sortie'>('sortie')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(parisToday())
  const [category, setCategory] = useState('evenements')
  const [method, setMethod] = useState('virement')
  const [label, setLabel] = useState('')
  const [member, setMember] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const cents = parseCents(amount)

  function close() {
    setAmount('')
    setLabel('')
    setNote('')
    setMember('')
    setError(null)
    onClose()
  }

  async function save() {
    if (!cents) return setError('Indique un montant, par exemple 12,50.')
    if (label.trim().length < 2) return setError('Écris un libellé.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('add_ledger_entry', {
      p_date: date,
      p_label: label.trim(),
      p_category: category,
      p_amount_cents: direction === 'sortie' ? -cents : cents,
      p_method: method,
      p_member: member || undefined,
      p_note: note.trim() || undefined,
    })
    setBusy(false)
    if (error) return setError(error)
    await queryClient.invalidateQueries({ queryKey: ['bureau'] })
    toast(`Écriture n° ${num(data)} enregistrée.`)
    close()
  }

  const cotisation = category === 'cotisation'

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title="Nouvelle écriture"
      description="Elle entre dans le journal et ne pourra plus être modifiée."
      footer={
        cotisation ? undefined : (
          <>
            <Button variant="outline" size="md" className="flex-1" onClick={close}>
              Annuler
            </Button>
            <Button size="md" className="flex-1" busy={busy} onClick={save}>
              Enregistrer l'écriture
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-[7px]">
          <span className="text-sm font-bold">Catégorie</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            {ENTRY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {LEDGER_CATEGORIES[c]}
              </option>
            ))}
          </select>
        </label>
        {cotisation ? (
          <EncaisserForm onCancel={close} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sens">
              {(
                [
                  ['entree', "Entrée d'argent", <ArrowDownLeft key="e" className="size-4" />],
                  ['sortie', "Sortie d'argent", <ArrowUpRight key="s" className="size-4" />],
                ] as const
              ).map(([value, text, icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={direction === value}
                  onClick={() => setDirection(value)}
                  className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold ${direction === value ? (value === 'entree' ? 'border-2 border-ok bg-ok-soft text-ok' : 'border-2 border-danger bg-danger-soft text-danger') : 'border-[1.5px] border-line bg-surface text-ink'}`}
                >
                  {icon}
                  {text}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-[7px]">
                <span className="text-sm font-bold">Montant</span>
                <span className="relative">
                  <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className={`${inputClass} pr-10`} aria-invalid={amount !== '' && !cents ? true : undefined} />
                  <span className="absolute top-1/2 right-4 -translate-y-1/2 text-muted">€</span>
                </span>
              </label>
              <label className="flex flex-col gap-[7px]">
                <span className="text-sm font-bold">Date</span>
                <input type="date" value={date} max={parisToday()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </label>
            </div>
            <label className="flex flex-col gap-[7px]">
              <span className="text-sm font-bold">Libellé</span>
              <input value={label} maxLength={140} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. : location de salle, soirée d'intégration" className={inputClass} />
            </label>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-bold">Moyen de paiement</legend>
              <div className="flex flex-wrap gap-2">
                {ENTRY_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={method === m}
                    onClick={() => setMethod(m)}
                    className={`h-9 rounded-full px-3.5 text-[13px] font-bold ${method === m ? 'bg-primary text-primary-ink' : 'border border-line bg-surface text-ink'}`}
                  >
                    {LEDGER_METHODS[m]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-[7px]">
              <span className="text-sm font-bold">
                Membre concerné <span className="font-normal text-muted">(facultatif)</span>
              </span>
              <select value={member} onChange={(e) => setMember(e.target.value)} className={inputClass}>
                <option value="">Personne</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {fullName(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-[7px]">
              <span className="text-sm font-bold">
                Note <span className="font-normal text-muted">(facultatif)</span>
              </span>
              <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="N° de facture, détail…" className={inputClass} />
            </label>
            <ErrorNote error={error} />
          </>
        )}
      </div>
    </Dialog>
  )
}

/* ----------------------------------------------------------------------------
   Contre-passation
---------------------------------------------------------------------------- */

function ReverseDialog({ entry, onClose }: { entry: LedgerEntry | null; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const first = entry?.member_name?.split(' ')[0] ?? ''
  const isDues = !!entry?.payment_id

  function close() {
    setReason('')
    setNote('')
    setNotify(true)
    setError(null)
    onClose()
  }

  async function confirm() {
    if (!entry) return
    if (!reason) return setError('Choisis le motif de la correction.')
    if (reason === 'autre' && !note.trim()) return setError('Explique le motif dans les précisions.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('reverse_ledger_entry', { p_entry: entry.id, p_reason: reason, p_note: note.trim() || undefined, p_notify: notify })
    setBusy(false)
    if (error) return setError(error)
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['bureau'] }), queryClient.invalidateQueries({ queryKey: ['cotisation'] })])
    toast(`Écriture n° ${num(entry.number)} corrigée par la n° ${num(data)}.`)
    close()
  }

  const steps = entry
    ? [
        `L'écriture n° ${num(entry.number)} reste dans le journal, marquée « annulée ».`,
        `Une écriture inverse de ${signedEuros(-entry.amount_cents)} est passée aujourd'hui, à ton nom.`,
        ...(isDues
          ? [
              `Les mois de ce paiement redeviennent dus pour ${first || 'le membre'}, et sa quittance est annulée.`,
              ...(reason === 'rembourse' ? ['Le remboursement lui-même se fait dans HelloAsso, ou de la main à la main. Ici, on le note dans nos comptes.'] : []),
            ]
          : []),
      ]
    : []

  return (
    <Dialog
      open={!!entry}
      onClose={close}
      wide
      title={entry ? `Corriger l'écriture n° ${num(entry.number)}` : 'Corriger'}
      description="Une écriture ne s'efface jamais. On passe une écriture inverse, et les deux restent visibles dans le journal."
      footer={
        <>
          <Button variant="outline" size="md" className="flex-1" onClick={close}>
            Annuler
          </Button>
          <Button variant="danger" size="md" className="flex-1" busy={busy} onClick={confirm}>
            Passer la contre-passation
          </Button>
        </>
      }
    >
      {entry ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-[16px] bg-surface-2 p-3.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold tracking-wide text-muted uppercase">
                N° {num(entry.number)} · {shortDay(entry.entry_date)}
              </span>
              <span className="block truncate text-[15px] font-bold">{entry.label}</span>
              <span className="block truncate text-[13px] text-muted">
                {[entry.member_name, LEDGER_METHODS[entry.method], entry.created_by_name === 'Automatique' ? 'saisie automatique' : `saisie par ${entry.created_by_name}`].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className={`text-[15px] font-extrabold ${entry.amount_cents < 0 ? 'text-danger' : 'text-ok'}`}>{signedEuros(entry.amount_cents)}</span>
          </div>
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 p-0 text-sm font-bold">Pourquoi la corriger ?</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Motif">
              {REVERSE_REASONS.filter((r) => isDues || (r.value !== 'membre' && r.value !== 'mois')).map((r) => (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={reason === r.value}
                  title={r.detail}
                  onClick={() => setReason(r.value)}
                  className={`h-9 rounded-full px-3.5 text-[13px] font-bold ${reason === r.value ? 'bg-primary text-primary-ink' : 'border border-line bg-surface text-ink'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-[7px]">
            <span className="text-sm font-bold">
              Précisions <span className="font-normal text-muted">· visibles dans le journal</span>
            </span>
            <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : 10 € reçus, pas 50 €" className={inputClass} />
          </label>
          <div className="flex flex-col gap-2 rounded-[16px] border-[1.5px] border-line-soft p-4">
            <p className="m-0 text-sm font-bold">Ce qui va se passer</p>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {steps.map((s, i) => (
                <li key={s} className="flex items-start gap-2.5 text-[13px] leading-[1.45]">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-select text-[11px] font-extrabold">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
          {isDues && entry.member_id ? (
            <label className="flex items-center gap-3 text-[14px]">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-5 accent-[var(--primary)]" />
              Prévenir {first} dans sa conversation AEGB
            </label>
          ) : null}
          <ErrorNote error={error} />
        </div>
      ) : null}
    </Dialog>
  )
}

/* ----------------------------------------------------------------------------
   La page
---------------------------------------------------------------------------- */

function Tile({ label, value, detail, tone = '' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[12px] bg-surface px-[18px] py-4">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className={`titre truncate text-[24px] leading-tight lg:text-[26px] ${tone}`}>{value}</span>
      <span className="text-[13px] leading-snug text-muted lg:truncate">{detail}</span>
    </div>
  )
}

export default function JournalFinancier() {
  const desktop = useIsDesktop()
  const me = useMe().data
  const full = can(me, 'tresorerie')
  const ledger = useLedger()
  const [kind, setKind] = useState<Kind>('toutes')
  const [category, setCategory] = useState('')
  const [period, setPeriod] = useState('exercice')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [reversing, setReversing] = useState<LedgerEntry | null>(null)

  const entries = useMemo(() => ledger.data ?? [], [ledger.data])
  const today = parisToday()
  // L'exercice comptable va du 1er janvier au 31 décembre (article 27 des statuts).
  const year = today.slice(0, 4)
  const month = today.slice(0, 7)
  const reversedBy = useMemo(() => new Map(entries.filter((e) => e.reverses).map((e) => [e.reverses!, e])), [entries])
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])

  const balance = entries.reduce((s, e) => s + e.amount_cents, 0)
  const cash = entries.filter((e) => e.method === 'especes').reduce((s, e) => s + e.amount_cents, 0)
  const thisMonth = entries.filter((e) => e.entry_date.startsWith(month) && e.category !== 'correction')
  const inMonth = thisMonth.filter((e) => e.amount_cents > 0)
  const outMonth = thisMonth.filter((e) => e.amount_cents < 0)
  const inTotal = inMonth.reduce((s, e) => s + e.amount_cents, 0)
  const duesIn = inMonth.filter((e) => e.category === 'cotisation').reduce((s, e) => s + e.amount_cents, 0)
  const outTotal = -outMonth.reduce((s, e) => s + e.amount_cents, 0)
  const outBy = new Map<string, number>()
  for (const e of outMonth) outBy.set(e.category, (outBy.get(e.category) ?? 0) - e.amount_cents)
  const topOut = [...outBy.entries()].sort((a, b) => b[1] - a[1])[0]
  const thisYear = entries.filter((e) => e.entry_date.startsWith(year))
  const monthLabel = monthYearLabel(`${month}-01`).split(' ')[0]

  const periods = useMemo(() => {
    const set = new Set(entries.map((e) => e.entry_date.slice(0, 7)))
    return [...set].sort().reverse()
  }, [entries])
  const pastYears = [...new Set(entries.map((e) => e.entry_date.slice(0, 4)))].filter((y) => y < year).sort().reverse()

  const q = normalize(query.trim())
  const shown = entries
    .filter((e) => (kind === 'entrees' ? e.amount_cents > 0 && e.category !== 'correction' : kind === 'sorties' ? e.amount_cents < 0 && e.category !== 'correction' : kind === 'corrections' ? e.category === 'correction' || reversedBy.has(e.id) : true))
    .filter((e) => !category || e.category === category)
    .filter((e) => (period === 'exercice' ? e.entry_date.startsWith(year) : period === 'tout' ? true : e.entry_date.startsWith(period)))
    .filter((e) => !q || normalize([e.label, e.member_name, e.note, num(e.number)].filter(Boolean).join(' ')).includes(q))

  function exportCsv() {
    downloadCsv(
      `journal-financier-aegb-${today}.csv`,
      ['N°', 'Date', 'Libellé', 'Catégorie', 'Membre', 'Moyen', 'Montant (€)', 'Corrige le n°', 'Corrigée par le n°', 'Note', 'Saisie par', 'Saisie le'],
      // Le fichier peut circuler : il garde « Le bureau » là où les autres le voient.
      shown.map((e) => [
        num(e.number),
        e.entry_date,
        e.label,
        LEDGER_CATEGORIES[e.category] ?? e.category,
        e.member_name,
        LEDGER_METHODS[e.method] ?? e.method,
        (e.amount_cents / 100).toFixed(2).replace('.', ','),
        e.reverses ? num(byId.get(e.reverses)?.number ?? 0) : '',
        reversedBy.has(e.id) ? num(reversedBy.get(e.id)!.number) : '',
        e.note,
        e.discreet ? 'Le bureau' : e.created_by_name,
        new Date(e.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
      ]),
    )
  }

  const kinds = [
    { value: 'toutes' as Kind, label: 'Toutes' },
    { value: 'entrees' as Kind, label: 'Entrées' },
    { value: 'sorties' as Kind, label: 'Sorties' },
    { value: 'corrections' as Kind, label: 'Corrections' },
  ]

  const selectClass = (onDark: boolean) =>
    `h-10 min-w-0 rounded-full border-[1.5px] bg-surface pr-8 pl-4 text-[13px] font-bold text-ink outline-none focus:border-primary focus:ring-[3px] focus:ring-safran/45 ${onDark ? 'border-transparent' : 'border-line'}`

  function subline(e: LedgerEntry) {
    if (e.reverses) return `Corrige ${num(byId.get(e.reverses)?.number ?? 0)}`
    const by = reversedBy.get(e.id)
    return by ? `Annulée par ${num(by.number)}` : null
  }

  function canReverse(e: LedgerEntry) {
    return full && !e.reverses && !reversedBy.has(e.id)
  }

  return (
    <BureauPage
      title="Journal financier"
      subtitle="Rien ne s'efface : une erreur se corrige par une contre-passation."
      actions={
        <>
          <Button variant="outline" size="md" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!shown.length}>
            Exporter en CSV
          </Button>
          {full ? (
            <Button size="md" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nouvelle écriture
            </Button>
          ) : null}
        </>
      }
      controls={(onDark) => (
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <Chips label="Filtrer par sens" options={kinds} value={kind} onChange={setKind} onDark={onDark} />
          <div className="flex gap-2 lg:ml-auto">
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Catégorie" className={`${selectClass(onDark)} flex-1 lg:flex-none`}>
              <option value="">Toutes les catégories</option>
              {Object.entries(LEDGER_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Période" className={`${selectClass(onDark)} flex-1 lg:flex-none`}>
              <option value="exercice">Exercice {year}</option>
              {pastYears.map((y) => (
                <option key={y} value={y}>
                  Exercice {y}
                </option>
              ))}
              {periods.map((p) => (
                <option key={p} value={p}>
                  {monthYearLabel(`${p}-01`).replace(/^./, (c) => c.toUpperCase())}
                </option>
              ))}
              <option value="tout">Tout</option>
            </select>
          </div>
          <SearchField value={query} onChange={setQuery} placeholder="Libellé, membre" className={onDark ? 'border-transparent' : 'lg:w-[240px]'} />
        </div>
      )}
    >
      <ErrorNote error={ledger.error} />
      {ledger.isPending ? <PageLoader /> : null}

      {ledger.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <Tile label="Solde de la caisse" value={eurosExact(balance)} detail={`Dont ${eurosExact(cash)} en espèces`} />
          <Tile label={`Entrées en ${monthLabel}`} value={eurosExact(inTotal)} detail={`Dont ${eurosExact(duesIn)} de cotisations`} tone="text-ok" />
          <Tile label={`Sorties en ${monthLabel}`} value={eurosExact(outTotal)} detail={topOut ? `Dont ${eurosExact(topOut[1])} : ${(LEDGER_CATEGORIES[topOut[0]] ?? topOut[0]).toLowerCase()}` : 'Aucune sortie'} tone={outTotal ? 'text-danger' : ''} />
          <Tile label={`Écritures de l'exercice ${year}`} value={String(thisYear.length)} detail={entries[0] ? `Dernière : n° ${num(entries[0].number)}, le ${shortDay(entries[0].entry_date)}` : 'Aucune pour l’instant'} />
        </div>
      ) : null}

      {ledger.data && !shown.length ? (
        <Card>
          <EmptyState title={entries.length ? 'Aucune écriture ici' : 'Le journal est vide'} icon={<ReceiptText className="size-6" />}>
            {entries.length ? 'Change les filtres pour voir d’autres écritures.' : 'Les paiements des cotisations y entrent tout seuls. Ajoute ici les dépenses, dons, subventions et le solde de départ.'}
          </EmptyState>
        </Card>
      ) : null}

      {shown.length && desktop ? (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-[12px] tracking-wide text-muted uppercase">
                <th className="px-5 py-3 font-bold">N°</th>
                <th className="px-3 py-3 font-bold">Date</th>
                <th className="px-3 py-3 font-bold">Libellé</th>
                <th className="px-3 py-3 font-bold">Catégorie</th>
                <th className="px-3 py-3 font-bold">Membre</th>
                <th className="px-3 py-3 font-bold">Moyen</th>
                <th className="px-3 py-3 text-right font-bold">Montant</th>
                <th className="px-3 py-3 pr-5 font-bold">Saisie par</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const sub = subline(e)
                const cancelled = reversedBy.has(e.id)
                return (
                  <tr key={e.id} className={`group border-b border-line-soft last:border-0 ${e.reverses ? 'bg-danger-soft/40' : ''}`}>
                    <td className="px-5 py-3 font-bold text-muted tabular-nums">{num(e.number)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">{shortDay(e.entry_date)}</td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <span className={`font-semibold ${cancelled ? 'text-muted line-through' : ''}`}>{e.label}</span>
                        {canReverse(e) ? (
                          <button type="button" onClick={() => setReversing(e)} aria-label={`Corriger l'écriture n° ${num(e.number)}`} className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] font-bold text-ink opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-surface-2 focus-visible:opacity-100">
                            <Undo2 className="size-3.5" /> Corriger
                          </button>
                        ) : null}
                      </span>
                      {sub ? <span className="block text-[12px] font-semibold text-danger">{sub}</span> : null}
                      {e.note ? <span className="block text-[12px] text-muted">{e.note}</span> : null}
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone={CATEGORY_TONES[e.category] ?? 'neutral'}>{LEDGER_CATEGORIES[e.category] ?? e.category}</Pill>
                    </td>
                    <td className="px-3 py-3">{e.member_name ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-3 text-muted">{LEDGER_METHODS[e.method] ?? e.method}</td>
                    <td className={`px-3 py-3 text-right font-extrabold whitespace-nowrap tabular-nums ${cancelled ? 'text-muted line-through' : e.amount_cents < 0 ? 'text-danger' : 'text-ok'}`}>{signedEuros(e.amount_cents)}</td>
                    <td className="px-3 py-3 pr-5 whitespace-nowrap text-muted">
                      <Who e={e} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      ) : null}

      {!desktop && full ? (
        <Button variant="accent" icon={<Plus className="size-5" />} onClick={() => setCreating(true)}>
          Nouvelle écriture
        </Button>
      ) : null}

      {shown.length && !desktop ? (
        <Card className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-line-soft p-0">
            {shown.map((e) => {
              const sub = subline(e)
              const cancelled = reversedBy.has(e.id)
              return (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="w-8 shrink-0 pt-0.5 text-[12px] font-bold text-muted tabular-nums">{num(e.number)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-bold ${cancelled ? 'text-muted line-through' : ''}`}>{e.label}</span>
                    <span className="block text-[13px] text-muted">
                      {shortDay(e.entry_date)} · {LEDGER_CATEGORIES[e.category] ?? e.category} · {LEDGER_METHODS[e.method] ?? e.method}
                      {e.member_name ? ` · ${e.member_name}` : ''}
                    </span>
                    {sub ? <span className="block text-[12px] font-semibold text-danger">{sub}</span> : null}
                    <span className="block text-[12px] text-muted">
                      Saisie par <Who e={e} />
                    </span>
                    {canReverse(e) ? (
                      <button type="button" onClick={() => setReversing(e)} className="mt-1.5 inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-[12px] font-bold text-ink">
                        <Undo2 className="size-3.5" /> Corriger
                      </button>
                    ) : null}
                  </span>
                  <span className={`shrink-0 text-[15px] font-extrabold tabular-nums ${cancelled ? 'text-muted line-through' : e.amount_cents < 0 ? 'text-danger' : 'text-ok'}`}>{signedEuros(e.amount_cents)}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      <Note>
        <span className="inline-flex items-center gap-1.5 font-bold">
          <Lock className="size-3.5" /> Les écritures sont verrouillées.
        </span>{' '}
        Chaque ligne garde qui l'a saisie et quand. Les paiements HelloAsso arrivent tout seuls.
      </Note>

      {!desktop && shown.length ? (
        <Button variant="outline" icon={<Download className="size-5" />} onClick={exportCsv}>
          Exporter en CSV
        </Button>
      ) : null}

      {full ? (
        <>
          <NewEntryDialog open={creating} onClose={() => setCreating(false)} />
          <ReverseDialog entry={reversing} onClose={() => setReversing(null)} />
        </>
      ) : null}
    </BureauPage>
  )
}

