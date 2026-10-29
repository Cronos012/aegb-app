import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, MessageSquare } from 'lucide-react'
import { errorMessage } from '../../lib/errors'
import { conversationName, sendMessage, useConversations, type ConversationRow } from '../../lib/messages'
import { Dialog } from '../Dialog'
import { EmptyState, ErrorNote, Spinner } from '../Feedback'
import { SearchField } from '../Field'
import { useToast } from '../Toast'
import { ConversationAvatar } from './ConversationAvatar'

function plain(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Envoyer une publication dans une conversation : seuls ceux qui ont le droit de la voir pourront l'ouvrir. */
export function ShareDialog({ post, onClose }: { post: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const list = useConversations(!!post)
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(new Set())

  function close() {
    setQuery('')
    setSent(new Set())
    onClose()
  }

  async function share(c: ConversationRow) {
    if (!post) return
    setSending(c.id)
    try {
      await sendMessage({ conversation: c.id, id: crypto.randomUUID(), body: '', post })
      setSent((s) => new Set(s).add(c.id))
      queryClient.invalidateQueries({ queryKey: ['messages', 'liste'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'fil', c.id] })
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setSending(null)
    }
  }

  const words = plain(query).split(/\s+/).filter(Boolean)
  const rows = (list.data ?? []).filter((c) => !c.blocked && words.every((w) => plain(conversationName(c)).includes(w)))

  return (
    <Dialog open={!!post} onClose={close} title="Envoyer la publication" description="Dans une conversation. Seuls les membres qui ont le droit de la voir pourront l’ouvrir.">
      <SearchField value={query} onChange={setQuery} placeholder="Rechercher une conversation" label="Rechercher une conversation" />
      <ErrorNote error={list.error} className="mt-3" />
      {list.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : rows.length ? (
        <ul className="-mx-2 mt-2 flex list-none flex-col p-0">
          {rows.map((c) => {
            const done = sent.has(c.id)
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <ConversationAvatar
                  kind={c.kind}
                  title={conversationName(c)}
                  photoPath={c.photo_path}
                  other={c.other_id ? { id: c.other_id, first_name: c.other_first_name ?? '?', last_name: c.other_last_name ?? '', avatar_path: c.other_avatar_path } : null}
                  size={44}
                />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{conversationName(c)}</span>
                <button
                  type="button"
                  onClick={() => share(c)}
                  disabled={done || !!sending}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold disabled:cursor-default ${done ? 'bg-ok-soft text-ok' : 'bg-primary text-primary-ink disabled:opacity-60'}`}
                >
                  {sending === c.id ? <Spinner className="size-4 text-primary-ink" /> : done ? <Check className="size-4" /> : null}
                  {done ? 'Envoyé' : 'Envoyer'}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState title={query ? 'Aucune conversation ici' : 'Pas encore de conversation'} icon={<MessageSquare className="size-6" />}>
          {query ? 'Essaie un autre nom.' : 'Écris d’abord à un membre depuis son profil.'}
        </EmptyState>
      )}
    </Dialog>
  )
}
