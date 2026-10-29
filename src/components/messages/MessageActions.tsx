import { useState } from 'react'
import { Copy, Flag, Reply, Trash2 } from 'lucide-react'
import { errorMessage } from '../../lib/errors'
import { REACTIONS } from '../../lib/feed'
import { deleteMessage, reactToMessage, type MessageRow } from '../../lib/messages'
import { Dialog } from '../Dialog'
import { useToast } from '../Toast'
import { ConfirmDialog, SheetAction } from '../feed/Dialogs'

type Props = {
  message: MessageRow | null
  uid: string | undefined
  /** Mon message, ou une réponse d'AEGB pour le bureau. */
  mine: boolean
  /** Le nom de l'autre membre, pour « Fatoumata verra « Message supprimé » ». */
  otherName: string | null
  canReact: boolean
  canReport: boolean
  onClose: () => void
  onReply: (m: MessageRow) => void
  onReport: (m: MessageRow) => void
  onChanged: () => void
}

/** Les six réactions, Répondre, Copier, puis Supprimer pour tous ou Signaler. */
export function MessageActions({ message, uid, mine, otherName, canReact, canReport, onClose, onReply, onReport, onChanged }: Props) {
  const toast = useToast()
  const [confirm, setConfirm] = useState<MessageRow | null>(null)
  const m = message
  const current = m?.reactions.find((r) => r.member_id === uid)?.kind ?? null

  async function react(kind: (typeof REACTIONS)[number]['kind']) {
    if (!m) return
    onClose()
    try {
      await reactToMessage(m.id, current === kind ? null : kind)
      onChanged()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  async function copy() {
    if (!m?.body) return
    onClose()
    try {
      await navigator.clipboard.writeText(m.body)
      toast('Texte copié.')
    } catch {
      toast("Impossible de copier sur cet appareil. Sélectionne le texte à la main.", 'error')
    }
  }

  return (
    <>
      <Dialog open={!!m} onClose={onClose} title="Ce message">
        {m ? (
          <div className="-mx-2 flex flex-col pb-2">
            {canReact && m.kind === 'message' && !m.hidden ? (
              <div className="mb-2 flex items-center justify-between gap-1 rounded-full border border-line-soft bg-surface px-2 py-1.5 shadow-sm" role="group" aria-label="Réagir">
                {REACTIONS.map((r) => (
                  <button
                    key={r.kind}
                    type="button"
                    onClick={() => react(r.kind)}
                    aria-label={r.label}
                    aria-pressed={current === r.kind}
                    title={r.label}
                    className={`grid size-11 place-items-center rounded-full text-[26px] transition hover:scale-110 ${current === r.kind ? 'bg-safran-pale' : ''}`}
                  >
                    <span aria-hidden="true">{r.emoji}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {canReact && m.kind === 'message' ? (
              <SheetAction
                icon={<Reply className="size-5" />}
                hint="Ta réponse cite ce message"
                onClick={() => {
                  onClose()
                  onReply(m)
                }}
              >
                Répondre
              </SheetAction>
            ) : null}
            {m.body ? (
              <SheetAction icon={<Copy className="size-5" />} onClick={copy}>
                Copier le texte
              </SheetAction>
            ) : null}
            {mine && m.kind === 'message' ? (
              <SheetAction
                icon={<Trash2 className="size-5" />}
                danger
                hint={otherName ? `${otherName} verra « Message supprimé ».` : 'Tout le monde verra « Message supprimé ».'}
                onClick={() => {
                  onClose()
                  setConfirm(m)
                }}
              >
                Supprimer pour tous
              </SheetAction>
            ) : null}
            {canReport && !mine && m.kind === 'message' && !m.as_aegb && !m.hidden ? (
              <SheetAction
                icon={<Flag className="size-5" />}
                danger
                hint={m.reported ? 'Tu l’as déjà signalé. Le bureau va regarder.' : 'Anonyme. Le bureau voit seulement ce message.'}
                onClick={() => {
                  onClose()
                  if (!m.reported) onReport(m)
                }}
              >
                Signaler le message
              </SheetAction>
            ) : null}
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={!!confirm}
        title="Supprimer pour tous ?"
        description="Le message disparaît pour tout le monde. À la place, on verra « Message supprimé »."
        confirm="Supprimer"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          await deleteMessage(confirm.id)
          onChanged()
          toast('Message supprimé.')
        }}
      />
    </>
  )
}
