import { useRef } from 'react'
import { ImagePlus, LoaderCircle, Play, X } from 'lucide-react'
import { MAX_PHOTOS, MAX_VIDEO_MB, MAX_VIDEO_S, type Attachments } from '../../lib/attachments'

function seconds(s: number) {
  const r = Math.round(s)
  return `0:${String(r).padStart(2, '0')}`
}

/** Les vignettes de ce qui sera publié, avec une croix pour retirer. */
export function AttachmentPreviews({ media, readOnly = false }: { media: Attachments; readOnly?: boolean }) {
  if (!media.list.length && !media.busy) return null
  const single = media.list.length === 1 && !media.busy
  return (
    <div className={`grid gap-2 ${single ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {media.list.map((a, i) => (
        <div key={a.key} className={`relative overflow-hidden rounded-2xl bg-surface-2 ${single ? '' : 'aspect-square'}`}>
          {a.kind === 'video' ? (
            <>
              <video src={a.preview} muted playsInline controls className="max-h-[calc(50dvh/var(--zoom,1))] w-full bg-black object-contain" />
              <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
                <Play className="size-3 fill-current" /> {seconds(a.duration ?? 0)}
              </span>
            </>
          ) : (
            <img src={a.preview} alt={`Photo ${i + 1}`} className={`w-full object-cover ${single ? 'max-h-[calc(50dvh/var(--zoom,1))]' : 'h-full'}`} />
          )}
          {readOnly ? null : (
          <button
            type="button"
            onClick={() => media.remove(a.key)}
            aria-label={a.kind === 'video' ? 'Retirer la vidéo' : `Retirer la photo ${i + 1}`}
            className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-nuit/75 text-white hover:bg-nuit"
          >
            <X className="size-5" />
          </button>
          )}
        </div>
      ))}
      {media.busy ? (
        <div className="grid aspect-square place-items-center rounded-2xl bg-surface-2 text-muted" role="status">
          <LoaderCircle className="size-7 animate-spin" aria-label="Préparation de la photo" />
        </div>
      ) : null}
    </div>
  )
}

/** Le bouton qui ouvre la galerie du téléphone. */
export function AttachButton({ media, variant = 'row' }: { media: Attachments; variant?: 'row' | 'chip' }) {
  const input = useRef<HTMLInputElement>(null)
  const full = media.list.some((a) => a.kind === 'video') || media.list.length >= MAX_PHOTOS
  const picker = (
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
        if (files.length) media.add(files)
      }}
    />
  )
  if (variant === 'chip') {
    return (
      <>
        {picker}
        <button type="button" onClick={() => input.current?.click()} disabled={full || media.busy} className="inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-line bg-surface px-4 text-[15px] font-bold text-ink hover:bg-surface-2 disabled:opacity-50">
          <ImagePlus className="size-5" /> Photo
        </button>
      </>
    )
  }
  return (
    <>
      {picker}
      <button type="button" onClick={() => input.current?.click()} disabled={full || media.busy} className="flex w-full items-center gap-4 rounded-2xl border border-line px-4 py-3.5 text-left hover:bg-surface-2 disabled:opacity-50">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-ok-soft text-ok">
          <ImagePlus className="size-6" />
        </span>
        <span>
          <span className="block text-[16px] font-bold">Photo ou vidéo</span>
          <span className="block text-[13px] text-muted">
            {MAX_PHOTOS} photos, ou une vidéo de {MAX_VIDEO_S} secondes ({MAX_VIDEO_MB} Mo au plus)
          </span>
        </span>
      </button>
    </>
  )
}
