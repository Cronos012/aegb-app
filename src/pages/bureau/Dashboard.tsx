import { Link } from 'react-router'
import { Briefcase, ChevronRight, HardDrive, ShieldAlert, Star, UserCheck, UserPlus, Users } from 'lucide-react'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { Pill } from '../../components/Pill'
import { useModerationPending, useStorageUsed } from '../../lib/feed'
import { useIsDesktop } from '../../lib/media'
import { can, useAccounts, useActivity, useBureauCounts, useMe, useRoles } from '../../lib/queries'
import { ActivityLine } from './activity'
import { BureauPage, Card } from './BureauPage'

const COMING = ['Trésorerie', 'Élections', 'Événements', 'Documents', 'Messages']

/** L'offre gratuite de Supabase : 1 Go pour les photos et les vidéos. */
const STORAGE_LIMIT = 1024 ** 3

function megabytes(bytes: number) {
  const mb = bytes / 1024 ** 2
  return mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb).toString()
}

function StorageCard({ used }: { used: number }) {
  const percent = Math.min(100, (used / STORAGE_LIMIT) * 100)
  return (
    <Card className="p-4 lg:p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-select text-ink">
          <HardDrive className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-bold">Photos et vidéos</h2>
          <p className="m-0 text-[13px] text-muted">
            {megabytes(used)} Mo utilisés sur 1 Go{percent >= 80 ? ' : il faudra bientôt faire de la place' : ''}
          </p>
        </div>
        <span className="titre text-[18px]">{percent < 1 ? '< 1' : Math.round(percent)} %</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line-soft">
        <div className={`h-full rounded-full ${percent >= 80 ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${Math.max(percent, 1)}%` }} />
      </div>
    </Card>
  )
}

function today() {
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date())
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Kpi({ icon, label, value, detail, to }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail?: string; to?: string }) {
  const body = (
    <>
      <span className="grid size-10 place-items-center rounded-xl bg-select text-ink">{icon}</span>
      <span className="titre mt-3 block text-[30px] leading-none">{value}</span>
      <span className="mt-2 block text-[14px] font-semibold">{label}</span>
      {detail ? <span className="mt-0.5 block text-[13px] text-muted">{detail}</span> : null}
    </>
  )
  const cls = 'block rounded-[22px] bg-surface p-5 text-ink no-underline'
  return to ? (
    <Link to={to} className={`${cls} hover:ring-2 hover:ring-line`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export default function Dashboard() {
  const me = useMe().data!
  const desktop = useIsDesktop()
  const seesAccounts = can(me, 'comptes', 'lecture')
  const seesJournal = can(me, 'journal', 'lecture')
  const seesRoles = can(me, 'postes', 'lecture')
  const seesReports = can(me, 'moderation', 'lecture')
  const reports = useModerationPending(seesReports).data ?? 0
  const storage = useStorageUsed()
  const counts = useBureauCounts()
  const pending = useAccounts('en_attente', seesAccounts)
  const roles = useRoles()
  const activity = useActivity(6, null, null, seesJournal)

  if (counts.isPending) return <PageLoader />
  const c = counts.data
  const vacant = roles.data?.filter((r) => !r.holder) ?? []
  const pendingNames = pending.data?.filter((p) => p.email_confirmed_at).slice(0, 3).map((p) => `${p.first_name} ${p.last_name}`).join(', ')
  const full = me.guarantor || ['presidence', 'vice_presidence'].includes(me.role?.code ?? '')

  const kicker = desktop ? null : (
    <span className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-safran px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-nuit">
      <Briefcase className="size-3.5" /> MODE BUREAU
    </span>
  )

  return (
    <BureauPage
      title="Tableau de bord"
      back={null}
      kicker={kicker}
      subtitle={desktop ? `${today()}. Voici ce qui attend le bureau.` : `${me.role?.label} · ${full ? 'accès complet' : 'accès selon le poste'}`}
    >
      <ErrorNote error={counts.error} />
      {c ? (
        <>
          {!desktop && seesAccounts ? (
            <Link to="/bureau/comptes" className="flex items-center gap-3.5 rounded-[22px] bg-surface p-4 text-ink no-underline">
              <span className="grid size-12 place-items-center rounded-2xl bg-safran-pale text-[#7A5200]">
                <UserCheck className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">Comptes en attente</span>
                <span className="block text-[13px] text-muted">{c.pending ? `${c.pending} demande${c.pending > 1 ? 's' : ''} à traiter` : 'Aucune demande à traiter'}</span>
              </span>
              {c.pending ? <span className="grid size-8 place-items-center rounded-full bg-safran text-sm font-extrabold text-nuit">{c.pending}</span> : <ChevronRight className="size-5 text-muted" />}
            </Link>
          ) : null}
          {!desktop && seesReports && reports ? (
            <Link to="/bureau/moderation" className="flex items-center gap-3.5 rounded-[22px] bg-surface p-4 text-ink no-underline">
              <span className="grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
                <ShieldAlert className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">Signalements</span>
                <span className="block text-[13px] text-muted">
                  {reports} contenu{reports > 1 ? 's' : ''} à examiner
                </span>
              </span>
              <span className="grid size-8 place-items-center rounded-full bg-safran text-sm font-extrabold text-nuit">{reports}</span>
            </Link>
          ) : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <Kpi icon={<Users className="size-5" />} value={c.active} label="Membres actifs" detail={desktop ? `${c.new_this_month} nouveau${c.new_this_month > 1 ? 'x' : ''} ce mois-ci` : undefined} to={can(me, 'membres', 'lecture') ? '/bureau/membres' : undefined} />
            {desktop && seesAccounts ? (
              <Kpi icon={<UserCheck className="size-5" />} value={c.pending ?? 0} label="Comptes en attente" detail={c.pending_unconfirmed ? `et ${c.pending_unconfirmed} email${c.pending_unconfirmed > 1 ? 's' : ''} à confirmer` : 'Emails confirmés'} to="/bureau/comptes" />
            ) : null}
            <Kpi
              icon={<Star className="size-5" />}
              value={
                <>
                  {c.roles_filled}
                  <span className="text-[18px] text-muted"> / {c.roles_total}</span>
                </>
              }
              label="Postes attribués"
              to={seesRoles ? '/bureau/postes' : undefined}
            />
            {desktop ? <Kpi icon={<UserPlus className="size-5" />} value={c.new_this_month} label="Validés ce mois-ci" /> : null}
          </div>

          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-4">
            {desktop && (seesAccounts || seesRoles || seesReports) ? (
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="titre m-0 text-[20px]">À traiter</h2>
                </div>
                <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
                  {seesAccounts ? (
                    <li>
                      <Link to="/bureau/comptes" className="flex items-center gap-3.5 rounded-2xl border border-line-soft px-4 py-3 text-ink no-underline hover:bg-surface-2">
                        <span className="grid size-10 place-items-center rounded-xl bg-safran-pale text-[#7A5200]">
                          <UserCheck className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold">Comptes en attente de validation</span>
                          <span className="block truncate text-[13px] text-muted">{pendingNames || 'Personne pour le moment'}</span>
                        </span>
                        <span className="titre text-[20px]">{c.pending ?? 0}</span>
                        <ChevronRight className="size-5 text-muted" />
                      </Link>
                    </li>
                  ) : null}
                  {seesReports ? (
                    <li>
                      <Link to="/bureau/moderation" className="flex items-center gap-3.5 rounded-2xl border border-line-soft px-4 py-3 text-ink no-underline hover:bg-surface-2">
                        <span className="grid size-10 place-items-center rounded-xl bg-danger-soft text-danger">
                          <ShieldAlert className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold">Signalements à examiner</span>
                          <span className="block truncate text-[13px] text-muted">{reports ? 'Publications et commentaires signalés par les membres' : 'Rien à examiner'}</span>
                        </span>
                        <span className="titre text-[20px]">{reports}</span>
                        <ChevronRight className="size-5 text-muted" />
                      </Link>
                    </li>
                  ) : null}
                  {seesRoles ? (
                    <li>
                      <Link to="/bureau/postes" className="flex items-center gap-3.5 rounded-2xl border border-line-soft px-4 py-3 text-ink no-underline hover:bg-surface-2">
                        <span className="grid size-10 place-items-center rounded-xl bg-select text-ink">
                          <Star className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold">Postes à attribuer</span>
                          <span className="block truncate text-[13px] text-muted">{vacant.length ? vacant.map((r) => r.label).join(', ') : 'Tous les postes ont un titulaire'}</span>
                        </span>
                        <span className="titre text-[20px]">{vacant.length}</span>
                        <ChevronRight className="size-5 text-muted" />
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </Card>
            ) : null}

            {seesJournal ? (
              <Card className="p-4 lg:p-5">
                <div className="flex items-center justify-between">
                  <h2 className="titre m-0 text-[18px] lg:text-[20px]">Activité récente</h2>
                  <Link to="/bureau/journal" className="text-[13px] font-bold">
                    Tout le journal
                  </Link>
                </div>
                {activity.data?.length ? (
                  <ul className="m-0 mt-1 flex list-none flex-col divide-y divide-line-soft p-0">
                    {activity.data.slice(0, desktop ? 6 : 4).map((e) => (
                      <ActivityLine key={e.id} entry={e} />
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 mt-3 text-sm text-muted">Rien pour le moment.</p>
                )}
              </Card>
            ) : null}
          </div>

          {storage.data != null ? <StorageCard used={storage.data} /> : null}

          <div className="mt-2">
            <p className="m-0 mb-2.5 px-1 text-[11px] font-bold tracking-[0.08em] text-muted uppercase">Dans les prochaines mises à jour</p>
            <div className="flex flex-wrap gap-2 px-1">
              {COMING.map((label) => (
                <Pill key={label} className="border border-line bg-surface px-3 py-1.5 text-[13px] text-ink">
                  {label}
                </Pill>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </BureauPage>
  )
}
