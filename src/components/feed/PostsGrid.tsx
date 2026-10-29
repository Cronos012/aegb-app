import { Link } from 'react-router'
import { EyeOff, Layers } from 'lucide-react'
import type { FeedPost } from '../../lib/feed'
import { MediaThumb } from './Media'

/** Les publications d'un profil, en cases carrées : la photo, ou le début du texte. */
export function PostsGrid({ posts }: { posts: FeedPost[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0 lg:gap-2">
      {posts.map((p) => {
        const media = p.post_media[0]
        return (
          <li key={p.id}>
            <Link to={`/app/fil/${p.id}`} className="relative block aspect-square overflow-hidden rounded-xl text-ink no-underline" aria-label={p.body ? `Publication : ${p.body.slice(0, 80)}` : 'Publication'}>
              {media ? (
                <MediaThumb media={media} className="h-full w-full" />
              ) : (
                <span className="flex h-full w-full items-start overflow-hidden bg-select p-2.5 text-[13px] leading-[1.35] font-semibold lg:p-3.5 lg:text-[14px]">
                  <span className="line-clamp-4 break-words lg:line-clamp-6">{p.body}</span>
                </span>
              )}
              {p.post_media.length > 1 ? (
                <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/50 text-white" aria-hidden="true">
                  <Layers className="size-3.5" />
                </span>
              ) : null}
              {p.hidden_at ? (
                <span className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">
                  <EyeOff className="size-3" /> Masquée
                </span>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
