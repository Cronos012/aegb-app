import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'
import type { Media } from '../../lib/feed'
import { usePhotoUrl } from '../../lib/photos'

/** Le format d'une photo seule, entre portrait 4:5 et paysage large, comme sur les réseaux. */
function ratio(m: Pick<Media, 'width' | 'height'>): number {
  if (!m.width || !m.height) return 4 / 3
  return Math.min(1.91, Math.max(0.8, m.width / m.height))
}

function Photo({ media, className = '', onClick, label }: { media: Pick<Media, 'path'>; className?: string; onClick?: () => void; label?: string }) {
  const url = usePhotoUrl(media.path, 'publications')
  const body = url ? <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse bg-surface-2" />
  if (!onClick) return <div className={`overflow-hidden bg-surface-2 ${className}`}>{body}</div>
  return (
    <button type="button" onClick={onClick} aria-label={label ?? 'Agrandir la photo'} className={`block overflow-hidden bg-surface-2 ${className}`}>
      {body}
    </button>
  )
}

function Video({ media, className = '' }: { media: Pick<Media, 'path'>; className?: string }) {
  const url = usePhotoUrl(media.path, 'publications')
  if (!url) return <div className={`animate-pulse bg-nuit ${className}`} />
  return <video src={url} controls playsInline preload="metadata" className={`bg-black object-contain ${className}`} />
}

/** Les photos ou la vidéo d'une publication, sur toute la largeur de la carte. */
export function MediaGrid({ media, onOpen }: { media: Media[]; onOpen: (index: number) => void }) {
  if (!media.length) return null
  const first = media[0]
  if (first.kind === 'video') {
    return <Video media={first} className="block max-h-[75dvh] w-full" />
  }
  if (media.length === 1) {
    return (
      <div style={{ aspectRatio: ratio(first) }} className="w-full lg:max-h-[620px]">
        <Photo media={first} onClick={() => onOpen(0)} className="h-full w-full" />
      </div>
    )
  }
  if (media.length === 3) {
    return (
      <div className="grid aspect-square w-full grid-cols-2 grid-rows-2 gap-0.5">
        <Photo media={media[0]} onClick={() => onOpen(0)} className="row-span-2 h-full w-full" label="Agrandir la photo 1 sur 3" />
        <Photo media={media[1]} onClick={() => onOpen(1)} className="h-full w-full" label="Agrandir la photo 2 sur 3" />
        <Photo media={media[2]} onClick={() => onOpen(2)} className="h-full w-full" label="Agrandir la photo 3 sur 3" />
      </div>
    )
  }
  return (
    <div className={`grid w-full grid-cols-2 gap-0.5 ${media.length === 2 ? 'aspect-[2/1]' : 'aspect-square'}`}>
      {media.map((m, i) => (
        <Photo key={m.path} media={m} onClick={() => onOpen(i)} className="h-full w-full" label={`Agrandir la photo ${i + 1} sur ${media.length}`} />
      ))}
    </div>
  )
}

/** Une case carrée de la grille d'un profil : la première photo, ou l'image de la vidéo. */
export function MediaThumb({ media, className = '' }: { media: Pick<Media, 'path' | 'kind'>; className?: string }) {
  const url = usePhotoUrl(media.path, 'publications')
  if (media.kind === 'photo') return <Photo media={media} className={className} />
  return (
    <div className={`relative overflow-hidden bg-nuit ${className}`}>
      {url ? <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : null}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-10 place-items-center rounded-full bg-black/55 text-white">
          <Play className="size-5 fill-current" />
        </span>
      </span>
    </div>
  )
}

/** Les photos en grand, sur fond noir. Flèches, balayage et Échap. */
export function Lightbox({ media, start: first, onClose }: { media: Media[]; start: number; onClose: () => void }) {
  const [current, setCurrent] = useState(first)
  const start = useRef<number | null>(null)
  const photos = media.filter((m) => m.kind === 'photo')

  useEffect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setCurrent((c) => Math.min(photos.length - 1, c + 1))
      if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(0, c - 1))
    }
    document.addEventListener('keydown', keys)
    return () => {
      document.body.style.overflow = before
      document.removeEventListener('keydown', keys)
    }
  }, [photos.length, onClose])

  if (!photos.length) return null
  const photo = photos[Math.min(current, photos.length - 1)]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo en grand"
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      onTouchStart={(e) => (start.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (start.current === null) return
        const dx = e.changedTouches[0].clientX - start.current
        start.current = null
        if (dx < -50) setCurrent((c) => Math.min(photos.length - 1, c + 1))
        if (dx > 50) setCurrent((c) => Math.max(0, c - 1))
      }}
    >
      <div className="flex h-16 shrink-0 items-center justify-between px-3 pt-[env(safe-area-inset-top)]">
        <span className="px-2 text-sm font-bold text-white/80">{photos.length > 1 ? `${current + 1} / ${photos.length}` : ''}</span>
        <button type="button" onClick={onClose} aria-label="Fermer" autoFocus className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="size-6" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(env(safe-area-inset-bottom),16px)]" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <LightboxPhoto key={photo.path} path={photo.path} />
        {current > 0 ? (
          <button type="button" onClick={() => setCurrent(current - 1)} aria-label="Photo précédente" className="absolute left-3 hidden size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20 lg:grid">
            <ChevronLeft className="size-7" />
          </button>
        ) : null}
        {current < photos.length - 1 ? (
          <button type="button" onClick={() => setCurrent(current + 1)} aria-label="Photo suivante" className="absolute right-3 hidden size-12 place-items-center rounded-full bg-white/10 hover:bg-white/20 lg:grid">
            <ChevronRight className="size-7" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function LightboxPhoto({ path }: { path: string }) {
  const url = usePhotoUrl(path, 'publications')
  return url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : <span className="size-10 animate-pulse rounded-full bg-white/20" />
}
