import { Check } from 'lucide-react'

/** La pastille du compte AEGB. « Bureau » n'est montré que pour lui. */
export function OfficialBadge({ small = false }: { small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-leppi font-bold text-white ${small ? 'h-[18px] px-1.5 text-[10.5px]' : 'h-5 px-2 text-[11px]'}`}>
      <Check className={small ? 'size-2.5' : 'size-3'} strokeWidth={4} /> Bureau
    </span>
  )
}
