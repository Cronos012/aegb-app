import { NavLink, Outlet, useMatch } from 'react-router'
import { LogOut, Settings } from 'lucide-react'
import { signOut } from '../auth/session'
import { Avatar } from '../components/Avatar'
import { Brand } from '../components/Logo'
import { NavIcon, type NavIconName } from '../components/NavIcons'
import { useMyDues } from '../lib/dues'
import { TYPE_LABELS } from '../lib/format'
import { useBureauBadge } from '../lib/feed'
import { useMessagesLive, useUnreadConversations } from '../lib/messages'
import { isBureau, useMe } from '../lib/queries'
import { BottomNav } from './BottomNav'

type Item = { to: string; label: string; icon: NavIconName | 'reglages'; soon?: boolean; badge?: number | null; alert?: string | null }

function SideLink({ to, label, icon, soon, badge, alert }: Item) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex h-[52px] items-center gap-3 rounded-lg px-2 text-[15px] no-underline ${isActive ? 'bg-select font-semibold text-primary' : 'font-medium text-ink hover:bg-line-soft'}`
      }
    >
      <span className="grid size-9 place-items-center">
        {icon === 'reglages' ? (
          <span className="grid size-8 place-items-center rounded-full bg-line-soft text-ink">
            <Settings className="size-[18px]" aria-hidden="true" />
          </span>
        ) : (
          <NavIcon name={icon} />
        )}
      </span>
      <span className="flex-1">{label}</span>
      {soon ? <span className="rounded-full bg-line-soft px-2 py-0.5 text-[11px] font-bold text-muted">bientôt</span> : null}
      {badge ? <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-badge px-1.5 text-[12px] font-bold text-white">{badge}</span> : null}
      {alert ? (
        <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white" title={`Cotisation ${alert}`}>
          {alert}
        </span>
      ) : null}
    </NavLink>
  )
}

/** Barre latérale sur ordinateur, barre d'onglets en bas sur téléphone. */
export function MemberLayout() {
  const me = useMe().data
  const bureau = isBureau(me)
  const badge = useBureauBadge()
  const unread = useUnreadConversations()
  const late = useMyDues(me?.profile.status === 'actif').data?.status === 'retard'
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
    useMatch('/app/votes/candidature'),
    useMatch('/app/votes/isoloir'),
    useMatch('/app/evenements/:id'),
    useMatch('/app/evenements/paiement/:id'),
    useMatch('/app/documents/:id'),
    useMatch('/app/reglages/:page'),
  ].some(Boolean)

  return (
    <div className="min-h-app lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-app flex-col overflow-y-auto border-r border-line-soft bg-surface px-3 py-5 lg:flex">
        <Brand size={38} className="px-2 text-primary" />
        <nav aria-label="Navigation principale" className="mt-6 flex flex-col gap-0.5">
          <SideLink to="/app/fil" label="Accueil" icon="accueil" />
          <SideLink to="/app/messages" label="Messages" icon="messages" badge={unread} />
          <SideLink to="/app/evenements" label="Événements" icon="evenements" />
          <SideLink to="/app/cotisation" label="Cotisation" icon="cotisation" alert={late ? 'en retard' : null} />
          <SideLink to="/app/votes" label="Votes" icon="votes" />
          <SideLink to="/app/documents" label="Documents" icon="documents" />
          <SideLink to="/app/membres" label="Membres" icon="membres" />
          <SideLink to="/app/profil" label="Mon profil" icon="profil" />
          <SideLink to="/app/reglages" label="Réglages" icon="reglages" />
          {bureau ? (
            <>
              <div className="mx-2 my-2.5 h-px bg-line" />
              <SideLink to="/bureau" label="Mode bureau" icon="bureau" badge={badge} />
            </>
          ) : null}
        </nav>
        {me ? (
          <div className="mt-auto flex items-center gap-3 border-t border-line-soft px-2 pt-4">
            <Avatar person={me.profile} size={40} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-sm font-bold">
                {me.profile.first_name} {me.profile.last_name}
              </p>
              <p className="m-0 truncate text-xs text-muted">{me.role ? me.role.label : TYPE_LABELS[me.profile.member_type]}</p>
            </div>
            <button type="button" onClick={signOut} aria-label="Se déconnecter" title="Se déconnecter" className="grid size-10 place-items-center rounded-full bg-line-soft text-ink hover:brightness-95">
              <LogOut className="size-5" />
            </button>
          </div>
        ) : null}
      </aside>
      <main className={`flex min-h-app flex-col lg:pb-0 ${fullScreen ? '' : 'pb-[calc(68px+env(safe-area-inset-bottom))]'}`}>
        <Outlet />
      </main>
      {fullScreen ? null : <BottomNav />}
    </div>
  )
}
