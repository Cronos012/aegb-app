import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Bell as BellIcon, BellOff, Settings } from 'lucide-react'
import { useIsDesktop } from '../../lib/media'
import { useBadge, useMarkRead, useNotifications } from '../../lib/notifications'
import { EmptyState, ErrorNote, Spinner } from '../Feedback'
import { NotificationList } from './NotificationList'

function Count({ n, onDark = false }: { n: number; onDark?: boolean }) {
  if (!n) return null
  return (
    <span className={`absolute -top-1 -right-1 grid h-[20px] min-w-[20px] place-items-center rounded-full bg-[#D6203A] px-1 text-[11px] font-extrabold text-white ring-2 ${onDark ? 'ring-leppi' : 'ring-surface'}`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

type Props = {
  /** bureau : seulement les notifications du poste, dans le mode bureau. */
  scope?: 'membre' | 'bureau'
  /** La cloche sur fond indigo (en-tête du bureau sur téléphone). */
  onDark?: boolean
  className?: string
}

/**
 * La cloche : sur téléphone, elle ouvre l'écran Notifications ; sur
 * ordinateur, un panneau à droite.
 */
export function Bell({ scope = 'membre', onDark = false, className = '' }: Props) {
  const desktop = useIsDesktop()
  const badge = useBadge().data
  const list = useNotifications(scope === 'bureau' || desktop)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const markRead = useMarkRead()
  const navigate = useNavigate()

  const mine = (list.data ?? []).filter((n) => (scope === 'bureau' ? n.category === 'poste' : true))
  const unread = scope === 'bureau' ? mine.filter((n) => !n.read).length : (badge?.notifications ?? 0)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const label = `Notifications${unread ? `, ${unread} non lue${unread > 1 ? 's' : ''}` : ''}`
  const look = onDark
    ? 'bg-white/12 text-white hover:bg-white/20'
    : scope === 'bureau' || desktop
      ? 'bg-leppi text-white hover:opacity-92'
      : 'bg-surface-2 text-ink'

  if (!desktop) {
    return (
      <Link to="/app/notifications" aria-label={label} className={`relative grid size-11 shrink-0 place-items-center rounded-full ${look} ${className}`}>
        <BellIcon className="size-[22px]" />
        <Count n={unread} onDark={onDark} />
      </Link>
    )
  }

  const ids = mine.filter((n) => !n.read).map((n) => n.id)
  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={label} aria-expanded={open} className={`relative grid size-[46px] place-items-center rounded-full ${look}`}>
        <BellIcon className="size-[21px]" />
        <Count n={unread} />
      </button>
      {open ? (
        <div role="dialog" aria-label={scope === 'bureau' ? 'Notifications du bureau' : 'Notifications'} className="absolute top-[54px] right-0 z-50 flex max-h-[min(640px,calc(100dvh-120px))] w-[430px] flex-col overflow-hidden rounded-[22px] border border-line-soft bg-surface shadow-[0_24px_60px_rgba(18,24,61,0.22)]">
          <div className="flex items-center justify-between px-[18px] pt-4 pb-2">
            <h2 className="titre m-0 text-[19px]">{scope === 'bureau' ? 'Notifications du bureau' : 'Notifications'}</h2>
            {ids.length ? (
              <button type="button" onClick={() => markRead.mutate(scope === 'bureau' ? ids : null)} className="rounded-lg px-2 py-1 text-[14px] font-bold text-link hover:bg-surface-2">
                Tout lire
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ErrorNote error={list.error} className="mx-4 my-2" />
            {list.isPending ? (
              <div className="grid place-items-center py-10">
                <Spinner />
              </div>
            ) : (
              <NotificationList
                list={mine}
                compact
                onOpened={() => setOpen(false)}
                empty={
                  <EmptyState title="Rien de neuf" icon={<BellOff className="size-6" />}>
                    {scope === 'bureau' ? 'Les comptes à valider, les signalements et les messages au compte AEGB arriveront ici.' : 'Les réactions, les mentions, les votes et les rappels arriveront ici.'}
                  </EmptyState>
                }
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/app/reglages/notifications')
            }}
            className="flex h-12 shrink-0 items-center justify-center gap-2 border-t border-line-soft text-[14px] font-bold text-link hover:bg-surface-2"
          >
            <Settings className="size-4" /> {scope === 'bureau' ? 'Choisir les notifications de mon poste' : 'Choisir mes notifications'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
