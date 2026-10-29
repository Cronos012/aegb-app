import { NavLink } from 'react-router'
import { Briefcase, CreditCard, House, MessageSquare, User, type LucideIcon } from 'lucide-react'
import { can, isBureau, useBureauCounts, useMe } from '../lib/queries'

type Item = { to: string; label: string; icon: LucideIcon; badge?: number | null }

export function BottomNav() {
  const me = useMe().data
  const bureau = isBureau(me)
  const counts = useBureauCounts(bureau && can(me, 'comptes', 'lecture')).data
  const items: Item[] = [
    { to: '/app/fil', label: 'Fil', icon: House },
    { to: '/app/messages', label: 'Messages', icon: MessageSquare },
    { to: '/app/cotisation', label: 'Cotisation', icon: CreditCard },
    { to: '/app/profil', label: 'Profil', icon: User },
  ]
  if (bureau) items.push({ to: '/bureau', label: 'Bureau', icon: Briefcase, badge: counts?.pending })

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="m-0 grid list-none p-0" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ to, label, icon: Icon, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `relative flex h-[66px] flex-col items-center justify-center gap-1 text-[11px] font-semibold no-underline ${isActive ? 'text-primary' : 'text-muted'}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <Icon className="size-6" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                    {badge ? (
                      <span className="absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-safran px-1 text-[10px] font-extrabold text-nuit">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                  {label}
                  <span className={`size-1 rounded-full ${isActive ? 'bg-safran' : 'bg-transparent'}`} aria-hidden="true" />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
