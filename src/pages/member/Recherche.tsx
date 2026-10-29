import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ChevronLeft, Search } from 'lucide-react'
import { EmptyState, ErrorNote, Spinner } from '../../components/Feedback'
import { PostCard } from '../../components/feed/PostCard'
import { matches, useDirectory, useSearchPosts } from '../../lib/feed'
import { MemberRow } from './Annuaire'

/** Chercher un membre ou une publication. */
export function Recherche() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const directory = useDirectory()
  const text = query.trim()
  const posts = useSearchPosts(text)
  const people = text ? (directory.data ?? []).filter((m) => matches(m, text)).slice(0, 8) : []
  const ready = text.length >= 2

  return (
    <div className="flex flex-1 flex-col lg:px-10 lg:py-8">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line-soft bg-surface px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2.5 lg:static lg:max-w-[760px] lg:border-0 lg:bg-transparent lg:p-0">
        <button type="button" onClick={() => navigate(-1)} aria-label="Retour" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-surface-2">
          <ChevronLeft className="size-6" strokeWidth={2.2} />
        </button>
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-surface-2 px-4 focus-within:ring-[3px] focus-within:ring-safran/45 lg:bg-surface">
          <Search className="size-5 shrink-0 text-muted" />
          <span className="sr-only">Rechercher</span>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
            }}
            placeholder="Un membre, une publication"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
          />
        </label>
      </header>

      <div className="flex flex-col gap-5 px-0 pt-4 pb-8 lg:max-w-[760px] lg:pt-6">
        {!ready ? (
          <p className="m-0 px-5 text-center text-[15px] text-muted lg:px-0 lg:text-left">Tape au moins deux lettres : un prénom, une ville, une école, un mot d'une publication.</p>
        ) : (
          <>
            <section aria-label="Membres">
              <h2 className="m-0 mb-2 px-5 text-[13px] font-bold tracking-[0.06em] text-muted uppercase lg:px-1">Membres</h2>
              {people.length ? (
                <ul className="m-0 list-none divide-y divide-line-soft overflow-hidden bg-surface p-0 lg:rounded-[22px]">
                  {people.map((m) => (
                    <li key={m.id}>
                      <MemberRow m={m} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 px-5 text-[14px] text-muted lg:px-1">Aucun membre ne correspond.</p>
              )}
            </section>

            <section aria-label="Publications" className="flex flex-col gap-2 lg:gap-4">
              <h2 className="m-0 px-5 text-[13px] font-bold tracking-[0.06em] text-muted uppercase lg:px-1">Publications</h2>
              <ErrorNote error={posts.error} className="mx-4 lg:mx-0" />
              {posts.isPending ? (
                <div className="grid place-items-center py-6">
                  <Spinner />
                </div>
              ) : posts.data?.length ? (
                posts.data.map((p) => <PostCard key={p.id} post={p} />)
              ) : (
                <div className="bg-surface lg:rounded-[22px]">
                  <EmptyState title="Aucune publication ne correspond">Essaie avec un autre mot.</EmptyState>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
