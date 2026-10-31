import type { Voice } from '../../lib/feed'
import { useMe } from '../../lib/queries'
import { Avatar } from '../Avatar'
import { Logo } from '../Logo'

type Props = {
  /** « Répondre en tant que », « Réagir en tant que »… */
  label: string
  value: Voice
  onChange: (v: Voice) => void
  size?: 'md' | 'sm'
  className?: string
}

/**
 * Moi ou AEGB : pour ceux qui ont le droit Annonces. Le choix revient sur
 * « Moi » à chaque fois, pour ne jamais parler au nom de l'AEGB par mégarde.
 */
export function VoiceChooser({ label, value, onChange, size = 'md', className = '' }: Props) {
  const me = useMe().data!
  const sm = size === 'sm'
  const pill = `flex items-center gap-1.5 rounded-full font-semibold ${sm ? 'h-7 pr-2.5 pl-[3px] text-[13px]' : 'h-8 pr-3 pl-1 text-[14px]'}`
  const on = 'bg-select font-bold text-primary shadow-[inset_0_0_0_1.5px_var(--color-primary)]'
  const off = 'bg-surface-2 text-ink hover:bg-line-soft'
  const pic = sm ? 22 : 24
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className={`font-semibold text-muted ${sm ? 'text-[12.5px]' : 'text-[13px]'}`}>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1.5">
        <button type="button" role="radio" aria-checked={value === 'moi'} onClick={() => onChange('moi')} className={`${pill} ${value === 'moi' ? on : off}`}>
          <Avatar person={me.profile} size={pic} />
          Moi
        </button>
        <button type="button" role="radio" aria-checked={value === 'aegb'} onClick={() => onChange('aegb')} className={`${pill} ${value === 'aegb' ? on : off}`}>
          <Logo size={pic} alt="" />
          AEGB
        </button>
      </div>
    </div>
  )
}
