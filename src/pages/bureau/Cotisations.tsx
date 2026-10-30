import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Banknote, BellRing, CalendarDays, ChevronRight, Download, Settings, Wallet } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button, ButtonLink } from '../../components/Button'
import { MonthCell, MonthLegend, MonthStrip } from '../../components/dues/MonthGrid'
import { EmptyState, ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { SearchField } from '../../components/Field'
import { Pill } from '../../components/Pill'
import { downloadCsv } from '../../lib/csv'
import {
  addMonths,
  euros,
  exerciseLabel,
  frenchDay,
  monthName,
  monthShort,
  monthYearLabel,
  paidThisYear,
  statusShort,
  useDuesMatrix,
  useDuesSettings,
  type MatrixRow,
} from '../../lib/dues'
import { fullName, TYPE_LABELS } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { can, useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { BureauPage, Card, Chips } from './BureauPage'

type Filter = 'tous' | 'retard' | 'a_jour' | 'pas_due'

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function matches(row: MatrixRow, filter: Filter) {
  if (filter === 'tous') return true
  if (filter === 'pas_due') return row.dues.status === 'pas_due' || row.dues.status === 'pas_encore'
  return row.dues.status === filter
}

/** Les paiements hors carte, pour marquer d'un billet les mois payés en espèces, virement ou chèque. */
/** Les paiements confirmés : lesquels sont hors carte (pour l'icône), et leur quittance (pour ouvrir une case). */
function useConfirmedPayments(enabled: boolean) {
  return useQuery({
    queryKey: ['bureau', 'cotisations', 'paiements'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('dues_payments').select('id, method, receipt_number').eq('status', 'confirme')
      if (error) throw error
      return {
        offline: new Set(data.filter((p) => p.method !== 'carte').map((p) => p.id)),
        receipts: new Map(data.flatMap((p) => (p.receipt_number ? [[p.id, p.receipt_number] as const] : []))),
      }
    },
  })
}

function Tile({ label, value, detail, tone = '' }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[20px] bg-surface px-[18px] py-4">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className={`titre text-[28px] leading-none ${tone}`}>{value}</span>
      <span className="text-[13px] text-muted">{detail}</span>
    </div>
  )
}

export default function Cotisations() {
  const desktop = useIsDesktop()
  const navigate = useNavigate()
  const me = useMe().data
  const full = can(me, 'tresorerie')
  const matrix = useDuesMatrix()
  const settings = useDuesSettings().data
  const confirmed = useConfirmedPayments(true).data
  const offline = confirmed?.offline
  const [filter, setFilter] = useState<Filter>('tous')
  const [query, setQuery] = useState('')

  const rows = useMemo(() => matrix.data ?? [], [matrix.data])
  const sample = rows[0]?.dues
  const current = sample?.current_month
  const paying = rows.filter((r) => r.dues.paying && r.dues.status !== 'pas_encore')
  const late = rows.filter((r) => r.dues.status === 'retard')
  const radiable = rows.filter((r) => r.dues.radiation_possible).length
  const upToDate = rows.filter((r) => r.dues.status === 'a_jour')
  const exempt = rows.filter((r) => r.dues.status === 'pas_due' || r.dues.status === 'pas_encore')
  const monthly = settings?.monthly_cents ?? sample?.monthly_cents ?? 0
  const expected = current ? paying.filter((r) => (r.dues.dues_from ?? current) <= current).length * monthly : 0
  const received = current
    ? rows.reduce((sum, r) => sum + (r.dues.months.find((m) => m.month === current && m.state === 'paye')?.amount_cents ?? 0), 0)
    : 0
  const toCatchUp = late.reduce((sum, r) => sum + r.dues.late_cents, 0)

  const q = normalize(query.trim())
  const shown = rows.filter((r) => matches(r, filter)).filter((r) => !q || normalize(fullName(r)).includes(q))
  const options: { value: Filter; label: string; count: number }[] = [
    { value: 'tous', label: 'Tous', count: rows.length },
    { value: 'retard', label: 'En retard', count: late.length },
    { value: 'a_jour', label: 'À jour', count: upToDate.length },
    { value: 'pas_due', label: 'Exonérés', count: exempt.length },
  ]

  function exportCsv() {
    const months = sample?.months.slice(0, 12) ?? []
    downloadCsv(
      `cotisations-aegb-${sample ? exerciseLabel(sample.exercise_start) : ''}.csv`,
      ['Prénom', 'Nom', 'Type', 'Statut', ...months.map((m) => monthYearLabel(m.month)), 'Payé (€)', 'En retard (€)'],
      rows.map((r) => [
        r.first_name,
        r.last_name,
        TYPE_LABELS[r.member_type],
        statusShort(r.dues).label,
        ...r.dues.months.slice(0, 12).map((m) => ({ paye: 'payé', retard: 'en retard', en_cours: 'à payer', a_venir: '', pas_du: 'pas dû' })[m.state]),
        (paidThisYear(r.dues) / 100).toFixed(2).replace('.', ','),
        (r.dues.late_cents / 100).toFixed(2).replace('.', ','),
      ]),
    )
  }

  const subtitle = settings ? `Année ${sample ? exerciseLabel(sample.exercise_start) : ''}, de janvier à décembre. ${euros(settings.monthly_cents)} par mois.` : undefined
  const open = (r: MatrixRow) => (full ? navigate(`/bureau/cotisations/encaisser?membre=${r.member_id}`) : can(me, 'membres', 'lecture') ? navigate(`/bureau/membres/${r.member_id}`) : undefined)

  return (
    <BureauPage
      title="Cotisations"
      subtitle={desktop ? subtitle : current ? `${monthYearLabel(current).replace(/^./, (c) => c.toUpperCase())} · ${euros(monthly)} par mois` : undefined}
      actions={
        <>
          <ButtonLink to="/bureau/cotisations/reglages" variant="outline" size="md" icon={<Settings className="size-4" />}>
            Réglages
          </ButtonLink>
          <Button variant="outline" size="md" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!rows.length}>
            Exporter
          </Button>
          {full ? (
            <ButtonLink to="/bureau/cotisations/encaisser" size="md" icon={<Banknote className="size-4" />}>
              Encaisser un paiement
            </ButtonLink>
          ) : null}
        </>
      }
      controls={(onDark) => (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchField value={query} onChange={setQuery} placeholder="Rechercher un membre" className={onDark ? 'border-transparent' : 'lg:order-2 lg:w-[280px]'} />
          <Chips label="Filtrer" options={options} value={filter} onChange={setFilter} onDark={onDark} />
        </div>
      )}
    >
      <ErrorNote error={matrix.error} />
      {matrix.isPending ? <PageLoader /> : null}

      {rows.length && current ? (
        desktop ? (
          <div className="grid grid-cols-4 gap-4">
            <Tile label={`Attendu pour ${monthName(current)}`} value={euros(expected)} detail={`${paying.length} membres × ${euros(monthly)}`} />
            <Tile label={`Encaissé pour ${monthName(current)}`} value={euros(received)} detail={expected ? `${Math.round((received / expected) * 100)} % de l'attendu` : 'Rien d’attendu'} tone="text-ok" />
            <Tile label="En retard" value={`${late.length} membre${late.length > 1 ? 's' : ''}`} detail={`${euros(toCatchUp)} à rattraper`} tone={late.length ? 'text-danger' : ''} />
            <Tile label="Exonérés" value={`${exempt.length} membre${exempt.length > 1 ? 's' : ''}`} detail="Alumni, sympathisants, honneur" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Tile label="À jour" value={String(upToDate.length)} detail={`sur ${paying.length} qui cotisent`} tone="text-ok" />
            <Tile label="En retard" value={String(late.length)} detail={`${euros(toCatchUp)} à rattraper`} tone={late.length ? 'text-danger' : ''} />
          </div>
        )
      ) : null}

      {radiable ? (
        <Note tone="danger">
          {radiable > 1 ? `${radiable} membres ont` : '1 membre a'} trois mois de retard ou plus malgré le rappel : le bureau peut prononcer la radiation (article 32 des statuts).
        </Note>
      ) : null}

      {matrix.data && !shown.length ? (
        <Card>
          <EmptyState title="Personne ici" icon={<Wallet className="size-6" />}>
            {query ? 'Essaie avec une autre orthographe.' : 'Aucun membre ne correspond à ce filtre.'}
          </EmptyState>
        </Card>
      ) : null}

      {shown.length && desktop ? (
        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between px-5 pt-4">
            <MonthLegend items={['paye', 'retard', 'en_cours', 'a_venir', 'pas_du']} />
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Banknote className="size-3.5" /> Payé en espèces, virement ou chèque
            </span>
          </div>
          <table className="mt-2 w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-[12px] text-muted">
                <th className="px-5 py-3 font-bold tracking-wide uppercase">Membre</th>
                {sample!.months.slice(0, 12).map((m) => (
                  <th key={m.month} className="px-0.5 py-3 text-center font-bold">
                    {monthShort(m.month)}
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-bold tracking-wide uppercase">Payé</th>
                <th className="px-3 py-3 pr-5 text-right font-bold tracking-wide uppercase">Reste</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.member_id} onClick={() => open(r)} className={`border-b border-line-soft last:border-0 ${full ? 'cursor-pointer hover:bg-surface-2' : ''}`}>
                  <td className="px-5 py-2.5">
                    <span className="flex items-center gap-3">
                      <Avatar person={{ id: r.member_id, first_name: r.first_name, last_name: r.last_name, avatar_path: r.avatar_path }} size={34} />
                      <span className="min-w-0">
                        <span className="block font-bold whitespace-nowrap">{fullName(r)}</span>
                        <span className="block text-[12px] text-muted">{r.status === 'suspendu' ? 'Suspendu' : TYPE_LABELS[r.member_type]}</span>
                        {r.dues.radiation_possible ? <span className="block text-[12px] font-bold text-danger">Radiation possible</span> : null}
                      </span>
                    </span>
                  </td>
                  {r.dues.months.slice(0, 12).map((m) => (
                    <td key={m.month} className="px-0.5 py-2.5">
                      {m.payment_id && confirmed?.receipts.get(m.payment_id) ? (
                        <Link
                          to={`/app/cotisation/quittances/${confirmed.receipts.get(m.payment_id)}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Quittance n° ${confirmed.receipts.get(m.payment_id)}`}
                          className="mx-auto block w-fit rounded-[11px] hover:ring-2 hover:ring-primary/30"
                        >
                          <MonthCell month={m} cash={offline} label={`${fullName(r)}, ${monthYearLabel(m.month)}, quittance n° ${confirmed.receipts.get(m.payment_id)}`} />
                        </Link>
                      ) : (
                        <MonthCell month={m} cash={offline} label={`${fullName(r)}, ${monthYearLabel(m.month)}`} />
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">{r.dues.paying ? euros(paidThisYear(r.dues)) : '—'}</td>
                  <td className={`px-3 py-2.5 pr-5 text-right font-bold whitespace-nowrap ${r.dues.late_cents ? 'text-danger' : 'text-muted'}`}>{r.dues.paying ? euros(r.dues.late_cents) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {shown.length && !desktop ? (
        <Card className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-line-soft p-0">
            {shown.map((r) => {
              const st = statusShort(r.dues)
              const body = (
                <>
                  <Avatar person={{ id: r.member_id, first_name: r.first_name, last_name: r.last_name, avatar_path: r.avatar_path }} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="truncate text-[15px] font-bold">{fullName(r)}</span>
                    {r.dues.radiation_possible ? <span className="text-[12px] font-bold text-danger">Radiation possible</span> : null}
                    <MonthStrip months={r.dues.months} label={`${fullName(r)} : ${st.label}`} />
                  </span>
                  <Pill tone={st.tone}>{st.label}</Pill>
                  {full ? <ChevronRight className="size-5 shrink-0 text-muted" /> : null}
                </>
              )
              return (
                <li key={r.member_id}>
                  {full ? (
                    <Link to={`/bureau/cotisations/encaisser?membre=${r.member_id}`} className="flex items-center gap-3 px-4 py-3 text-ink no-underline">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {!desktop && full ? (
        <ButtonLink to="/bureau/cotisations/encaisser" variant="accent" icon={<Banknote className="size-5" />}>
          Encaisser un paiement
        </ButtonLink>
      ) : null}

      {!desktop && rows.length ? (
        <Button variant="outline" icon={<Download className="size-5" />} onClick={exportCsv}>
          Exporter en CSV
        </Button>
      ) : null}

      {settings && current ? (
        <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
          <Card className="flex items-center gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-safran-pale text-[#6B4A00]">
              <BellRing className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{settings.reminders ? 'Relance automatique le 1er de chaque mois' : 'Relance automatique coupée'}</span>
              <span className="block text-[13px] text-muted">
                {settings.reminders ? `Message privé d'AEGB aux membres en retard. Prochaine : ${frenchDay(addMonths(current, 1))}.` : 'Personne ne reçoit de rappel. Tu peux la rallumer dans les réglages.'}
              </span>
            </span>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-select text-link">
              <CalendarDays className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">Début officiel : {frenchDay(settings.start_month)}</span>
              <span className="block text-[13px] text-muted">Un membre arrivé après ne doit que les mois à partir de sa validation.</span>
            </span>
            <Link to="/bureau/cotisations/reglages" className="text-sm font-bold">
              Réglages
            </Link>
          </Card>
        </div>
      ) : null}
    </BureauPage>
  )
}
