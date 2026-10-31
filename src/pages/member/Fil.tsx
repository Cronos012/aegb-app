import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ImagePlus, LayoutGrid, Newspaper, Search } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { ActivateCard } from '../../components/notifications/ActivateCard'
import { Bell } from '../../components/notifications/Bell'
import { ButtonLink } from '../../components/Button'
import { FilVote } from '../../components/elections/FilVote'
import { NextEventBand } from '../../components/events/EventParts'
import { EmptyState, ErrorNote, Spinner } from '../../components/Feedback'
import { SearchField } from '../../components/Field'
import { Logo } from '../../components/Logo'
import { handOffFiles } from '../../lib/attachments'
import { NewMembers } from '../../components/feed/NewMembers'
import { PostCard } from '../../components/feed/PostCard'
import { useFeed, usePinned } from '../../lib/feed'
import { useMe } from '../../lib/queries'

/** Choisir une photo dès le fil, puis l'écran « Nouvelle publication » prend le relais. */
function PhotoPicker({ children, className }: { children: React.ReactNode; className: string }) {
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/webm"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (!files.length) return
          handOffFiles(files)
          navigate('/app/publier')
        }}
      />
      <button type="button" onClick={() => input.current?.click()} className={className} aria-label="Publier une photo ou une vidéo">
        {children}
      </button>
    </>
  )
}

function Skeleton() {
  return (
    <div className="bg-surface p-4 lg:rounded-[12px]" aria-hidden="true">
      <div className="flex items-center gap-3">
        <span className="size-11 animate-pulse rounded-full bg-surface-2" />
        <span className="flex flex-1 flex-col gap-2">
          <span className="h-3 w-2/5 animate-pulse rounded-full bg-surface-2" />
          <span className="h-3 w-1/4 animate-pulse rounded-full bg-surface-2" />
        </span>
      </div>
      <span className="mt-4 block h-3 w-4/5 animate-pulse rounded-full bg-surface-2" />
      <span className="mt-2 block h-3 w-3/5 animate-pulse rounded-full bg-surface-2" />
      <span className="mt-4 block h-48 animate-pulse rounded-xl bg-surface-2" />
    </div>
  )
}

export function Fil() {
  const me = useMe().data!
  const navigate = useNavigate()
  const feed = useFeed()
  const pinned = usePinned()
  const [query, setQuery] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed

  // Les publications suivantes arrivent quand on approche du bas.
  useEffect(() => {
    const el = end.current
    if (!el || !hasNextPage) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '600px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const pin = pinned.data
  const posts = (feed.data?.pages.flat() ?? []).filter((p) => p.id !== pin?.id)
  const first = me.profile.first_name

  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,680px)_320px] lg:items-start lg:justify-center lg:gap-6 lg:px-10 lg:py-8">
      <header className="sticky top-0 z-20 flex h-[calc(56px+env(safe-area-inset-top))] items-center gap-3 border-b border-line-soft bg-surface px-4 pt-[env(safe-area-inset-top)] lg:hidden">
        <Logo size={34} />
        <span className="flex-1 text-[26px] font-extrabold tracking-[-0.03em] text-primary">aegb</span>
        <Link to="/app/recherche" aria-label="Rechercher un membre ou une publication" className="grid size-10 place-items-center rounded-full bg-line-soft text-ink">
          <Search className="size-[22px]" />
        </Link>
        <Bell />
        <Link to="/app/menu" aria-label="Menu" className="grid size-10 place-items-center rounded-full bg-line-soft text-ink">
          <LayoutGrid className="size-[22px]" />
        </Link>
      </header>

      <div className="flex min-w-0 flex-col gap-2 pb-6 lg:gap-4 lg:pb-0">
        <div className="hidden items-center justify-between gap-6 lg:flex">
          <h1 className="titre m-0 text-[28px]">Accueil</h1>
          <div className="flex items-center gap-3">
            <form
              className="w-[380px]"
              onSubmit={(e) => {
                e.preventDefault()
                if (query.trim()) navigate(`/app/recherche?q=${encodeURIComponent(query.trim())}`)
              }}
            >
              <SearchField value={query} onChange={setQuery} placeholder="Rechercher un membre, une publication" />
            </form>
            <Bell />
          </div>
        </div>

        <ActivateCard className="mx-3 mt-3 lg:mx-0 lg:mt-0" />
        <NextEventBand />
        <div className="flex items-center gap-3 bg-surface px-4 py-3 lg:rounded-[12px] lg:p-4">
          <Avatar person={me.profile} size={44} />
          <Link to="/app/publier" className="flex h-12 min-w-0 flex-1 items-center rounded-full border-[1.5px] border-line px-5 text-[16px] text-muted no-underline hover:bg-surface-2 lg:border-0 lg:bg-surface-2">
            <span className="truncate">Quoi de neuf, {first} ?</span>
          </Link>
          <PhotoPicker className="grid size-12 shrink-0 place-items-center rounded-full bg-ok-soft text-ok lg:hidden">
            <ImagePlus className="size-6" />
          </PhotoPicker>
          <PhotoPicker className="hidden h-11 shrink-0 items-center gap-2 rounded-xl border-[1.5px] border-line px-4 text-[15px] font-bold text-ink hover:bg-surface-2 lg:flex">
            <ImagePlus className="size-5" /> Photo ou vidéo
          </PhotoPicker>
        </div>

        <FilVote className="mx-3 lg:mx-0" />
        {pin ? <PostCard post={pin} pinned className="mx-3 lg:mx-0" /> : null}

        <ErrorNote error={feed.error} className="mx-3 lg:mx-0" />
        {feed.isPending ? (
          <>
            <Skeleton />
            <Skeleton />
          </>
        ) : posts.length ? (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        ) : !pin && !feed.isError ? (
          <div className="bg-surface lg:rounded-[12px]">
            <EmptyState title="Le fil est encore vide" icon={<Newspaper className="size-6" />}>
              Lance la conversation : une photo de la soirée, une bonne adresse, un bonjour aux nouveaux.
            </EmptyState>
            <div className="flex justify-center pb-8">
              <ButtonLink to="/app/publier" size="md">
                Publier
              </ButtonLink>
            </div>
          </div>
        ) : null}

        <div ref={end} />
        {isFetchingNextPage ? (
          <div className="grid place-items-center py-6">
            <Spinner />
          </div>
        ) : null}
        {!feed.isPending && !hasNextPage && posts.length > 3 ? <p className="m-0 py-6 text-center text-[13px] text-muted">Tu as tout vu. Reviens plus tard !</p> : null}
      </div>

      <aside className="sticky top-8 hidden flex-col gap-6 lg:flex">
        <NewMembers />
      </aside>
    </div>
  )
}
