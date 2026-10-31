import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { LoaderCircle } from 'lucide-react'
import { errorMessage } from '../../lib/errors'
import { relative, TYPE_LABELS } from '../../lib/format'
import { openPrivate } from '../../lib/messages'
import { useActiveMembers, useMe } from '../../lib/queries'
import { Avatar } from '../Avatar'
import { useToast } from '../Toast'

/** Les derniers membres validés, pour leur souhaiter la bienvenue. */
export function NewMembers({ count = 3 }: { count?: number }) {
  const me = useMe().data
  const navigate = useNavigate()
  const toast = useToast()
  const [opening, setOpening] = useState<string | null>(null)
  const newcomers = useActiveMembers()
    .data?.filter((m) => m.id !== me?.profile.id && m.validated_at)
    .sort((a, b) => b.validated_at!.localeCompare(a.validated_at!))
    .slice(0, count)
  if (!newcomers?.length) return null

  async function hello(member: string) {
    setOpening(member)
    try {
      navigate(`/app/messages/${await openPrivate(member)}`)
    } catch (e) {
      toast(errorMessage(e), 'error')
      setOpening(null)
    }
  }

  return (
    <div className="rounded-[12px] bg-surface p-5">
      <h2 className="titre m-0 text-[19px]">Nouveaux membres</h2>
      <ul className="m-0 mt-4 flex list-none flex-col gap-3.5 p-0">
        {newcomers.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <Link to={`/app/membres/${m.id}`} className="shrink-0" aria-hidden="true" tabIndex={-1}>
              <Avatar person={m} size={40} />
            </Link>
            <Link to={`/app/membres/${m.id}`} className="min-w-0 flex-1 text-ink no-underline">
              <p className="m-0 truncate text-sm font-bold">
                {m.first_name} {m.last_name}
              </p>
              <p className="m-0 text-xs text-muted">
                {TYPE_LABELS[m.member_type]} · {relative(m.validated_at!)}
              </p>
            </Link>
            <button
              type="button"
              onClick={() => hello(m.id)}
              disabled={!!opening}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-safran-pale px-3 text-[12px] font-bold text-[#163F93] hover:brightness-97 disabled:opacity-60"
            >
              {opening === m.id ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              Dire bonjour
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
