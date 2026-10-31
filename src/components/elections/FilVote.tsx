import { Link } from 'react-router'
import { Check, ChevronRight, Clock, Vote } from 'lucide-react'
import { Pill } from '../Pill'
import { dayMonth, hour, openBallot, useAssembly } from '../../lib/elections'
import { Participation, VoteLink } from './Parts'

/** En tête du fil pendant le vote : « Ton bulletin t'attend », ou la participation une fois voté. */
export function FilVote({ className = '' }: { className?: string }) {
  const a = useAssembly().data
  const b = openBallot(a)
  if (!a || !b) return null
  const title = `${b.round === 2 ? 'Second tour de l’AG' : 'AG'} du ${dayMonth(a.held_at)}`
  if (b.voted_at || a.my.right !== 'actif') {
    return (
      <Link to="/app/votes" className={`flex flex-col gap-2.5 rounded-[12px] bg-surface p-4 text-ink no-underline hover:bg-surface-2 ${className}`}>
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold">
            {b.voted_at ? <Check className="size-5 shrink-0 text-ok" strokeWidth={2.6} /> : <Vote className="size-5 shrink-0 text-ok" />}
            <span className="truncate">{b.voted_at ? `Tu as voté · ${title}` : `Le vote est ouvert · ${title}`}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted" />
        </span>
        <Participation ballot={b} compact />
      </Link>
    )
  }
  return (
    <section className={`flex flex-col gap-3 rounded-[12px] border-2 border-safran bg-safran-pale/45 p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <Pill tone="ok" icon={<Check className="size-3.5" strokeWidth={3} />}>
          {b.round === 2 ? 'Second tour ouvert' : 'Vote ouvert'}
        </Pill>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#163F93]">
          <Clock className="size-4" /> Ferme à {hour(b.closes_at)}
        </span>
      </div>
      <h2 className="titre m-0 text-[22px] leading-tight">{title} : ton bulletin t’attend</h2>
      <Participation ballot={b} compact />
      <VoteLink>
        <Vote className="size-5" /> Voter
      </VoteLink>
    </section>
  )
}
