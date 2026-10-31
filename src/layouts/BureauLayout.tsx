import { NavLink, Outlet, useMatch, useNavigate } from 'react-router'
import { Bot, CalendarDays, ChevronLeft, FileText, LayoutDashboard, Megaphone, ReceiptText, ScrollText, Settings, ShieldAlert, SquareCheckBig, Star, UserCheck, Users, Wallet, type LucideIcon } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { Logo } from '../components/Logo'
import { useModerationPending } from '../lib/feed'
import { useIsDesktop } from '../lib/media'
import { useAegbPending, useMessagesLive } from '../lib/messages'
import { can, useBureauCounts, useMe, type ScreenCode } from '../lib/queries'
import { BottomNav } from './BottomNav'

type Item = { to: string; label: string; icon: LucideIcon; screen?: ScreenCode; badge?: number | null; end?: boolean }

function SideLink({ to, label, icon: Icon, badge, end }: Item) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex h-10 items-center gap-3 rounded-lg px-2.5 text-[14px] no-underline ${isActive ? 'bg-select font-semibold text-primary' : 'font-medium text-ink hover:bg-line-soft'}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`size-[19px] ${isActive ? '' : 'text-muted'}`} aria-hidden="true" />
          <span className="flex-1">{label}</span>
          {badge ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-badge px-1.5 text-[11px] font-bold text-white">{badge}</span> : null}
        </>
      )}
    </NavLink>
  )
}

export function BureauLayout() {
  const me = useMe().data
  const navigate = useNavigate()
  const counts = useBureauCounts(can(me, 'comptes', 'lecture')).data
  const reports = useModerationPending(can(me, 'moderation', 'lecture')).data
  const aegb = useAegbPending(can(me, 'bienvenue', 'lecture')).data
  const desktop = useIsDesktop()
  useMessagesLive(me?.profile.status === 'actif')
  // Sur téléphone, une conversation avec AEGB prend tout l'écran.
  const fullScreen = !!useMatch('/bureau/aegb/:id') && !desktop
  const full = me?.guarantor || ['presidence', 'vice_presidence'].includes(me?.role?.code ?? '')

  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Communauté',
      items: [
        { to: '/bureau', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
        { to: '/bureau/comptes', label: 'Comptes en attente', icon: UserCheck, screen: 'comptes', badge: counts?.pending },
        { to: '/bureau/membres', label: 'Membres', icon: Users, screen: 'membres' },
      ],
    },
    {
      title: 'Argent',
      items: [
        { to: '/bureau/cotisations', label: 'Cotisations', icon: Wallet, screen: 'tresorerie', end: true },
        { to: '/bureau/journal-financier', label: 'Journal financier', icon: ReceiptText, screen: 'tresorerie' },
      ],
    },
    {
      title: "Vie de l'asso",
      items: [
        { to: '/bureau/annonces', label: 'Annonces', icon: Megaphone, screen: 'annonces' },
        { to: '/bureau/evenements', label: 'Événements', icon: CalendarDays, screen: 'evenements' },
        { to: '/bureau/elections', label: 'Élections', icon: SquareCheckBig, screen: 'elections' },
        { to: '/bureau/documents', label: 'Documents', icon: FileText, screen: 'documents' },
        { to: '/bureau/moderation', label: 'Modération', icon: ShieldAlert, screen: 'moderation', badge: reports },
      ],
    },
    {
      title: 'Réglages',
      items: [
        { to: '/bureau/postes', label: 'Postes et droits', icon: Star, screen: 'postes' },
        { to: '/bureau/aegb', label: 'Compte AEGB', icon: Bot, screen: 'bienvenue', badge: aegb },
        { to: '/bureau/cotisations/reglages', label: 'Réglages de la cotisation', icon: Settings, screen: 'tresorerie' },
        { to: '/bureau/journal', label: "Journal d'activité", icon: ScrollText, screen: 'journal' },
      ],
    },
  ]

  return (
    <div className="min-h-app lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-app flex-col overflow-y-auto border-r border-line-soft bg-surface px-3 py-5 lg:flex">
        <div className="flex items-center gap-2.5 px-1.5">
          <Logo size={34} />
          <span className="titre text-[20px] text-primary">AEGB</span>
          <span className="ml-auto rounded-full bg-select px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-primary">BUREAU</span>
        </div>
        <nav aria-label="Navigation du bureau" className="mt-6 flex flex-col gap-5">
          {groups.map((g) => {
            const visible = g.items.filter((i) => !i.screen || can(me, i.screen, 'lecture'))
            if (!visible.length) return null
            return (
              <div key={g.title} className="flex flex-col gap-0.5">
                <p className="m-0 mb-1 px-3 text-[12px] font-semibold text-muted">{g.title}</p>
                {visible.map((i) => (
                  <SideLink key={i.to} {...i} />
                ))}
              </div>
            )
          })}
        </nav>
        <button
          type="button"
          onClick={() => navigate('/app/profil')}
          className="mt-6 flex h-10 shrink-0 items-center gap-2 rounded-lg bg-line-soft px-3 text-sm font-semibold text-ink hover:brightness-95"
        >
          <ChevronLeft className="size-4" /> Quitter le mode bureau
        </button>
        {me ? (
          <div className="mt-auto flex items-center gap-3 border-t border-line-soft px-1.5 pt-4">
            <Avatar person={me.profile} size={36} />
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-bold">
                {me.profile.first_name} {me.profile.last_name}
              </p>
              <p className="m-0 truncate text-xs text-muted">
                {me.role?.label} · {full ? 'accès complet' : 'accès selon le poste'}
              </p>
            </div>
          </div>
        ) : null}
      </aside>
      <main className={`flex min-h-app min-w-0 flex-col bg-page lg:px-10 lg:py-8 lg:pb-10 ${fullScreen ? '' : 'pb-[calc(68px+env(safe-area-inset-bottom))]'}`}>
        <Outlet />
      </main>
      {fullScreen ? null : <BottomNav />}
    </div>
  )
}
