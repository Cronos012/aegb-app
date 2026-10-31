import { Check, ChevronRight, Users } from 'lucide-react'
import { matches, memberLine, type DirectoryMember } from '../../lib/feed'
import { Avatar } from '../Avatar'
import { EmptyState, Spinner } from '../Feedback'

type Props = {
  members: DirectoryMember[] | undefined
  query: string
  /** Avec une sélection : des cases à cocher. Sans : un appui choisit le membre. */
  selected?: Set<string>
  busy?: string | null
  onPick: (m: DirectoryMember) => void
}

/** La liste des membres à qui écrire ou à ajouter dans un groupe. */
export function MemberPicker({ members, query, selected, busy = null, onPick }: Props) {
  if (!members) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }
  const shown = members.filter((m) => matches(m, query))
  if (!shown.length) {
    return (
      <EmptyState title="Personne ici" icon={<Users className="size-6" />}>
        {query ? 'Essaie un autre nom, une ville ou une école.' : 'Aucun autre membre pour le moment.'}
      </EmptyState>
    )
  }
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {shown.map((m) => {
        const checked = selected?.has(m.id) ?? false
        return (
          <li key={m.id} className="border-b border-line-soft last:border-0">
            <button
              type="button"
              role={selected ? 'checkbox' : undefined}
              aria-checked={selected ? checked : undefined}
              onClick={() => onPick(m)}
              disabled={!!busy}
              className="flex w-full items-center gap-3.5 px-4 py-3 text-left hover:bg-surface-2 disabled:opacity-60 lg:px-5"
            >
              <Avatar person={m} size={48} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-bold">
                  {m.first_name} {m.last_name}
                </span>
                <span className="block truncate text-[14px] text-muted">{memberLine(m)}</span>
              </span>
              {selected ? (
                <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${checked ? 'border-primary bg-primary text-primary-ink' : 'border-line'}`} aria-hidden="true">
                  {checked ? <Check className="size-4" strokeWidth={3} /> : null}
                </span>
              ) : busy === m.id ? (
                <Spinner className="size-5" />
              ) : (
                <ChevronRight className="size-5 shrink-0 text-muted" />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
