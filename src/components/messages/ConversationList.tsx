import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { MessageSquare, Mic, Pencil } from 'lucide-react'
import { useSession } from '../../auth/session'
import { conversationName, listDate, previewLine, useConversations, type ConversationRow } from '../../lib/messages'
import { useOnline } from '../../lib/presence'
import { EmptyState, ErrorNote } from '../Feedback'
import { SearchField } from '../Field'
import { OfficialBadge } from '../feed/PostCard'
import { ConversationAvatar } from './ConversationAvatar'

type Filter = 'toutes' | 'non_lues' | 'groupes'

/** Sans accents ni majuscules, pour que « fatou » trouve « Fatoumata ». */
function plain(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function Row({ c, active, uid }: { c: ConversationRow; active: boolean; uid: string | undefined }) {
  const name = conversationName(c)
  const unread = c.unread > 0
  const line = previewLine(c, uid)
  const vocal = c.last_preview?.startsWith('Message vocal')
  const online = useOnline(c.kind === 'prive' ? c.other_id : null)
  return (
    <li>
      <Link
        to={`/app/messages/${c.id}`}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3.5 px-4 py-3 text-ink no-underline lg:mx-2 lg:rounded-2xl lg:px-3 ${active ? 'bg-safran-pale' : 'hover:bg-surface-2'}`}
      >
        <ConversationAvatar
          kind={c.kind}
          title={name}
          photoPath={c.photo_path}
          other={c.other_id ? { id: c.other_id, first_name: c.other_first_name ?? '?', last_name: c.other_last_name ?? '', avatar_path: c.other_avatar_path } : null}
          faces={c.faces}
          size={52}
          online={online}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[16px] font-bold">{name}</span>
            {c.kind === 'aegb' ? <OfficialBadge /> : null}
          </span>
          <span className={`flex items-center gap-1 truncate text-[14px] ${unread ? 'font-semibold text-ink' : 'text-muted'}`}>
            {vocal && !line.includes(' : ') ? <Mic className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            <span className="truncate">{c.blocked ? 'Membre bloqué' : line || (c.kind === 'groupe' ? `${c.members} membres` : 'Pas encore de message')}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5 self-start pt-1">
          <span className={`text-[12px] ${unread ? 'font-bold text-ink' : 'text-muted'}`}>{listDate(c.last_at)}</span>
          {unread ? (
            <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-safran px-1.5 text-[11px] font-extrabold text-nuit" aria-label={`${c.unread} non lu${c.unread > 1 ? 's' : ''}`}>
              {c.unread > 99 ? '99+' : c.unread}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

/** Toutes mes conversations, la plus récente en haut. */
export function ConversationList() {
  const uid = useSession().session?.user.id
  const { id } = useParams()
  const list = useConversations()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('toutes')
  const rows = list.data ?? []
  const unread = rows.filter((c) => c.unread > 0).length
  const words = plain(query).split(/\s+/).filter(Boolean)
  const shown = rows.filter((c) => {
    if (filter === 'non_lues' && !c.unread) return false
    if (filter === 'groupes' && c.kind !== 'groupe' && c.kind !== 'grand_groupe') return false
    const hay = plain(conversationName(c))
    return words.every((w) => hay.includes(w))
  })

  const chips: [Filter, string][] = [
    ['toutes', 'Toutes'],
    ['non_lues', unread ? `Non lues · ${unread}` : 'Non lues'],
    ['groupes', 'Groupes'],
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex flex-col gap-3.5 px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3 lg:px-5 lg:pt-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="titre m-0 text-[32px] lg:text-[30px]">Messages</h1>
          <Link to="/app/messages/nouveau" aria-label="Nouveau message" title="Nouveau message" className="grid size-12 place-items-center rounded-full bg-safran text-nuit shadow-sm hover:brightness-105">
            <Pencil className="size-5" />
          </Link>
        </div>
        <SearchField value={query} onChange={setQuery} placeholder="Rechercher une conversation" label="Rechercher une conversation" className="border-0 bg-surface-2 lg:border-[1.5px] lg:bg-surface" />
        <div role="radiogroup" aria-label="Afficher" className="flex gap-2">
          {chips.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              onClick={() => setFilter(value)}
              className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold ${filter === value ? 'bg-primary text-primary-ink' : 'border border-line bg-surface text-ink hover:bg-surface-2'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ErrorNote error={list.error} className="mx-4" />
      {list.isPending ? (
        <ul className="m-0 flex list-none flex-col p-0" aria-hidden="true">
          {[0, 1, 2, 3].map((k) => (
            <li key={k} className="flex items-center gap-3.5 px-4 py-3">
              <span className="size-[52px] animate-pulse rounded-full bg-surface-2" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-3 w-2/5 animate-pulse rounded-full bg-surface-2" />
                <span className="h-3 w-3/5 animate-pulse rounded-full bg-surface-2" />
              </span>
            </li>
          ))}
        </ul>
      ) : shown.length ? (
        <ul className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0 pb-4">
          {shown.map((c) => (
            <Row key={c.id} c={c} active={c.id === id} uid={uid} />
          ))}
        </ul>
      ) : (
        <EmptyState title={query || filter !== 'toutes' ? 'Aucune conversation ici' : 'Pas encore de conversation'} icon={<MessageSquare className="size-6" />}>
          {query || filter !== 'toutes' ? 'Essaie un autre nom ou un autre filtre.' : 'Écris à un membre depuis son profil ou avec le bouton crayon.'}
        </EmptyState>
      )}
    </div>
  )
}
