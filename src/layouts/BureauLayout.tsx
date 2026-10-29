import { NavLink, Outlet, useMatch, useNavigate } from 'react-router'
import { Bot, ChevronLeft, LayoutDashboard, Megaphone, ScrollText, ShieldAlert, Star, UserCheck, Users, type LucideIcon } from 'lucide-react'
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
        `relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] font-semibold no-underline ${isActive ? 'bg-white/12 text-white' : 'text-white/82 hover:bg-white/6 hover:text-white'}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span className="absolute top-2 -left-3 h-6 w-1 rounded-r bg-safran" aria-hidden="true" /> : null}
          <Icon className="size-[18px]" aria-hidden="true" />
          <span className="flex-1">{label}</span>
          {badge ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-safran px-1.5 text-[11px] font-extrabold text-nuit">{badge}</span> : null}
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
      title: "Vie de l'asso",
      items: [
        { to: '/bureau/annonces', label: 'Annonces', icon: Megaphone, screen: 'annonces' },
        { to: '/bureau/moderation', label: 'Modération', icon: ShieldAlert, screen: 'moderation', badge: reports },
      ],
    },
    {
      title: 'Réglages',
      items: [
        { to: '/bureau/postes', label: 'Postes et droits', icon: Star, screen: 'postes' },
        { to: '/bureau/aegb', label: 'Compte AEGB', icon: Bot, screen: 'bienvenue', badge: aegb },
        { to: '/bureau/journal', label: "Journal d'activité", icon: ScrollText, screen: 'journal' },
      ],
    },
  ]

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-nuit px-4 py-5 text-white lg:flex">
        <div className="flex items-center gap-2.5 px-1.5">
          <Logo size={34} background="#12183D" />
          <span className="titre text-[19px]">AEGB</span>
          <span className="ml-auto rounded-full bg-safran px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-nuit">BUREAU</span>
        </div>
        <nav aria-label="Navigation du bureau" className="mt-6 flex flex-col gap-5">
          {groups.map((g) => {
            const visible = g.items.filter((i) => !i.screen || can(me, i.screen, 'lecture'))
            if (!visible.length) return null
            return (
              <div key={g.title} className="flex flex-col gap-0.5">
                <p className="m-0 mb-1 px-3 text-[11px] font-bold tracking-[0.08em] text-white/50 uppercase">{g.title}</p>
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
          className="mt-6 flex h-10 items-center gap-2 rounded-[10px] border border-white/20 px-3 text-sm font-semibold text-white hover:bg-white/8"
        >
          <ChevronLeft className="size-4" /> Quitter le mode bureau
        </button>
        {me ? (
          <div className="mt-auto flex items-center gap-3 border-t border-white/12 px-1.5 pt-4">
            <Avatar person={me.profile} size={36} />
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-bold">
                {me.profile.first_name} {me.profile.last_name}
              </p>
              <p className="m-0 truncate text-xs text-white/65">
                {me.role?.label} · {full ? 'accès complet' : 'accès selon le poste'}
              </p>
            </div>
          </div>
        ) : null}
      </aside>
      <main className={`flex min-h-dvh min-w-0 flex-col bg-page lg:px-10 lg:py-8 lg:pb-10 ${fullScreen ? '' : 'pb-[calc(68px+env(safe-area-inset-bottom))]'}`}>
        <Outlet />
      </main>
      {fullScreen ? null : <BottomNav />}
    </div>
  )
}
