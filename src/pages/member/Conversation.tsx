import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, ChevronLeft, Info, MessageSquare, MoreHorizontal, User, UserRound, Users } from 'lucide-react'
import { useSession } from '../../auth/session'
import { Avatar } from '../../components/Avatar'
import { ButtonLink } from '../../components/Button'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { ActionSheet, SheetAction } from '../../components/feed/Dialogs'
import { OfficialBadge } from '../../components/feed/PostCard'
import { BlockDialog } from '../../components/messages/BlockDialog'
import { ConversationAvatar } from '../../components/messages/ConversationAvatar'
import { Thread } from '../../components/messages/Thread'
import { errorMessage } from '../../lib/errors'
import { TYPE_LABELS } from '../../lib/format'
import { groupFaces, setBlocked, useConversationInfo, type ConversationInfo } from '../../lib/messages'

function subtitle(info: ConversationInfo): string {
  const o = info.other
  if (info.as_aegb) return o ? `Conversation avec AEGB · ${TYPE_LABELS[o.member_type]}${o.city ? ` · ${o.city}` : ''}` : 'Conversation avec AEGB'
  if (info.kind === 'aegb') return 'Compte officiel · le bureau te répond ici'
  if (info.kind === 'prive') return o ? [TYPE_LABELS[o.member_type], o.city].filter(Boolean).join(' · ') : ''
  return `${info.members_count} membre${info.members_count > 1 ? 's' : ''}`
}

function title(info: ConversationInfo): string {
  if ((info.kind === 'prive' || info.as_aegb) && info.other) return `${info.other.first_name} ${info.other.last_name}`
  if (info.kind === 'prive') return 'Membre parti'
  return info.title
}

/** En haut de la conversation privée, une fois tout chargé : qui est l'autre membre. */
function Intro({ info }: { info: ConversationInfo }) {
  const o = info.other
  if (info.kind === 'prive' && o) {
    return (
      <div className="mx-auto my-4 flex max-w-[300px] flex-col items-center gap-2 text-center">
        <Avatar person={o} size={72} />
        <p className="m-0 text-[17px] font-bold">
          {o.first_name} {o.last_name}
        </p>
        <p className="m-0 text-[13px] text-muted">{subtitle(info)}</p>
        <Link to={`/app/membres/${o.id}`} className="text-[13px] font-bold">
          Voir le profil
        </Link>
      </div>
    )
  }
  const text =
    info.kind === 'grand_groupe'
      ? 'Tous les membres validés de l’AEGB sont ici. Présente-toi, partage les bons plans, reste poli.'
      : info.kind === 'aegb' && !info.as_aegb
        ? 'Le compte officiel de l’AEGB. Un membre du bureau lit tes messages et te répond ici.'
        : null
  if (!text) return null
  return <p className="mx-auto my-4 max-w-[320px] rounded-2xl bg-surface px-4 py-3 text-center text-[13px] leading-[1.45] text-muted">{text}</p>
}

export function Conversation() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const info = useConversationInfo(id)
  const uid = useSession().session?.user.id
  const [menu, setMenu] = useState(false)
  const [block, setBlock] = useState<{ id: string; first_name: string } | null>(null)

  const back = (
    <button type="button" onClick={() => navigate('/app/messages')} aria-label="Retour aux messages" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-surface-2 lg:hidden">
      <ChevronLeft className="size-6" strokeWidth={2.2} />
    </button>
  )

  if (info.isPending) {
    return (
      <div className="flex h-dvh flex-col bg-page lg:h-full">
        <header className="flex h-[calc(64px+env(safe-area-inset-top))] shrink-0 items-center border-b border-line-soft bg-surface px-2 pt-[env(safe-area-inset-top)]">{back}</header>
        <PageLoader />
      </div>
    )
  }

  const c = info.data
  if (!c || !id) {
    return (
      <div className="flex h-dvh flex-col bg-page lg:h-full">
        <header className="flex h-[calc(64px+env(safe-area-inset-top))] shrink-0 items-center border-b border-line-soft bg-surface px-2 pt-[env(safe-area-inset-top)]">{back}</header>
        <div className="grid flex-1 place-items-center">
          <div>
            <EmptyState title="Cette conversation n’est plus disponible" icon={<MessageSquare className="size-6" />}>
              Tu as peut-être quitté ce groupe, ou ce lien n’est pas pour toi.
            </EmptyState>
            <ErrorNote error={info.error} className="mx-6" />
          </div>
        </div>
      </div>
    )
  }

  const o = c.other
  const infosLink = c.kind === 'groupe' || c.kind === 'grand_groupe' ? `/app/messages/${id}/infos` : c.kind === 'prive' && o ? `/app/membres/${o.id}` : c.as_aegb && o ? `/app/membres/${o.id}` : null

  async function unblock() {
    if (!o) return
    try {
      await setBlocked(o.id, false)
      await queryClient.invalidateQueries({ queryKey: ['messages'] })
      toast(`Tu as débloqué ${o.first_name}.`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const head = (
    <>
      <ConversationAvatar kind={c.as_aegb ? 'prive' : c.kind} title={title(c)} photoPath={c.photo_path} other={o} faces={groupFaces(c, uid)} size={44} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[17px] font-bold">{title(c)}</span>
          {c.kind === 'aegb' && !c.as_aegb ? <OfficialBadge /> : null}
        </span>
        <span className="block truncate text-[13px] text-muted">{subtitle(c)}</span>
      </span>
    </>
  )

  return (
    <div className="flex h-dvh flex-col bg-page lg:h-full">
      <header className="flex h-[calc(64px+env(safe-area-inset-top))] shrink-0 items-center gap-1 border-b border-line-soft bg-surface px-2 pt-[env(safe-area-inset-top)] lg:h-[76px] lg:px-6">
        {back}
        {infosLink ? (
          <Link to={infosLink} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 pr-2 text-ink no-underline">
            {head}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 py-1 pr-2">{head}</div>
        )}
        {c.kind === 'prive' && o ? (
          <span className="hidden lg:block">
            <ButtonLink to={`/app/membres/${o.id}`} variant="outline" size="md" icon={<UserRound className="size-5" />}>
              Voir le profil
            </ButtonLink>
          </span>
        ) : c.kind === 'groupe' || c.kind === 'grand_groupe' ? (
          <span className="hidden lg:block">
            <ButtonLink to={`/app/messages/${id}/infos`} variant="outline" size="md" icon={<Info className="size-5" />}>
              Infos du groupe
            </ButtonLink>
          </span>
        ) : null}
        {c.kind !== 'aegb' ? (
          <button type="button" onClick={() => setMenu(true)} aria-label="Plus d’options" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 lg:hidden">
            <MoreHorizontal className="size-6" />
          </button>
        ) : null}
      </header>

      <Thread key={id} id={id} info={c} intro={<Intro info={c} />} />

      <ActionSheet open={menu} onClose={() => setMenu(false)} title={title(c)}>
        {c.kind === 'prive' && o ? (
          <>
            <SheetAction icon={<User className="size-5" />} onClick={() => navigate(`/app/membres/${o.id}`)}>
              Voir le profil
            </SheetAction>
            {o.blocked ? (
              <SheetAction
                icon={<Ban className="size-5" />}
                hint="Ses messages privés t’arriveront de nouveau"
                onClick={() => {
                  setMenu(false)
                  unblock()
                }}
              >
                Débloquer {o.first_name}
              </SheetAction>
            ) : (
              <SheetAction
                icon={<Ban className="size-5" />}
                danger
                hint="Tu ne recevras plus ses messages privés"
                onClick={() => {
                  setMenu(false)
                  setBlock({ id: o.id, first_name: o.first_name })
                }}
              >
                Bloquer {o.first_name}
              </SheetAction>
            )}
          </>
        ) : (
          <SheetAction icon={<Users className="size-5" />} onClick={() => navigate(`/app/messages/${id}/infos`)}>
            Infos du groupe
          </SheetAction>
        )}
      </ActionSheet>
      <BlockDialog member={block} onClose={() => setBlock(null)} />
    </div>
  )
}
