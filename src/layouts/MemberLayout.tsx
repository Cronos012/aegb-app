import { NavLink, Outlet, useMatch } from 'react-router'
import { Briefcase, Calendar, CreditCard, FileText, House, LogOut, MessageSquare, SquareCheckBig, User, Users, type LucideIcon } from 'lucide-react'
import { signOut } from '../auth/session'
import { Avatar } from '../components/Avatar'
import { Brand } from '../components/Logo'
import { TYPE_LABELS } from '../lib/format'
import { useBureauBadge } from '../lib/feed'
import { useMessagesLive, useUnreadConversations } from '../lib/messages'
import { isBureau, useMe } from '../lib/queries'
import { BottomNav } from './BottomNav'

type Item = { to: string; label: string; icon: LucideIcon; soon?: boolean; badge?: number | null }

function SideLink({ to, label, icon: Icon, soon, badge }: Item) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative flex h-12 items-center gap-3.5 rounded-xl px-3.5 text-[15px] font-semibold text-white no-underline ${isActive ? 'bg-white/12' : 'hover:bg-white/6'}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span className="absolute top-2.5 -left-3 h-7 w-1 rounded-r bg-safran" aria-hidden="true" /> : null}
          <Icon className="size-5 opacity-90" aria-hidden="true" />
          <span className="flex-1">{label}</span>
          {soon ? <span className="rounded-full bg-white/12 px-2 py-0.5 text-[11px] font-bold text-white/75">bientôt</span> : null}
          {badge ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-safran px-1.5 text-[11px] font-extrabold text-nuit">{badge}</span> : null}
        </>
      )}
    </NavLink>
  )
}

/** Barre latérale sur ordinateur, barre d'onglets en bas sur téléphone. */
export function MemberLayout() {
  const me = useMe().data
  const bureau = isBureau(me)
  const badge = useBureauBadge()
  const unread = useUnreadConversations()
  useMessagesLive(me?.profile.status === 'actif')
  // Ces écrans prennent tout l'écran sur téléphone, comme dans la maquette.
  const fullScreen = [
    useMatch('/app/profil/modifier'),
    useMatch('/app/publier'),
    useMatch('/app/fil/:id'),
    useMatch('/app/messages/:id'),
    useMatch('/app/messages/:id/infos'),
    useMatch('/app/cotisation/payer'),
    useMatch('/app/cotisation/retour/:id'),
    useMatch('/app/cotisation/quittances/:numero'),
  ].some(Boolean)

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="bg-tisse sticky top-0 hidden h-dvh flex-col px-4 py-6 text-white lg:flex">
        <Brand size={40} className="px-2 text-white" />
        <nav aria-label="Navigation principale" className="mt-8 flex flex-col gap-1">
          <SideLink to="/app/fil" label="Fil d'actu" icon={House} />
          <SideLink to="/app/messages" label="Messages" icon={MessageSquare} badge={unread} />
          <SideLink to="/app/evenements" label="Événements" icon={Calendar} soon />
          <SideLink to="/app/cotisation" label="Cotisation" icon={CreditCard} />
          <SideLink to="/app/votes" label="Votes" icon={SquareCheckBig} soon />
          <SideLink to="/app/documents" label="Documents" icon={FileText} soon />
          <SideLink to="/app/membres" label="Membres" icon={Users} />
          <SideLink to="/app/profil" label="Mon profil" icon={User} />
          {bureau ? (
            <>
              <div className="mx-3 my-3 h-px bg-white/12" />
              <SideLink to="/bureau" label="Mode bureau" icon={Briefcase} badge={badge} />
            </>
          ) : null}
        </nav>
        {me ? (
          <div className="mt-auto flex items-center gap-3 border-t border-white/12 px-2 pt-4">
            <Avatar person={me.profile} size={40} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-sm font-bold">
                {me.profile.first_name} {me.profile.last_name}
              </p>
              <p className="m-0 truncate text-xs text-white/70">{me.role ? me.role.label : TYPE_LABELS[me.profile.member_type]}</p>
            </div>
            <button type="button" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter" className="grid size-10 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white">
              <LogOut className="size-5" />
            </button>
          </div>
        ) : null}
      </aside>
      <main className={`flex min-h-dvh flex-col lg:pb-0 ${fullScreen ? '' : 'pb-[calc(68px+env(safe-area-inset-bottom))]'}`}>
        <Outlet />
      </main>
      {fullScreen ? null : <BottomNav />}
    </div>
  )
}
