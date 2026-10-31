import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ChevronLeft, MessageCircle } from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { EmptyState, ErrorNote, PageLoader, Spinner } from '../../components/Feedback'
import { CommentInput, CommentList, type ReplyTo } from '../../components/feed/Comments'
import { MediaThumb } from '../../components/feed/Media'
import { PostCard } from '../../components/feed/PostCard'
import { OFFICIAL_NAME, useComments, usePost, type FeedPost } from '../../lib/feed'

function authorName(post: FeedPost) {
  if (post.official) return OFFICIAL_NAME
  return post.author ? `${post.author.first_name} ${post.author.last_name}` : 'un membre'
}

/** Le rappel de la publication en haut des commentaires, comme dans la maquette. Un appui l'ouvre en entier. */
function Summary({ post, onOpen }: { post: FeedPost; onOpen: () => void }) {
  const media = post.post_media[0]
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3.5 rounded-[12px] bg-surface-2 p-3 text-left hover:bg-select" aria-label="Voir la publication en entier">
      {media ? <MediaThumb media={media} className="size-16 shrink-0 rounded-xl" /> : null}
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">{authorName(post)}</span>
        <span className="line-clamp-2 block text-[15px] leading-[1.4] text-muted">{post.title ?? post.body}</span>
      </span>
    </button>
  )
}

/** Une publication et ses commentaires. Le champ pour commenter reste en bas. */
export function Publication() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const post = usePost(id)
  const comments = useComments(id)
  const [compact, setCompact] = useState(!!(location.state as { compact?: boolean } | null)?.compact)
  const [replyTo, setReplyTo] = useState<ReplyTo>(null)
  const [focus, setFocus] = useState(0)

  function back() {
    if (location.key !== 'default') navigate(-1)
    else navigate('/app/fil')
  }

  if (post.isPending) return <PageLoader />
  const p = post.data

  const header = (
    <header className="sticky top-0 z-20 flex h-[calc(64px+env(safe-area-inset-top))] items-center gap-2 border-b border-line-soft bg-surface px-3 pt-[env(safe-area-inset-top)] lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:p-0 lg:pb-4">
      <button type="button" onClick={back} aria-label="Retour" className="grid size-11 place-items-center rounded-xl hover:bg-surface-2">
        <ChevronLeft className="size-6" strokeWidth={2.2} />
      </button>
      <div className="min-w-0">
        <h1 className="titre m-0 text-[22px] leading-tight lg:text-[28px]">Commentaires</h1>
        {p ? <p className="m-0 truncate text-[13px] text-muted">{p.official ? 'Annonce du bureau' : `Publication de ${authorName(p)}`}</p> : null}
      </div>
    </header>
  )

  if (!p) {
    return (
      <div className="flex flex-1 flex-col bg-surface lg:bg-transparent lg:px-10 lg:py-8">
        {header}
        <ErrorNote error={post.error} className="m-4" />
        <EmptyState title="Cette publication n'est plus disponible" icon={<MessageCircle className="size-6" />}>
          Elle a été supprimée, ou elle n'est pas visible pour toi.
        </EmptyState>
        <div className="flex justify-center">
          <ButtonLink to="/app/fil" variant="outline" size="md">
            Retour au fil
          </ButtonLink>
        </div>
      </div>
    )
  }

  const count = comments.data?.filter((c) => !c.hidden_at).length ?? 0
  const closed = !!p.hidden_at

  return (
    <div className="flex min-h-app flex-1 flex-col bg-surface lg:min-h-0 lg:bg-transparent lg:px-10 lg:py-8">
      <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col lg:overflow-hidden lg:rounded-[12px] lg:bg-surface">
          {compact ? (
            <div className="px-4 pt-4">
              <Summary post={p} onOpen={() => setCompact(false)} />
            </div>
          ) : (
            <PostCard post={p} onComment={() => setFocus((f) => f + 1)} className="border-b border-line-soft lg:rounded-none" />
          )}

          <section aria-label="Commentaires" className="flex-1 px-4 pt-5 pb-6">
            <ErrorNote error={comments.error} />
            {comments.isPending ? (
              <div className="grid place-items-center py-6">
                <Spinner />
              </div>
            ) : count || comments.data?.length ? (
              <>
                <p className="m-0 mb-4 text-[14px] font-bold text-muted">
                  {count} commentaire{count > 1 ? 's' : ''}
                </p>
                <CommentList
                  comments={comments.data ?? []}
                  onReply={(to) => {
                    setReplyTo(to)
                    setFocus((f) => f + 1)
                  }}
                />
              </>
            ) : (
              <p className="m-0 py-6 text-center text-[15px] text-muted">Pas encore de commentaire. Lance la discussion !</p>
            )}
          </section>

          {closed ? (
            <p className="m-0 border-t border-line-soft px-4 py-4 text-center text-[13px] text-muted">
              Cette publication est masquée : on ne peut plus la commenter.{' '}
              <Link to="/charte" className="font-bold">
                La charte
              </Link>
            </p>
          ) : (
            <div className="sticky bottom-0 border-t border-line-soft bg-surface px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] lg:px-4">
              <CommentInput postId={p.id} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} focusKey={focus} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
