import { useOutlet } from 'react-router'
import { MessageSquare } from 'lucide-react'
import { EmptyState } from '../../components/Feedback'
import { ConversationList } from '../../components/messages/ConversationList'
import { useIsDesktop } from '../../lib/media'

/**
 * Sur ordinateur, la liste à gauche et la conversation à droite. Sur
 * téléphone, la liste, puis la conversation en plein écran.
 */
export function Messages() {
  const outlet = useOutlet()
  const desktop = useIsDesktop()

  if (!desktop) return outlet ?? <ConversationList />

  return (
    <div className="grid h-app grid-cols-[380px_minmax(0,1fr)] overflow-hidden">
      <div className="flex min-h-0 flex-col border-r border-line-soft bg-surface">
        <ConversationList />
      </div>
      <div className="flex min-h-0 flex-col bg-page">
        {outlet ?? (
          <div className="grid flex-1 place-items-center">
            <EmptyState title="Choisis une conversation" icon={<MessageSquare className="size-6" />}>
              Ou écris à un membre avec le bouton crayon.
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  )
}
