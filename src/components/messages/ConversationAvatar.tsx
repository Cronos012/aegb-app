import { Users } from 'lucide-react'
import type { ConversationKind } from '../../lib/messages'
import { usePhotoUrl } from '../../lib/photos'
import { Avatar } from '../Avatar'
import { Logo } from '../Logo'

type Props = {
  kind: ConversationKind
  title: string
  photoPath?: string | null
  other?: { id?: string; first_name: string; last_name: string; avatar_path?: string | null } | null
  size?: number
}

/** Le grand groupe et AEGB portent le logo, un groupe sa photo, une conversation privée l'autre membre. */
export function ConversationAvatar({ kind, title, photoPath, other, size = 52 }: Props) {
  const url = usePhotoUrl(kind === 'groupe' ? photoPath : null, 'messages')
  if (kind === 'grand_groupe' || kind === 'aegb') {
    return (
      <span className="bg-anneau inline-flex shrink-0 rounded-full" style={{ padding: Math.max(2, Math.round(size / 22)) }} aria-hidden="true">
        <Logo size={size - 2 * Math.max(2, Math.round(size / 22))} />
      </span>
    )
  }
  if (kind === 'prive') {
    return <Avatar person={other ?? { first_name: '?', last_name: '' }} size={size} />
  }
  if (url) {
    return <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span className="bg-tisse grid shrink-0 place-items-center rounded-full text-safran" style={{ width: size, height: size }} aria-hidden="true" title={title}>
      <Users style={{ width: size * 0.42, height: size * 0.42 }} />
    </span>
  )
}
