import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight, Download, Users } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { SearchField } from '../../components/Field'
import { Pill } from '../../components/Pill'
import { downloadCsv } from '../../lib/csv'
import { fullName, longDate, STATUS_LABELS, TYPE_LABELS, TYPE_PLURALS, type MemberType } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { useMembers, useRoles, type MemberRow } from '../../lib/queries'
import { BureauPage, Card, Chips } from './BureauPage'
import { FichePanel, statusTone } from './fiche'

type Filter = 'tous' | MemberType | 'suspendus'

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function Membres({ openId }: { openId?: string }) {
  const desktop = useIsDesktop()
  const navigate = useNavigate()
  const members = useMembers()
  const roles = useRoles().data
  const [filter, setFilter] = useState<Filter>('tous')
  const [query, setQuery] = useState('')

  const roleOf = useMemo(() => new Map((roles ?? []).filter((r) => r.holder).map((r) => [r.holder!.id, r])), [roles])
  const all = members.data ?? []
  const actives = all.filter((m) => m.status === 'actif')

  const count = (f: Filter) => (f === 'tous' ? actives.length : f === 'suspendus' ? all.filter((m) => m.status === 'suspendu').length : actives.filter((m) => m.member_type === f).length)
  const options = (['tous', 'etudiant', 'alumni', 'sympathisant', 'honneur', 'suspendus'] as Filter[])
    .map((f) => ({ value: f, label: f === 'tous' ? 'Actifs' : f === 'suspendus' ? 'Suspendus' : TYPE_PLURALS[f], count: count(f) }))
    .filter((o) => o.value === 'tous' || o.count > 0 || o.value === filter)

  const q = normalize(query.trim())
  const rows = all
    .filter((m) => (filter === 'tous' ? m.status === 'actif' : filter === 'suspendus' ? m.status === 'suspendu' : m.status === 'actif' && m.member_type === filter))
    .filter((m) => !q || normalize([m.first_name, m.last_name, m.member_contacts?.email, m.city, m.school].filter(Boolean).join(' ')).includes(q))

  function exportCsv() {
    downloadCsv(
      `membres-aegb-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Prénom', 'Nom', 'Type', 'Statut', 'Poste', 'Email', 'Téléphone', 'Ville', 'École', 'Formation', 'Membre depuis'],
      all.map((m) => [
        m.first_name,
        m.last_name,
        TYPE_LABELS[m.member_type],
        STATUS_LABELS[m.status],
        roleOf.get(m.id)?.label ?? '',
        m.member_contacts?.email,
        m.member_contacts?.phone,
        m.city,
        m.school,
        m.formation,
        m.validated_at ? longDate(m.validated_at) : '',
      ]),
    )
  }

  const subtitle = `${actives.length} membre${actives.length > 1 ? 's' : ''} actif${actives.length > 1 ? 's' : ''}, dont ${roleOf.size} au bureau.`

  return (
    <BureauPage
      title="Membres"
      subtitle={desktop ? `${subtitle} Clique sur une ligne pour ouvrir la fiche.` : subtitle}
      actions={
        <Button variant="outline" size="md" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!all.length}>
          Exporter
        </Button>
      }
      controls={(onDark) => (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchField value={query} onChange={setQuery} placeholder="Rechercher un membre" className={onDark ? 'border-transparent' : 'lg:order-2 lg:w-[280px]'} />
          <Chips label="Filtrer par type" options={options} value={filter} onChange={setFilter} onDark={onDark} />
        </div>
      )}
    >
      <ErrorNote error={members.error} />
      {members.isPending ? <PageLoader /> : null}
      {members.data && !rows.length ? (
        <Card>
          <EmptyState title="Aucun membre trouvé" icon={<Users className="size-6" />}>
            {query ? 'Essaie avec une autre orthographe.' : 'Les membres validés apparaissent ici.'}
          </EmptyState>
        </Card>
      ) : null}

      {rows.length && !desktop ? (
        <Card className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-line-soft p-0">
            {rows.map((m) => {
              const role = roleOf.get(m.id)
              return (
                <li key={m.id}>
                  <Link to={`/bureau/membres/${m.id}`} className="flex items-center gap-3 px-4 py-3 text-ink no-underline">
                    <Avatar person={m} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[15px] font-bold">{fullName(m)}</p>
                      <p className="m-0 truncate text-[13px] text-muted">
                        {TYPE_LABELS[m.member_type]}
                        {role ? ` · ${role.label}` : ''}
                      </p>
                    </div>
                    {m.status === 'suspendu' ? <Pill tone="danger">Suspendu</Pill> : role ? <Pill tone="safran">Bureau</Pill> : null}
                    <ChevronRight className="size-5 shrink-0 text-muted" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {rows.length && desktop ? (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-[12px] tracking-wide text-muted uppercase">
                <th className="px-5 py-3 font-bold">Membre</th>
                <th className="px-3 py-3 font-bold">Type</th>
                <th className="px-3 py-3 font-bold">Poste</th>
                <th className="px-3 py-3 font-bold">Ville et école</th>
                <th className="px-3 py-3 font-bold">Statut</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m: MemberRow) => {
                const role = roleOf.get(m.id)
                return (
                  <tr key={m.id} onClick={() => navigate(`/bureau/membres/${m.id}`)} className={`cursor-pointer border-b border-line-soft last:border-0 hover:bg-surface-2 ${openId === m.id ? 'bg-select' : ''}`}>
                    <td className="px-5 py-3">
                      <Link to={`/bureau/membres/${m.id}`} className="flex items-center gap-3 text-ink no-underline" onClick={(e) => e.stopPropagation()}>
                        <Avatar person={m} size={36} />
                        <span className="min-w-0">
                          <span className="block font-bold">{fullName(m)}</span>
                          <span className="block truncate text-[13px] text-muted">{m.member_contacts?.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">{TYPE_LABELS[m.member_type]}</td>
                    <td className="px-3 py-3">{role ? <Pill tone="safran">{role.label}</Pill> : <span className="text-muted">–</span>}</td>
                    <td className="px-3 py-3 text-muted">{[m.city, m.school].filter(Boolean).join(' · ') || '–'}</td>
                    <td className="px-3 py-3">
                      <Pill tone={statusTone(m.status)}>{STATUS_LABELS[m.status]}</Pill>
                    </td>
                    <td className="px-3 py-3 text-muted">
                      <ChevronRight className="size-5" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      ) : null}

      {desktop && openId ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-nuit/45" onClick={() => navigate('/bureau/membres')}>
          <aside className="h-full w-[540px] max-w-full bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()} aria-label="Fiche du membre">
            <FichePanel id={openId} drawer onClose={() => navigate('/bureau/membres')} />
          </aside>
        </div>
      ) : null}
    </BureauPage>
  )
}
