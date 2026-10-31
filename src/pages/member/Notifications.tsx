import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BellOff, ChevronLeft } from 'lucide-react'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { KeepNote, NotificationList } from '../../components/notifications/NotificationList'
import { useMarkRead, useNotifications } from '../../lib/notifications'

/** La cloche sur téléphone : les notifications des 30 derniers jours. */
export function Notifications() {
  const navigate = useNavigate()
  const list = useNotifications()
  const markRead = useMarkRead()
  const [unreadOnly, setUnreadOnly] = useState(false)

  const all = list.data ?? []
  const unread = all.filter((n) => !n.read).length
  const shown = unreadOnly ? all.filter((n) => !n.read) : all

  const chip = (active: boolean) =>
    `h-10 rounded-full px-4 text-[15px] font-bold ${active ? 'bg-leppi text-white' : 'border-[1.5px] border-line bg-surface text-ink hover:bg-surface-2'}`

  return (
    <div className="flex flex-1 flex-col bg-surface lg:mx-auto lg:my-8 lg:w-full lg:max-w-[680px] lg:rounded-[26px]">
      <header className="sticky top-0 z-20 flex h-[calc(60px+env(safe-area-inset-top))] items-center gap-2 border-b border-line-soft bg-surface px-3 pt-[env(safe-area-inset-top)] lg:static lg:rounded-t-[26px] lg:px-5">
        <button type="button" onClick={() => navigate(-1)} aria-label="Retour" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-surface-2">
          <ChevronLeft className="size-6" strokeWidth={2.2} />
        </button>
        <h1 className="titre m-0 flex-1 text-[22px]">Notifications</h1>
        {unread ? (
          <button type="button" onClick={() => markRead.mutate(null)} className="rounded-xl px-3 py-2 text-[15px] font-bold text-link hover:bg-surface-2">
            Tout lire
          </button>
        ) : null}
      </header>

      <div className="flex gap-2.5 border-b border-line-soft px-4 py-3" role="radiogroup" aria-label="Afficher">
        <button type="button" role="radio" aria-checked={!unreadOnly} onClick={() => setUnreadOnly(false)} className={chip(!unreadOnly)}>
          Tout
        </button>
        <button type="button" role="radio" aria-checked={unreadOnly} onClick={() => setUnreadOnly(true)} className={chip(unreadOnly)}>
          Non lues ({unread})
        </button>
      </div>

      <ErrorNote error={list.error} className="m-4" />
      {list.isPending ? (
        <PageLoader />
      ) : (
        <div className="pb-6">
          <NotificationList
            list={shown}
            empty={
              <EmptyState title={unreadOnly ? 'Tout est lu' : 'Pas encore de notification'} icon={<BellOff className="size-6" />}>
                {unreadOnly ? 'Tu es à jour.' : 'Les réactions à tes publications, les mentions, les votes et les rappels arriveront ici.'}
              </EmptyState>
            }
          />
          <KeepNote className="mx-4 mt-4" />
        </div>
      )}
    </div>
  )
}
