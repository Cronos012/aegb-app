import { avatarTone, initials } from '../lib/format'
import { usePhotoUrl } from '../lib/photos'

export type AvatarPerson = {
  id?: string
  first_name: string
  last_name: string
  avatar_path?: string | null
}

type Props = {
  person: AvatarPerson
  size?: number
  ring?: boolean
  className?: string
}

/** Photo de profil, ou initiales sur une couleur douce. L'anneau tricolore marque son propre profil. */
export function Avatar({ person, size = 44, ring = false, className = '' }: Props) {
  const url = usePhotoUrl(person.avatar_path)
  const tone = avatarTone(person.id ?? person.first_name + person.last_name)
  const face = (
    <span
      className={`titre grid shrink-0 place-items-center overflow-hidden rounded-full ${ring ? '' : className}`}
      style={{ width: size, height: size, background: tone.bg, color: tone.fg, fontSize: Math.max(11, Math.round(size * 0.34)) }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials(person)}
    </span>
  )
  if (!ring) return face
  const pad = size < 70 ? 3 : 4
  return (
    <span className={`bg-anneau inline-flex shrink-0 rounded-full ${className}`} style={{ padding: pad }}>
      <span className="inline-flex rounded-full bg-surface" style={{ padding: pad }}>
        {face}
      </span>
    </span>
  )
}

/** Cercle en pointillés pour un poste sans titulaire. */
export function EmptyAvatar({ size = 44 }: { size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full border-2 border-dashed border-line"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}
