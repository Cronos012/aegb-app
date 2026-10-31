import { Users } from 'lucide-react'
import type { ConversationKind } from '../../lib/messages'
import { usePhotoUrl } from '../../lib/photos'
import { OnlineDot } from '../../lib/presence'
import { Avatar, type AvatarPerson } from '../Avatar'
import { Logo } from '../Logo'

type Props = {
  kind: ConversationKind
  title: string
  photoPath?: string | null
  other?: AvatarPerson | null
  /** Un groupe sans photo montre deux de ses membres. */
  faces?: AvatarPerson[] | null
  size?: number
  /** Le point vert d'une conversation privée : l'autre membre a l'appli ouverte. */
  online?: boolean
}

/** Le grand groupe et AEGB portent le logo, un groupe sa photo, une conversation privée l'autre membre. */
export function ConversationAvatar({ kind, title, photoPath, other, faces, size = 52, online = false }: Props) {
  const url = usePhotoUrl(kind === 'groupe' ? photoPath : null, 'messages')
  if (kind === 'grand_groupe' || kind === 'aegb') {
    return (
      <span className="bg-anneau inline-flex shrink-0 rounded-full" style={{ padding: Math.max(2, Math.round(size / 22)) }} aria-hidden="true">
        <Logo size={size - 2 * Math.max(2, Math.round(size / 22))} />
      </span>
    )
  }
  if (kind === 'prive') {
    const face = <Avatar person={other ?? { first_name: '?', last_name: '' }} size={size} />
    if (!online) return face
    return (
      <span className="relative inline-flex shrink-0">
        {face}
        <OnlineDot size={size} />
      </span>
    )
  }
  if (url) {
    return <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  if (!photoPath && faces && faces.length >= 2) {
    const face = Math.round(size * 0.66)
    const border = Math.max(2, Math.round(size / 26))
    return (
      <span className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true" title={title}>
        <span className="absolute top-0 left-0">
          <Avatar person={faces[0]} size={face} />
        </span>
        <span className="absolute right-0 bottom-0 rounded-full bg-surface" style={{ padding: border, margin: -border }}>
          <Avatar person={faces[1]} size={face} />
        </span>
      </span>
    )
  }
  return (
    <span className="bg-tisse grid shrink-0 place-items-center rounded-full text-safran" style={{ width: size, height: size }} aria-hidden="true" title={title}>
      <Users style={{ width: size * 0.42, height: size * 0.42 }} />
    </span>
  )
}
