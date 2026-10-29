import { Link } from 'react-router'
import { relative, TYPE_LABELS } from '../../lib/format'
import { useActiveMembers, useMe } from '../../lib/queries'
import { Avatar } from '../Avatar'

/** Les derniers membres validés, pour leur souhaiter la bienvenue. */
export function NewMembers({ count = 3 }: { count?: number }) {
  const me = useMe().data
  const newcomers = useActiveMembers()
    .data?.filter((m) => m.id !== me?.profile.id && m.validated_at)
    .sort((a, b) => b.validated_at!.localeCompare(a.validated_at!))
    .slice(0, count)
  if (!newcomers?.length) return null
  return (
    <div className="rounded-[22px] bg-surface p-5">
      <h2 className="titre m-0 text-[19px]">Nouveaux membres</h2>
      <ul className="m-0 mt-4 flex list-none flex-col gap-3.5 p-0">
        {newcomers.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <Link to={`/app/membres/${m.id}`} className="shrink-0" aria-hidden="true" tabIndex={-1}>
              <Avatar person={m} size={40} />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-sm font-bold">
                {m.first_name} {m.last_name}
              </p>
              <p className="m-0 text-xs text-muted">
                {TYPE_LABELS[m.member_type]} · {relative(m.validated_at!)}
              </p>
            </div>
            <Link to={`/app/membres/${m.id}`} className="text-[13px] font-bold">
              Voir
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
