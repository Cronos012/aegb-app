import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Ban, ChevronLeft, Lock, Mail, RotateCcw, Smartphone, TriangleAlert, X } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { MemberDues } from '../../components/dues/MemberDues'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { TextArea } from '../../components/Field'
import { Pill } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { errorMessage } from '../../lib/errors'
import { fullName, longDate, monthYear, shortDate, STATUS_LABELS, TYPE_LABELS, type MemberType } from '../../lib/format'
import { BUREAU, can, useAction, useMe, useMember, useMemberHistory, useRoles, useWarnings, type ActivityEntry, type MemberRow, type RoleWithHolder } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { motif } from './activity'

const TYPES: MemberType[] = ['etudiant', 'alumni', 'sympathisant', 'honneur']

export function statusTone(status: MemberRow['status']) {
  return status === 'actif' ? 'ok' : status === 'suspendu' ? 'danger' : status === 'refuse' ? 'neutral' : 'warn'
}

/** L'historique vu depuis la fiche du membre : « Compte validé par … ». */
function historyLine(e: ActivityEntry, roles: RoleWithHolder[]): string {
  const by = e.actor_id || e.discreet ? e.actor_name : e.actor_name === BUREAU ? 'le bureau' : 'AEGB'
  const d = (e.details ?? {}) as { poste?: string; avant?: string; apres?: string }
  const poste = roles.find((r) => r.code === d.poste)?.label ?? d.poste
  switch (e.action) {
    case 'inscription':
      return `Compte créé (${e.summary.match(/\(([^)]+)\)/)?.[1] ?? 'inscription'})`
    case 'email_confirme':
      return 'Email confirmé'
    case 'validation':
      return `Compte validé par ${by}`
    case 'refus':
      return `Compte refusé par ${by}`
    case 'suspension':
      return `Compte suspendu par ${by}`
    case 'reactivation':
      return `Compte réactivé par ${by}`
    case 'changement_type':
      return `Type changé par ${by} : ${TYPE_LABELS[d.avant as MemberType] ?? d.avant} → ${TYPE_LABELS[d.apres as MemberType] ?? d.apres}`
    case 'avertissement':
      return `Avertissement donné par ${by}`
    case 'attribution_poste':
      return `Poste ${poste} attribué par ${by}`
    case 'retrait_poste':
      return `Poste ${poste} retiré par ${by}`
    default:
      return `${by} ${e.summary}`
  }
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-[12px] bg-surface p-4 lg:rounded-none lg:bg-transparent lg:p-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="m-0 text-[15px] font-bold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

type ReasonDialog = { kind: 'avertir' | 'suspendre' } | null

/** Fiche d'un membre : page sur téléphone, panneau latéral sur ordinateur. */
export function FichePanel({ id, onClose, drawer = false }: { id: string; onClose?: () => void; drawer?: boolean }) {
  const me = useMe().data!
  const toast = useToast()
  const member = useMember(id)
  const history = useMemberHistory(id)
  const warnings = useWarnings(id)
  const roles = useRoles().data ?? []
  const [tab, setTab] = useState<'infos' | 'cotisation' | 'historique' | 'avertissements'>('infos')
  const [dialog, setDialog] = useState<ReasonDialog>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const setType = useAction((t: MemberType) => supabase.rpc('set_member_type', { p_member: id, p_type: t }))
  const warn = useAction((r: string) => supabase.rpc('warn_member', { p_member: id, p_reason: r }))
  const suspend = useAction((r: string) => supabase.rpc('suspend_member', { p_member: id, p_reason: r }))
  const reactivate = useAction(() => supabase.rpc('reactivate_member', { p_member: id }))

  if (member.isPending) return <PageLoader />
  if (member.isError) return <ErrorNote error={member.error} className="m-4" />
  const m = member.data
  const role = roles.find((r) => r.holder?.id === m.id) ?? null
  const isSelf = m.id === me.profile.id
  const manage = can(me, 'membres') && !isSelf

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null)
    try {
      await action()
      toast(done)
      setDialog(null)
      setReason('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const header = (
    <div className={`flex items-center gap-4 ${drawer ? '' : 'flex-col text-center'}`}>
      <Avatar person={m} size={drawer ? 64 : 84} ring />
      <div className={`min-w-0 ${drawer ? '' : 'flex flex-col items-center'}`}>
        <h2 className={`titre m-0 leading-tight ${drawer ? 'text-[26px]' : 'text-[28px] text-white'}`}>{fullName(m)}</h2>
        <p className={`m-0 mt-1 text-[13px] ${drawer ? 'text-muted' : 'text-white/80'}`}>
          {[TYPE_LABELS[m.member_type], m.city, m.school].filter(Boolean).join(' · ')}
          {m.validated_at ? ` · membre depuis ${monthYear(m.validated_at)}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill tone={statusTone(m.status)}>{STATUS_LABELS[m.status]}</Pill>
          {role ? <Pill tone="safran">{role.label}</Pill> : null}
          {warnings.data?.length ? (
            <Pill tone="warn">
              {warnings.data.length} avertissement{warnings.data.length > 1 ? 's' : ''}
            </Pill>
          ) : null}
        </div>
      </div>
    </div>
  )

  const infos = (
    <div className="flex flex-col gap-3 lg:gap-6">
      <Section title="Coordonnées">
        <dl className="m-0 grid grid-cols-1 gap-3 text-[14px] lg:grid-cols-2">
          <div>
            <dt className="text-[12px] font-bold tracking-wide text-muted uppercase">Email</dt>
            <dd className="m-0 mt-0.5 flex items-center gap-1.5 break-all">
              <Mail className="size-3.5 shrink-0 text-muted lg:hidden" />
              {m.member_contacts?.email}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] font-bold tracking-wide text-muted uppercase">Téléphone</dt>
            <dd className="m-0 mt-0.5 flex items-center gap-1.5">
              <Smartphone className="size-3.5 shrink-0 text-muted lg:hidden" />
              {m.member_contacts?.phone ? <a href={`tel:${m.member_contacts.phone}`}>{m.member_contacts.phone}</a> : <span className="text-muted">Non renseigné</span>}
            </dd>
          </div>
          {[
            ['Ville', m.city],
            ['École', m.school],
            ['Formation', m.formation],
            ['Inscription', longDate(m.created_at)],
            ['Validation', m.validated_at ? `${longDate(m.validated_at)}${m.validator ? `, par ${fullName(m.validator)}` : ''}` : null],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[12px] font-bold tracking-wide text-muted uppercase">{label}</dt>
              <dd className="m-0 mt-0.5">{value || <span className="text-muted">Non renseigné</span>}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 mt-3 flex items-center gap-1.5 text-[12px] text-muted">
          <Lock className="size-3" /> Coordonnées visibles seulement par le bureau
        </p>
      </Section>

      <Section title="Type de membre">
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => {
            const active = m.member_type === t
            return (
              <button
                key={t}
                type="button"
                disabled={!can(me, 'membres') || setType.isPending}
                onClick={() => !active && run(() => setType.mutateAsync(t), `Type de ${m.first_name} changé : ${TYPE_LABELS[t]}.`)}
                aria-pressed={active}
                className={`h-11 rounded-xl text-[14px] font-bold disabled:cursor-default ${active ? 'border-2 border-primary bg-select' : 'border-[1.5px] border-line bg-surface text-ink enabled:hover:bg-surface-2'}`}
              >
                {TYPE_LABELS[t]}
              </button>
            )
          })}
        </div>
        <p className="m-0 mt-2.5 text-[12px] leading-[1.45] text-muted">Membre d'honneur est donné seulement par le bureau. Chaque changement est noté dans le journal.</p>
      </Section>

      <Section
        title="Poste au bureau"
        action={
          can(me, 'postes') && !role ? (
            <Link to="/bureau/postes" className="text-[13px] font-bold">
              Attribuer un poste
            </Link>
          ) : null
        }
      >
        <p className="m-0 text-[15px] font-semibold">{role ? role.label : 'Aucun'}</p>
        {role ? <p className="m-0 mt-0.5 text-[13px] text-muted">{role.description}</p> : null}
      </Section>
    </div>
  )

  // La cotisation n'apparaît qu'aux postes qui ont accès à l'argent.
  const seesMoney = can(me, 'tresorerie', 'lecture') && m.status !== 'en_attente' && m.status !== 'refuse'
  const duesSection = seesMoney ? (
    <Section title="Cotisation">
      <MemberDues memberId={m.id} canCollect={can(me, 'tresorerie')} />
    </Section>
  ) : null

  const historyList = (
    <Section title="Historique">
      {history.isPending ? <PageLoader /> : null}
      <ErrorNote error={history.error} />
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {history.data?.map((e) => (
          <li key={e.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 text-[14px]">
            <span className="text-muted">{shortDate(e.created_at)}</span>
            <span>
              {historyLine(e, roles)}
              {motif(e) ? <span className="block text-[13px] text-muted">Motif : {motif(e)}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  )

  const warningList = (
    <Section title="Avertissements">
      {warnings.data?.length ? (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {warnings.data.map((w) => (
            <li key={w.id} className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[14px]">
              <p className="m-0">{w.reason}</p>
              <p className="m-0 mt-1 text-[12px] text-muted">
                {longDate(w.created_at)}, par {!w.given_by && w.given_by_name === BUREAU ? 'le bureau' : w.given_by_name}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[14px] text-muted">Aucun avertissement.</p>
      )}
    </Section>
  )

  const actions = manage ? (
    <div className="grid grid-cols-2 gap-2.5">
      <Button variant="outline" size="md" icon={<TriangleAlert className="size-4" />} onClick={() => setDialog({ kind: 'avertir' })} disabled={m.status !== 'actif'}>
        Avertir
      </Button>
      {m.status === 'suspendu' ? (
        <Button variant="outline" size="md" icon={<RotateCcw className="size-4" />} busy={reactivate.isPending} onClick={() => run(() => reactivate.mutateAsync(undefined), `Compte de ${m.first_name} réactivé.`)}>
          Réactiver
        </Button>
      ) : (
        <Button variant="danger-outline" size="md" icon={<Ban className="size-4" />} onClick={() => setDialog({ kind: 'suspendre' })} disabled={m.status !== 'actif'}>
          Suspendre
        </Button>
      )}
    </div>
  ) : null

  const dialogs = (
    <Dialog
      open={!!dialog}
      onClose={() => {
        setDialog(null)
        setError(null)
      }}
      title={dialog?.kind === 'suspendre' ? `Suspendre ${m.first_name} ?` : `Avertir ${m.first_name}`}
      description={
        dialog?.kind === 'suspendre'
          ? "Le compte n'aura plus accès à l'appli jusqu'à sa réactivation. Le motif lui sera montré."
          : "L'avertissement est noté sur sa fiche et dans le journal. Le membre le voit."
      }
      footer={
        <>
          <Button variant="outline" size="md" className="flex-1" onClick={() => setDialog(null)}>
            Annuler
          </Button>
          <Button
            variant={dialog?.kind === 'suspendre' ? 'danger' : 'primary'}
            size="md"
            className="flex-1"
            disabled={reason.trim().length < 3}
            busy={warn.isPending || suspend.isPending}
            onClick={() =>
              dialog?.kind === 'suspendre'
                ? run(() => suspend.mutateAsync(reason.trim()), `Compte de ${m.first_name} suspendu.`)
                : run(() => warn.mutateAsync(reason.trim()), `Avertissement envoyé à ${m.first_name}.`)
            }
          >
            {dialog?.kind === 'suspendre' ? 'Suspendre' : 'Avertir'}
          </Button>
        </>
      }
    >
      <TextArea label="Motif" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={dialog?.kind === 'suspendre' ? 300 : 500} counter placeholder="Explique en une ou deux phrases" />
      <ErrorNote error={error} className="mt-3" />
    </Dialog>
  )

  if (drawer) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          {header}
          {onClose ? (
            <button type="button" onClick={onClose} aria-label="Fermer la fiche" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink">
              <X className="size-5" />
            </button>
          ) : null}
        </div>
        <div className="mt-5 flex gap-6 border-b border-line-soft px-6" role="tablist">
          {(
            [
              ['infos', 'Infos'],
              ...(seesMoney ? ([['cotisation', 'Cotisation']] as const) : []),
              ['historique', 'Historique'],
              ['avertissements', `Avertissements${warnings.data?.length ? ` · ${warnings.data.length}` : ''}`],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`-mb-px border-b-[3px] pb-2.5 text-[14px] font-bold ${tab === key ? 'border-safran text-ink' : 'border-transparent text-muted'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === 'infos' ? infos : tab === 'cotisation' ? duesSection : tab === 'historique' ? historyList : warningList}
          {m.status === 'suspendu' && m.suspension_reason ? (
            <p className="m-0 mt-5 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px]">
              <strong>Compte suspendu le {m.suspended_at ? longDate(m.suspended_at) : ''}.</strong> Motif : {m.suspension_reason}
            </p>
          ) : null}
          <ErrorNote error={dialog ? null : error} className="mt-4" />
        </div>
        {actions ? <div className="border-t border-line-soft px-6 py-4">{actions}</div> : null}
        {dialogs}
      </div>
    )
  }

  return (
    <>
      <header className="bg-tisse px-5 pt-[max(env(safe-area-inset-top),8px)] pb-12 text-white">
        <Link to="/bureau/membres" aria-label="Retour aux membres" className="-ml-2.5 grid size-11 place-items-center rounded-xl text-white hover:bg-white/10">
          <ChevronLeft className="size-6" />
        </Link>
        <div className="mt-1">{header}</div>
      </header>
      <div className="relative -mt-6 flex flex-col gap-3 px-3 pb-6">
        {m.status === 'suspendu' && m.suspension_reason ? (
          <p className="m-0 rounded-[12px] bg-danger-soft px-4 py-3 text-[13px]">
            <strong>Compte suspendu le {m.suspended_at ? longDate(m.suspended_at) : ''}.</strong> Motif : {m.suspension_reason}
          </p>
        ) : null}
        {infos}
        {duesSection}
        {historyList}
        {warningList}
        <ErrorNote error={dialog ? null : error} />
        {actions ? <div className="rounded-[12px] bg-surface p-4">{actions}</div> : null}
      </div>
      {dialogs}
    </>
  )
}
