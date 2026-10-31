import { NavLink } from 'react-router'
import { NavIcon, type NavIconName } from '../components/NavIcons'
import { useMyDues } from '../lib/dues'
import { useBureauBadge } from '../lib/feed'
import { useUnreadConversations } from '../lib/messages'
import { isBureau, useMe } from '../lib/queries'

type Item = { to: string; label: string; icon: NavIconName; badge?: number | null; alert?: string | null }

export function BottomNav() {
  const me = useMe().data
  const bureau = isBureau(me)
  const badge = useBureauBadge()
  const unread = useUnreadConversations()
  const late = useMyDues(me?.profile.status === 'actif').data?.status === 'retard'
  const items: Item[] = [
    { to: '/app/fil', label: 'Accueil', icon: 'accueil' },
    { to: '/app/messages', label: 'Messages', icon: 'messages', badge: unread },
    { to: '/app/cotisation', label: 'Cotisation', icon: 'cotisation', alert: late ? 'en retard' : null },
    { to: '/app/profil', label: 'Profil', icon: 'profil' },
  ]
  if (bureau) items.push({ to: '/bureau', label: 'Bureau', icon: 'bureau', badge })

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="m-0 grid list-none p-0" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ to, label, icon, badge, alert }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `relative flex h-[62px] flex-col items-center justify-center gap-[3px] text-[11.5px] font-semibold no-underline ${isActive ? 'text-primary' : 'text-muted'}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? <span className="absolute inset-x-[18%] top-0 h-[3px] rounded-b-[3px] bg-primary" aria-hidden="true" /> : null}
                  <span className="relative">
                    <NavIcon name={icon} size={26} mono />
                    {badge ? (
                      <span className="absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-badge px-1 text-[11px] font-bold text-white ring-2 ring-surface">
                        {badge}
                      </span>
                    ) : null}
                    {alert ? <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true" /> : null}
                  </span>
                  {label}
                  {alert ? <span className="sr-only">, {alert}</span> : null}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
