import { Link } from 'react-router'
import { Bell as BellIcon, Bot, Briefcase, ChevronRight, HardDrive, Info, Laptop, ShieldAlert, Smartphone, Star, UserCheck, Users, Wallet } from 'lucide-react'
import { ElectionsCard } from '../../components/elections/DashboardCard'
import { EventsCard } from '../../components/events/DashboardCard'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { Bell } from '../../components/notifications/Bell'
import { eurosExact, euros, useDuesMatrix, useLedger } from '../../lib/dues'
import { useModerationPending, useStorageUsed } from '../../lib/feed'
import { useIsDesktop } from '../../lib/media'
import { useAegbPending } from '../../lib/messages'
import { useReachable, type Reachable } from '../../lib/notifications'
import { can, useAccounts, useActivity, useBureauCounts, useMe, useRoles } from '../../lib/queries'
import { ActivityLine } from './activity'
import { BureauPage, Card } from './BureauPage'

/** L’offre gratuite de Supabase : 1 Go pour les photos, les vidéos et les documents. */
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
          <h2 className="m-0 text-[15px] font-bold">Photos, vidéos et documents</h2>
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

/** Les cotisations et la caisse, pour les postes qui ont accès à l'argent. */
function MoneyCard() {
  const matrix = useDuesMatrix()
  const ledger = useLedger()
  const rows = matrix.data ?? []
  const paying = rows.filter((r) => r.dues.paying && r.dues.status !== 'pas_encore')
  const upToDate = paying.filter((r) => r.dues.status === 'a_jour').length
  const late = paying.filter((r) => r.dues.status === 'retard')
  const owed = late.reduce((sum, r) => sum + r.dues.late_cents, 0)
  const balance = (ledger.data ?? []).reduce((sum, e) => sum + e.amount_cents, 0)
  const stats = [
    { label: 'À jour', value: paying.length ? `${Math.round((upToDate / paying.length) * 100)} %` : '–', detail: `${upToDate} sur ${paying.length} qui cotisent`, tone: 'text-ok' },
    { label: 'En retard', value: String(late.length), detail: `${euros(owed)} à rattraper`, tone: late.length ? 'text-danger' : '' },
    { label: 'Solde de la caisse', value: ledger.data ? eurosExact(balance) : '…', detail: 'Journal financier', tone: '' },
  ]
  return (
    <Card className="p-4 lg:p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-ok-soft text-ok">
          <Wallet className="size-5" />
        </span>
        <h2 className="titre m-0 flex-1 text-[18px] lg:text-[20px]">Cotisations et caisse</h2>
        <Link to="/bureau/cotisations" className="text-[13px] font-bold">
          Voir les cotisations
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <span className="block text-[12px] font-semibold text-muted">{s.label}</span>
            <span className={`titre block truncate text-[22px] leading-tight lg:text-[26px] ${s.tone}`}>{s.value}</span>
            <span className="block truncate text-[12px] text-muted">{s.detail}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function today() {
  const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date())
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Combien de membres ont activé les notifications : un nombre, jamais de liste de noms. */
function ReachableKpi({ r, className = '' }: { r: Reachable; className?: string }) {
  const percent = r.total ? Math.round((r.reachable / r.total) * 100) : 0
  return (
    <div className={`block rounded-[12px] bg-surface p-5 text-ink ${className}`}>
      <span className="flex items-start justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-safran-pale text-[#163F93]">
          <BellIcon className="size-5" />
        </span>
      </span>
      <span className="titre mt-3 block text-[30px] leading-none">{r.reachable}</span>
      <span className="mt-2 block text-[14px] font-semibold">{r.reachable > 1 ? 'Membres joignables' : 'Membre joignable'}</span>
      <span className="mt-0.5 block text-[13px] text-muted">
        Notifications activées, sur {r.total} membre{r.total > 1 ? 's' : ''}
      </span>
      <span className="mt-3 block h-2 overflow-hidden rounded-full bg-line-soft">
        <span className="block h-full rounded-full bg-ok" style={{ width: `${Math.max(percent, r.reachable ? 2 : 0)}%` }} />
      </span>
    </div>
  )
}

function ReachableCard({ r }: { r: Reachable }) {
  const rows = [
    { icon: Smartphone, label: 'Android', value: r.android, tone: 'bg-leppi' },
    { icon: Smartphone, label: 'iPhone (appli sur l’écran d’accueil)', value: r.iphone, tone: 'bg-[#5B5FC7]' },
    { icon: Laptop, label: 'PC', value: r.ordinateur, tone: 'bg-ok' },
  ]
  const max = Math.max(r.total, 1)
  const others = r.total - r.reachable
  return (
    <Card className="p-5">
      <h2 className="titre m-0 text-[20px]">Joignables, par appareil</h2>
      <p className="mt-1.5 mb-0 text-[13px] leading-[1.45] text-muted">Un nombre seulement, jamais de liste de noms. Une même personne peut avoir un téléphone et un PC.</p>
      <ul className="m-0 mt-4 flex list-none flex-col gap-4 p-0">
        {rows.map((row) => (
          <li key={row.label}>
            <span className="flex items-center gap-2 text-[14px] font-bold">
              <row.icon className="size-4 text-muted" />
              <span className="flex-1">{row.label}</span>
              <span className="titre text-[18px]">{row.value}</span>
            </span>
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-line-soft">
              <span className={`block h-full rounded-full ${row.tone}`} style={{ width: `${(row.value / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
      {others > 0 ? (
        <p className="mt-4 mb-0 flex items-start gap-2 rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] leading-[1.45] text-muted">
          <Info className="mt-px size-4 shrink-0" />
          {others > 1 ? `Les ${others} autres membres voient` : 'L’autre membre voit'} les annonces dans la cloche à {others > 1 ? 'leur' : 'sa'} prochaine visite.
        </p>
      ) : null}
    </Card>
  )
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
  const cls = 'block rounded-[12px] bg-surface p-5 text-ink no-underline'
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
  const seesAegb = can(me, 'bienvenue', 'lecture')
  const aegb = useAegbPending(seesAegb).data ?? 0
  const storage = useStorageUsed()
  const counts = useBureauCounts()
  const pending = useAccounts('en_attente', seesAccounts)
  const roles = useRoles()
  const activity = useActivity(6, null, null, seesJournal)
  const reachable = useReachable().data

  if (counts.isPending) return <PageLoader />
  const c = counts.data
  const vacant = roles.data?.filter((r) => !r.holder) ?? []
  const pendingNames = pending.data?.filter((p) => p.email_confirmed_at).slice(0, 3).map((p) => `${p.first_name} ${p.last_name}`).join(', ')
  const full = me.guarantor || ['presidence', 'vice_presidence'].includes(me.role?.code ?? '')

  const kicker = desktop ? null : (
    <span className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-safran px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-white">
      <Briefcase className="size-3.5" /> MODE BUREAU
    </span>
  )

  return (
    <BureauPage
      title="Tableau de bord"
      back={null}
      kicker={kicker}
      subtitle={desktop ? `${today()}. Voici ce qui attend le bureau.` : `${me.role?.label} · ${full ? 'accès complet' : 'accès selon le poste'}`}
      actions={desktop ? <Bell scope="bureau" /> : undefined}
    >
      <ErrorNote error={counts.error} />
      {c ? (
        <>
          {!desktop && seesAccounts ? (
            <Link to="/bureau/comptes" className="flex items-center gap-3.5 rounded-[12px] bg-surface p-4 text-ink no-underline">
              <span className="grid size-12 place-items-center rounded-2xl bg-safran-pale text-[#163F93]">
                <UserCheck className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">Comptes en attente</span>
                <span className="block text-[13px] text-muted">{c.pending ? `${c.pending} demande${c.pending > 1 ? 's' : ''} à traiter` : 'Aucune demande à traiter'}</span>
              </span>
              {c.pending ? <span className="grid size-8 place-items-center rounded-full bg-safran text-sm font-extrabold text-white">{c.pending}</span> : <ChevronRight className="size-5 text-muted" />}
            </Link>
          ) : null}
          {!desktop && seesReports && reports ? (
            <Link to="/bureau/moderation" className="flex items-center gap-3.5 rounded-[12px] bg-surface p-4 text-ink no-underline">
              <span className="grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
                <ShieldAlert className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">Signalements</span>
                <span className="block text-[13px] text-muted">
                  {reports} contenu{reports > 1 ? 's' : ''} à examiner
                </span>
              </span>
              <span className="grid size-8 place-items-center rounded-full bg-safran text-sm font-extrabold text-white">{reports}</span>
            </Link>
          ) : null}

          {!desktop && seesAegb && aegb ? (
            <Link to="/bureau/aegb" className="flex items-center gap-3.5 rounded-[12px] bg-surface p-4 text-ink no-underline">
              <span className="grid size-12 place-items-center rounded-2xl bg-select text-ink">
                <Bot className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">Messages à AEGB</span>
                <span className="block text-[13px] text-muted">
                  {aegb} membre{aegb > 1 ? 's' : ''} attend{aegb > 1 ? 'ent' : ''} une réponse
                </span>
              </span>
              <span className="grid size-8 place-items-center rounded-full bg-safran text-sm font-extrabold text-white">{aegb}</span>
            </Link>
          ) : null}

          {can(me, 'elections', 'lecture') ? <ElectionsCard /> : null}
          {can(me, 'evenements', 'lecture') ? <EventsCard /> : null}

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
            {reachable ? <ReachableKpi r={reachable} className={desktop ? '' : 'col-span-2'} /> : null}
          </div>

          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-4">
            {desktop && (seesAccounts || seesRoles || seesReports || seesAegb) ? (
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="titre m-0 text-[20px]">À traiter</h2>
                </div>
                <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
                  {seesAccounts ? (
                    <li>
                      <Link to="/bureau/comptes" className="flex items-center gap-3.5 rounded-2xl border border-line-soft px-4 py-3 text-ink no-underline hover:bg-surface-2">
                        <span className="grid size-10 place-items-center rounded-xl bg-safran-pale text-[#163F93]">
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
                          <span className="block truncate text-[13px] text-muted">{reports ? 'Publications, commentaires et messages signalés par les membres' : 'Rien à examiner'}</span>
                        </span>
                        <span className="titre text-[20px]">{reports}</span>
                        <ChevronRight className="size-5 text-muted" />
                      </Link>
                    </li>
                  ) : null}
                  {seesAegb ? (
                    <li>
                      <Link to="/bureau/aegb" className="flex items-center gap-3.5 rounded-2xl border border-line-soft px-4 py-3 text-ink no-underline hover:bg-surface-2">
                        <span className="grid size-10 place-items-center rounded-xl bg-select text-ink">
                          <Bot className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold">Messages à AEGB</span>
                          <span className="block truncate text-[13px] text-muted">{aegb ? 'Des membres attendent une réponse du bureau' : 'Tout le monde a sa réponse'}</span>
                        </span>
                        <span className="titre text-[20px]">{aegb}</span>
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

            <div className="flex flex-col gap-3 lg:gap-4">
            {desktop && reachable ? <ReachableCard r={reachable} /> : null}
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
          </div>

          {can(me, 'tresorerie', 'lecture') ? <MoneyCard /> : null}

          {storage.data != null ? <StorageCard used={storage.data} /> : null}

        </>
      ) : null}
    </BureauPage>
  )
}
