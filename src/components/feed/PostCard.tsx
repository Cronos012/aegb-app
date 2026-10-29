import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, EyeOff, Flag, MessageCircle, MoreHorizontal, Pencil, Pin, PinOff, Send, Trash2, User } from 'lucide-react'
import { useSession } from '../../auth/session'
import { errorMessage } from '../../lib/errors'
import { AUDIENCES, markSeen, OFFICIAL_NAME, personLine, POST_MAX, react, summarize, useNow, type FeedPost, type ReactionKind } from '../../lib/feed'
import { relative } from '../../lib/format'
import { removeFiles } from '../../lib/photos'
import { can, useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../Avatar'
import { Logo } from '../Logo'
import { useToast } from '../Toast'
import { ActionSheet, ConfirmDialog, EditTextDialog, HideDialog, ReportDialog, SheetAction, type Target } from './Dialogs'
import { Lightbox, MediaGrid } from './Media'
import { ReactionButton, ReactionCount, ReactorsDialog } from './Reactions'
import { RichText } from './RichText'
import { ShareDialog } from '../messages/ShareDialog'

export function OfficialBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-leppi px-2 py-0.5 text-[11px] font-extrabold text-safran">
      <Check className="size-3" strokeWidth={3.2} /> Officiel
    </span>
  )
}

function Header({ post, menu }: { post: FeedPost; menu: React.ReactNode }) {
  const edited = post.edited_at ? ' · modifiée' : ''
  if (post.official) {
    const audience = post.audience !== 'tous' ? ` · pour ${AUDIENCES.find((a) => a.value === post.audience)?.short}` : ''
    return (
      <div className="flex items-start gap-3 px-4 pt-4">
        <Logo size={44} />
        <div className="min-w-0 flex-1">
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[16px] font-bold">
            {OFFICIAL_NAME} <OfficialBadge />
          </p>
          <p className="m-0 text-[13px] text-muted">
            {relative(post.published_at)}
            {audience}
          </p>
        </div>
        {menu}
      </div>
    )
  }
  const a = post.author
  return (
    <div className="flex items-start gap-3 px-4 pt-4">
      {a ? (
        <Link to={`/app/membres/${a.id}`} aria-label={`Profil de ${a.first_name} ${a.last_name}`} className="shrink-0">
          <Avatar person={a} size={44} />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[16px] font-bold">
          {a ? (
            <Link to={`/app/membres/${a.id}`} className="text-ink no-underline hover:underline">
              {a.first_name} {a.last_name}
            </Link>
          ) : (
            'Membre parti'
          )}
          {a?.role ? <span className="rounded-full bg-safran-pale px-2 py-0.5 text-[11px] font-extrabold text-[#6B4A00]">Bureau</span> : null}
        </p>
        <p className="m-0 truncate text-[13px] text-muted">
          {a ? `${personLine(a)} · ` : ''}
          {relative(post.published_at)}
          {edited}
        </p>
      </div>
      {menu}
    </div>
  )
}

type Props = {
  post: FeedPost
  pinned?: boolean
  /** Aperçu de l'écran Annonces : ni menu ni actions. */
  preview?: boolean
  /** Sur la page de la publication, « Commenter » va au champ du bas. */
  onComment?: () => void
  /** Pour l'aperçu : les photos pas encore envoyées. */
  mediaSlot?: React.ReactNode
  className?: string
}

/** Une publication du fil : en-tête, texte, photos, réactions et commentaires. */
export function PostCard({ post, pinned = false, preview = false, onComment, mediaSlot, className = '' }: Props) {
  const uid = useSession().session?.user.id
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<ReactionKind | null | undefined>(undefined)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [reactors, setReactors] = useState(false)
  const [share, setShare] = useState(false)
  const root = useRef<HTMLElement>(null)
  const summary = summarize(post.reactions, uid, pending)
  const comments = post.comments[0]?.count ?? 0

  // Une annonce compte comme vue quand elle s'affiche vraiment à l'écran.
  useEffect(() => {
    if (!post.official || preview || !root.current) return
    const el = root.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          markSeen(post.id)
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [post.id, post.official, preview])

  async function pick(kind: ReactionKind | null) {
    setPending(kind)
    try {
      await react({ post: post.id }, kind)
      await queryClient.invalidateQueries({ queryKey: ['fil'] })
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setPending(undefined)
    }
  }

  const comment = onComment ?? (() => navigate(`/app/fil/${post.id}`, { state: { compact: true } }))

  return (
    <article
      ref={root}
      className={`bg-surface ${pinned ? 'overflow-hidden rounded-[22px] border-[1.5px] border-safran' : 'lg:rounded-[22px]'} ${className}`}
      aria-label={post.official ? `Annonce du bureau : ${post.title}` : `Publication de ${post.author?.first_name ?? 'un membre'}`}
    >
      {pinned ? (
        <p className="m-0 flex items-center gap-2 bg-safran-pale px-4 py-2 text-[13px] font-bold text-[#6B4A00]">
          <Pin className="size-4" /> Épinglé par le bureau
        </p>
      ) : null}
      <Header post={post} menu={preview ? null : <PostMenu post={post} />} />

      {post.hidden_at ? (
        <p className="mx-4 mt-3 mb-0 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-ink">
          <EyeOff className="mt-px size-4 shrink-0 text-danger" />
          <span>
            <strong>Masquée par le bureau</strong>
            {post.hidden_reason ? ` · ${post.hidden_reason}` : ''}. Personne d’autre ne la voit.
          </span>
        </p>
      ) : null}

      <div className="flex flex-col gap-2 px-4 pt-3 pb-3">
        {post.title ? <h2 className="m-0 text-[18px] leading-snug font-extrabold">{post.title}</h2> : null}
        {post.body ? <RichText text={post.body} className="text-[15px] leading-[1.5]" /> : null}
      </div>

      {mediaSlot ?? <MediaGrid media={post.post_media} onOpen={setLightbox} />}
      {lightbox !== null ? <Lightbox media={post.post_media} start={lightbox} onClose={() => setLightbox(null)} /> : null}

      {preview ? (
        <div className="mx-4 mt-2 flex border-t border-line-soft py-2 text-[14px] font-bold text-muted" aria-hidden="true">
          <span className="flex-1">J'aime</span>
          <span className="flex-1 text-center">Commenter</span>
        </div>
      ) : (
        <>
          {summary.total || comments ? (
            <div className="flex items-center justify-between gap-3 px-4 pt-2.5 pb-1">
              <ReactionCount summary={summary} onOpen={() => setReactors(true)} />
              <span />
              {comments ? (
                <button type="button" onClick={comment} className="text-[14px] text-muted hover:underline">
                  {comments} commentaire{comments > 1 ? 's' : ''}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="mx-2 mt-1 flex items-center gap-1 border-t border-line-soft py-1">
            <ReactionButton mine={summary.mine} onPick={pick} />
            <button type="button" onClick={comment} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-muted hover:bg-surface-2">
              <MessageCircle className="size-5" /> Commenter
            </button>
            {post.hidden_at ? null : (
              <button type="button" onClick={() => setShare(true)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-bold text-muted hover:bg-surface-2">
                <Send className="size-5" /> Envoyer
              </button>
            )}
          </div>
          <ReactorsDialog target={reactors ? { post: post.id } : null} onClose={() => setReactors(false)} />
          <ShareDialog post={share ? post.id : null} onClose={() => setShare(false)} />
        </>
      )}
    </article>
  )
}

type Sheet = 'menu' | 'modifier' | 'supprimer' | 'signaler' | 'masquer' | 'retirer' | null

/** Le menu « ⋯ » d'une publication : ce que chacun peut y faire dépend de qui il est. */
function PostMenu({ post }: { post: FeedPost }) {
  const me = useMe().data!
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [report, setReport] = useState<Target | null>(null)
  const mine = post.author_id === me.profile.id
  const author = post.author
  const now = useNow()
  const pinned = !!post.pinned_until && Date.parse(post.pinned_until) > now
  const moderate = !post.official && !mine && !post.hidden_at && can(me, 'moderation')
  const announces = post.official && can(me, 'annonces')

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['fil'] }), queryClient.invalidateQueries({ queryKey: ['bureau', 'annonces'] })])
  }

  /** Après une suppression depuis la page de la publication, on revient au fil. */
  function leave() {
    if (location.pathname === `/app/fil/${post.id}`) navigate('/app/fil', { replace: true })
  }

  const options = [
    !post.official && author && !mine ? (
      <SheetAction key="profil" icon={<User className="size-5" />} onClick={() => navigate(`/app/membres/${author.id}`)}>
        Voir le profil de {author.first_name}
      </SheetAction>
    ) : null,
    mine ? (
      <SheetAction key="modifier" icon={<Pencil className="size-5" />} onClick={() => setSheet('modifier')}>
        Modifier le texte
      </SheetAction>
    ) : null,
    mine ? (
      <SheetAction key="supprimer" icon={<Trash2 className="size-5" />} danger onClick={() => setSheet('supprimer')}>
        Supprimer la publication
      </SheetAction>
    ) : null,
    !post.official && !mine ? (
      <SheetAction
        key="signaler"
        icon={<Flag className="size-5" />}
        onClick={() => {
          setSheet(null)
          setReport({ post: post.id })
        }}
        hint={`${author?.first_name ?? 'Le membre'} ne saura pas que c'est toi.`}
      >
        Signaler
      </SheetAction>
    ) : null,
    moderate ? (
      <SheetAction key="masquer" icon={<EyeOff className="size-5" />} danger onClick={() => setSheet('masquer')} hint="Pour le bureau : retirer du fil sans attendre de signalement.">
        Masquer la publication
      </SheetAction>
    ) : null,
    announces && pinned ? (
      <SheetAction
        key="epingle"
        icon={<PinOff className="size-5" />}
        onClick={async () => {
          setSheet(null)
          const { error } = await supabase.rpc('unpin_announcement', { p_id: post.id })
          if (error) return toast(errorMessage(error), 'error')
          await refresh()
          toast("L'annonce n'est plus épinglée.")
        }}
      >
        Retirer l'épingle
      </SheetAction>
    ) : null,
    announces ? (
      <SheetAction key="retirer" icon={<Trash2 className="size-5" />} danger onClick={() => setSheet('retirer')}>
        Supprimer l'annonce
      </SheetAction>
    ) : null,
  ].filter(Boolean)

  if (!options.length) return null
  const firstName = author?.first_name ?? 'Le membre'

  return (
    <>
      <button type="button" onClick={() => setSheet('menu')} aria-label="Plus d'options" className="-mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
        <MoreHorizontal className="size-6" />
      </button>
      <ActionSheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={post.official ? 'Annonce du bureau' : 'Publication'}>
        {post.official && post.announcement_authors ? (
          <p className="m-0 mb-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
            Écrite par <strong className="text-ink">{post.announcement_authors.written_by_name}</strong>. Seul le bureau le voit.
          </p>
        ) : null}
        {options}
      </ActionSheet>
      {sheet === 'modifier' ? (
        <EditTextDialog
          open
          title="Modifier la publication"
          initial={post.body}
          max={POST_MAX}
          onClose={() => setSheet(null)}
          onSave={async (text) => {
            const { error } = await supabase.rpc('update_post', { p_id: post.id, p_body: text })
            if (error) throw error
            await refresh()
            toast('Publication modifiée.')
          }}
        />
      ) : null}
      <ConfirmDialog
        open={sheet === 'supprimer'}
        title="Supprimer la publication ?"
        description="Elle disparaît du fil avec ses photos, ses réactions et ses commentaires. On ne peut pas revenir en arrière."
        confirm="Supprimer"
        onClose={() => setSheet(null)}
        onConfirm={async () => {
          const { data, error } = await supabase.rpc('delete_post', { p_id: post.id })
          if (error) throw error
          await removeFiles('publications', data ?? [])
          leave()
          await refresh()
          toast('Publication supprimée.')
        }}
      />
      <ConfirmDialog
        open={sheet === 'retirer'}
        title="Supprimer l'annonce ?"
        description="Elle disparaît du fil de tous les membres. La suppression va au journal."
        confirm="Supprimer"
        onClose={() => setSheet(null)}
        onConfirm={async () => {
          const { data, error } = await supabase.rpc('delete_announcement', { p_id: post.id })
          if (error) throw error
          await removeFiles('publications', data ?? [])
          leave()
          await refresh()
          toast('Annonce supprimée.')
        }}
      />
      {sheet === 'masquer' ? <HideDialog target={{ post: post.id }} firstName={firstName} onClose={() => setSheet(null)} /> : null}
      <ReportDialog target={report} firstName={firstName} onClose={() => setReport(null)} />
    </>
  )
}
