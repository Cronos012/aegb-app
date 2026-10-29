import { Fragment, useState } from 'react'
import { Check, Info, Mail, Smartphone, TriangleAlert, UserCheck } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { inputBase } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { errorMessage } from '../../lib/errors'
import { fullName, shortDate, TYPE_LABELS } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { can, useAccounts, useAction, useBureauCounts, useMe, type AccountsTab, type MemberRow } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { BureauPage, Card, Chips } from './BureauPage'

const REASONS = ["Pas membre de l'AEGB", 'Compte en double', 'Infos incomplètes']
const OTHER = 'Autre motif'

function EmailState({ row }: { row: MemberRow }) {
  return row.email_confirmed_at ? (
    <span className="inline-flex items-center gap-1 text-[13px] font-bold text-ok">
      <Check className="size-4" strokeWidth={2.6} /> email vérifié
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[13px] font-bold text-warn">
      <TriangleAlert className="size-4" /> email à confirmer
    </span>
  )
}

function RefusePanel({ name, busy, onCancel, onConfirm }: { name: string; busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [choice, setChoice] = useState<string | null>(null)
  const [other, setOther] = useState('')
  const reason = choice === OTHER ? other.trim() : choice
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-danger/30 bg-danger-soft/50 p-3.5 lg:flex-row lg:flex-wrap lg:items-center">
      <p className="m-0 text-[13px] font-bold lg:w-full">Pourquoi refuser ? {name} verra ce motif.</p>
      <div className="flex flex-wrap gap-2">
        {[...REASONS, OTHER].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setChoice(r)}
            aria-pressed={choice === r}
            className={`h-9 rounded-full px-3.5 text-[13px] font-semibold ${choice === r ? 'border-[1.5px] border-primary bg-select' : 'border border-line bg-surface'}`}
          >
            {r}
          </button>
        ))}
      </div>
      {choice === OTHER ? (
        <input className={`${inputBase} h-11 lg:flex-1`} placeholder="Écris le motif" value={other} maxLength={300} onChange={(e) => setOther(e.target.value)} aria-label="Autre motif" autoFocus />
      ) : null}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 lg:ml-auto lg:flex">
        <Button variant="outline" size="md" onClick={onCancel}>
          Annuler
        </Button>
        <Button variant="danger" size="md" busy={busy} disabled={!reason || reason.length < 3} onClick={() => reason && onConfirm(reason)}>
          Confirmer le refus
        </Button>
      </div>
    </div>
  )
}

export default function Comptes() {
  const me = useMe().data!
  const desktop = useIsDesktop()
  const toast = useToast()
  const [tab, setTab] = useState<AccountsTab>('en_attente')
  const [refusing, setRefusing] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const accounts = useAccounts(tab)
  const counts = useBureauCounts().data
  const canDecide = can(me, 'comptes')

  const validate = useAction((id: string) => supabase.rpc('validate_member', { p_member: id }))
  const refuse = useAction((v: { id: string; reason: string }) => supabase.rpc('refuse_member', { p_member: v.id, p_reason: v.reason }))

  async function doValidate(row: MemberRow) {
    setActionError(null)
    try {
      await validate.mutateAsync(row.id)
      toast(`Compte de ${fullName(row)} validé.`)
    } catch (e) {
      setActionError(errorMessage(e))
    }
  }

  async function doRefuse(row: MemberRow, reason: string) {
    setActionError(null)
    try {
      await refuse.mutateAsync({ id: row.id, reason })
      setRefusing(null)
      toast(`Compte de ${fullName(row)} refusé.`)
    } catch (e) {
      setActionError(errorMessage(e))
    }
  }

  const pendingCount = (counts?.pending ?? 0) + (counts?.pending_unconfirmed ?? 0)
  const tabs = [
    { value: 'en_attente' as const, label: 'En attente', count: pendingCount },
    { value: 'valides' as const, label: 'Validés' },
    { value: 'refuses' as const, label: 'Refusés' },
  ]

  const rows = accounts.data ?? []
  const busyId = validate.isPending ? validate.variables : refuse.isPending ? refuse.variables?.id : null

  function decisionButtons(row: MemberRow) {
    if (!canDecide) return null
    if (tab === 'en_attente') {
      return (
        <>
          <Button variant="danger-outline" size="md" onClick={() => setRefusing(row.id)} disabled={!!busyId}>
            Refuser
          </Button>
          <Button size="md" onClick={() => doValidate(row)} busy={busyId === row.id && validate.isPending} disabled={!row.email_confirmed_at || !!busyId}>
            Valider
          </Button>
        </>
      )
    }
    if (tab === 'refuses') {
      return (
        <Button variant="outline" size="md" onClick={() => doValidate(row)} busy={busyId === row.id} disabled={!row.email_confirmed_at || !!busyId}>
          Valider finalement
        </Button>
      )
    }
    return null
  }

  function detail(row: MemberRow) {
    if (tab === 'valides' && row.validated_at) {
      return `Compte validé le ${shortDate(row.validated_at)}${row.validator ? ` par ${fullName(row.validator)}` : ''}`
    }
    if (tab === 'refuses' && row.refused_at) {
      return `Demande refusée le ${shortDate(row.refused_at)}${row.refuser ? ` par ${fullName(row.refuser)}` : ''}`
    }
    return `inscription le ${shortDate(row.created_at)}`
  }

  const empty = {
    en_attente: ['Aucune demande en attente', 'Les nouvelles inscriptions apparaissent ici dès que la personne a confirmé son email.'],
    valides: ['Aucun compte validé', 'Les comptes que le bureau valide apparaissent ici.'],
    refuses: ['Aucun compte refusé', 'Les demandes refusées restent ici avec leur motif.'],
  }[tab]

  return (
    <BureauPage
      title="Comptes en attente"
      subtitle={desktop ? "Vérifie que chaque personne fait partie de l'AEGB. Une fois validée, elle entre dans l'appli." : "Vérifie que chaque personne fait partie de l'AEGB."}
      controls={(onDark) => <Chips label="Filtrer les comptes" options={tabs} value={tab} onChange={(t) => { setTab(t); setRefusing(null) }} onDark={onDark} />}
    >
      <ErrorNote error={actionError ?? accounts.error} />
      {accounts.isPending ? <PageLoader /> : null}
      {accounts.data && !rows.length ? (
        <Card>
          <EmptyState title={empty[0]} icon={<UserCheck className="size-6" />}>
            {empty[1]}
          </EmptyState>
        </Card>
      ) : null}

      {rows.length && !desktop
        ? rows.map((row) => (
            <Card key={row.id} className="flex flex-col gap-3.5 p-4">
              <div className="flex items-start gap-3">
                <Avatar person={row} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-2">
                    <p className="m-0 text-[16px] font-bold">{fullName(row)}</p>
                    {tab === 'en_attente' ? <EmailState row={row} /> : null}
                  </div>
                  <p className="m-0 text-[13px] text-muted">
                    {TYPE_LABELS[row.member_type]} · {detail(row)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                <span className="flex items-center gap-1.5">
                  <Mail className="size-3.5 text-muted" /> {row.member_contacts?.email}
                </span>
                {row.member_contacts?.phone ? (
                  <a href={`tel:${row.member_contacts.phone}`} className="flex items-center gap-1.5 text-ink no-underline">
                    <Smartphone className="size-3.5 text-muted" /> {row.member_contacts.phone}
                  </a>
                ) : null}
              </div>
              {tab === 'refuses' && row.refusal_reason ? <p className="m-0 rounded-xl bg-surface-2 px-3 py-2 text-[13px]">Motif : {row.refusal_reason}</p> : null}
              {refusing === row.id ? (
                <RefusePanel name={row.first_name} busy={refuse.isPending} onCancel={() => setRefusing(null)} onConfirm={(r) => doRefuse(row, r)} />
              ) : decisionButtons(row) ? (
                <div className={`grid gap-2.5 ${tab === 'en_attente' ? 'grid-cols-2' : 'grid-cols-1'}`}>{decisionButtons(row)}</div>
              ) : null}
              {tab === 'en_attente' && !row.email_confirmed_at ? <p className="m-0 text-[12px] text-muted">On pourra valider dès que la personne aura cliqué sur le lien reçu par email.</p> : null}
            </Card>
          ))
        : null}

      {rows.length && desktop ? (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-[12px] font-bold tracking-wide text-muted uppercase">
                <th className="px-5 py-3 font-bold">Personne</th>
                <th className="px-3 py-3 font-bold">Contact</th>
                <th className="px-3 py-3 font-bold">{tab === 'en_attente' ? 'Inscription' : tab === 'valides' ? 'Validation' : 'Refus'}</th>
                <th className="px-3 py-3 font-bold">{tab === 'refuses' ? 'Motif' : 'Email'}</th>
                <th className="px-5 py-3 text-right font-bold">{canDecide && tab !== 'valides' ? 'Décision' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-b border-line-soft last:border-0">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar person={row} size={38} />
                        <div>
                          <p className="m-0 font-bold">{fullName(row)}</p>
                          <p className="m-0 text-[13px] text-muted">{TYPE_LABELS[row.member_type]}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-[13px]">
                      <p className="m-0">{row.member_contacts?.email}</p>
                      <p className="m-0 text-muted">{row.member_contacts?.phone}</p>
                    </td>
                    <td className="px-3 py-3.5 text-[13px] text-muted">
                      {tab === 'en_attente' ? shortDate(row.created_at) : detail(row).replace(/^(Compte validé|Demande refusée) le /, '')}
                    </td>
                    <td className="max-w-[260px] px-3 py-3.5 text-[13px]">{tab === 'refuses' ? row.refusal_reason : <EmailState row={row} />}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">{refusing === row.id ? <span className="text-[13px] font-bold text-danger">Refus en cours</span> : decisionButtons(row)}</div>
                    </td>
                  </tr>
                  {refusing === row.id ? (
                    <tr className="border-b border-line-soft">
                      <td colSpan={5} className="px-5 pb-4">
                        <RefusePanel name={row.first_name} busy={refuse.isPending} onCancel={() => setRefusing(null)} onConfirm={(r) => doRefuse(row, r)} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <p className="m-0 flex items-start gap-2 px-2 text-[13px] text-muted">
        <Info className="mt-px size-4 shrink-0" /> Seuls les postes autorisés voient cet écran. La personne voit la décision du bureau dans l'appli, avec le motif en cas de refus.
      </p>
    </BureauPage>
  )
}
