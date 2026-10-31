import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Ban, BellRing, CalendarDays, ChevronDown, ChevronRight, CircleCheck, CircleX, Clock, EyeOff, Lock, MapPin, Megaphone, Pause, Play, Sparkles, UserPlus, Vote } from 'lucide-react'
import { capitalize, day, dayMonth, dayYear, hour } from '../../lib/elections'
import { REACTION, usePost } from '../../lib/feed'
import { clock, duration, fileBadge, fileSize, type MessageFile, type MessageRow } from '../../lib/messages'
import { frenchSpaces } from '../../lib/format'
import { usePhotoUrl } from '../../lib/photos'
import { Avatar } from '../Avatar'
import { Logo } from '../Logo'
import { OfficialBadge } from '../feed/PostCard'
import { Lightbox, MediaThumb } from '../feed/Media'

/* ----------------------------------------------------------------------------
   Fichiers
---------------------------------------------------------------------------- */

function Photo({ file, onClick, className = '' }: { file: MessageFile; onClick: () => void; className?: string }) {
  const url = usePhotoUrl(file.path, 'messages')
  return (
    <button type="button" onClick={onClick} aria-label="Agrandir la photo" className={`block overflow-hidden bg-surface-2 ${className}`}>
      {url ? <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse bg-surface-2" />}
    </button>
  )
}

function Photos({ files }: { files: MessageFile[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const first = files[0]
  const lightbox = open !== null ? <Lightbox media={files.map((f) => ({ path: f.path, kind: 'photo' }))} start={open} onClose={() => setOpen(null)} bucket="messages" /> : null
  if (files.length === 1) {
    const ratio = first.width && first.height ? Math.min(1.6, Math.max(0.75, first.width / first.height)) : 4 / 3
    return (
      <>
        <div className="w-[260px] max-w-full overflow-hidden rounded-[14px]" style={{ aspectRatio: ratio }}>
          <Photo file={first} onClick={() => setOpen(0)} className="h-full w-full" />
        </div>
        {lightbox}
      </>
    )
  }
  const shown = files.slice(0, 4)
  return (
    <>
      <div className="grid w-[260px] max-w-full grid-cols-2 gap-0.5 overflow-hidden rounded-[14px]">
        {shown.map((f, i) => (
          <div key={f.path} className="relative aspect-square">
            <Photo file={f} onClick={() => setOpen(i)} className="h-full w-full" />
            {i === 3 && files.length > 4 ? (
              <button type="button" onClick={() => setOpen(3)} className="absolute inset-0 grid place-items-center bg-nuit/55 text-[22px] font-extrabold text-white">
                +{files.length - 4}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {lightbox}
    </>
  )
}

/** Des barres qui imitent la forme du son, toujours les mêmes pour un même vocal. */
function bars(seed: string, n = 28): number[] {
  let h = 7
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Array.from({ length: n }, (_, i) => {
    h = (h * 1103515245 + 12345) | 0
    const base = 0.35 + (Math.abs(h) % 1000) / 1600
    return Math.min(1, base * (i % 5 === 2 ? 1.25 : 1))
  })
}

export function Waveform({ seed, progress, mine }: { seed: string; progress: number; mine: boolean }) {
  const list = bars(seed)
  return (
    <span className="flex h-7 min-w-0 flex-1 items-center justify-between gap-[2px] overflow-hidden" aria-hidden="true">
      {list.map((v, i) => {
        const played = i / list.length < progress
        const tone = mine ? (played ? 'bg-safran' : 'bg-white/45') : played ? 'bg-primary' : 'bg-line'
        return <span key={i} className={`w-[3px] shrink-0 rounded-full ${tone}`} style={{ height: `${Math.round(v * 100)}%` }} />
      })}
    </span>
  )
}

/** Un vocal : lecture, avancée, durée. */
export function VoicePlayer({ file, mine = false, className = '' }: { file: Pick<MessageFile, 'path' | 'duration'>; mine?: boolean; className?: string }) {
  const url = usePhotoUrl(file.path, 'messages')
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const total = file.duration ?? 0

  useEffect(() => {
    const el = audio.current
    if (!el) return
    const time = () => setCurrent(el.currentTime)
    const end = () => {
      setPlaying(false)
      setCurrent(0)
    }
    const pause = () => setPlaying(false)
    const play = () => setPlaying(true)
    el.addEventListener('timeupdate', time)
    el.addEventListener('ended', end)
    el.addEventListener('pause', pause)
    el.addEventListener('play', play)
    return () => {
      el.removeEventListener('timeupdate', time)
      el.removeEventListener('ended', end)
      el.removeEventListener('pause', pause)
      el.removeEventListener('play', play)
    }
  }, [url])

  function toggle() {
    const el = audio.current
    if (!el) return
    if (el.paused) {
      // Un seul vocal à la fois.
      document.querySelectorAll('audio').forEach((a) => a !== el && a.pause())
      el.play().catch(() => setPlaying(false))
    } else el.pause()
  }

  return (
    <span className={`flex w-[250px] max-w-full items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? 'Mettre en pause' : 'Écouter le vocal'}
        className={`grid size-10 shrink-0 place-items-center rounded-full disabled:opacity-50 ${mine ? 'bg-white text-leppi' : 'bg-primary text-primary-ink'}`}
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </button>
      <Waveform seed={file.path} progress={total ? current / total : 0} mine={mine} />
      <span className={`w-9 shrink-0 text-right text-[12px] font-bold tabular-nums ${mine ? 'text-white' : 'text-ink'}`}>{duration(playing || current ? current : total)}</span>
      {url ? <audio ref={audio} src={url} preload="none" className="hidden" /> : null}
    </span>
  )
}

export function DocumentChip({ file, mine = false }: { file: MessageFile; mine?: boolean }) {
  const url = usePhotoUrl(file.path, 'messages')
  const size = fileSize(file.size)
  const body = (
    <>
      <span className={`flex h-12 w-10 shrink-0 items-end justify-center rounded-md pb-1 text-[10px] font-extrabold ${mine ? 'bg-white/90 text-danger' : 'bg-danger-soft text-danger'}`}>{fileBadge(file.name)}</span>
      <span className="min-w-0 flex-1">
        <span className={`line-clamp-2 block text-[14px] leading-snug font-bold break-words ${mine ? 'text-white' : 'text-ink'}`}>{file.name ?? 'Document'}</span>
        {size ? <span className={`block text-[12px] ${mine ? 'text-white/75' : 'text-muted'}`}>{size}</span> : null}
      </span>
    </>
  )
  const cls = `flex w-[250px] max-w-full items-center gap-3 rounded-[12px] p-2 no-underline ${mine ? 'bg-white/10' : 'bg-surface-2'}`
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" download={file.name ?? undefined} className={cls} aria-label={`Ouvrir ${file.name ?? 'le document'}`}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  )
}

/** Une publication partagée : seuls ceux qui ont le droit de la voir l'ouvrent. */
function SharedPost({ id, mine }: { id: string; mine: boolean }) {
  const post = usePost(id)
  const p = post.data
  const cls = `flex w-[260px] max-w-full gap-3 rounded-[12px] p-2.5 no-underline ${mine ? 'bg-white/10 text-white' : 'bg-surface-2 text-ink'}`
  if (post.isPending) return <span className={`${cls} h-16 animate-pulse`} />
  if (!p) return <span className={`${cls} text-[13px] italic opacity-80`}>Publication indisponible</span>
  const media = p.post_media[0]
  const author = p.official ? "Bureau de l'AEGB" : p.author ? `${p.author.first_name} ${p.author.last_name}` : 'Ancien membre'
  return (
    <Link to={`/app/fil/${p.id}`} className={cls}>
      <span className="min-w-0 flex-1">
        <span className={`block text-[12px] font-bold ${mine ? 'text-safran' : 'text-link'}`}>Publication de {author}</span>
        <span className="line-clamp-3 block text-[13px] leading-snug">{p.title ?? p.body ?? (media ? 'Photo' : '')}</span>
      </span>
      {media ? <MediaThumb media={media} className="size-14 shrink-0 rounded-lg" /> : null}
    </Link>
  )
}

/* ----------------------------------------------------------------------------
   Bulles
---------------------------------------------------------------------------- */

function ReplyQuote({ m, mine, onJump }: { m: MessageRow; mine: boolean; onJump: (id: string) => void }) {
  const r = m.reply!
  return (
    <button
      type="button"
      onClick={() => onJump(r.id)}
      className={`mb-1.5 block w-full rounded-[10px] border-l-[3px] px-2.5 py-1.5 text-left ${mine ? 'border-safran bg-white/10' : 'border-primary bg-surface-2'}`}
    >
      <span className={`block text-[12px] font-bold ${mine ? 'text-safran' : 'text-link'}`}>{!r.as_aegb && !r.sender_id ? 'Ancien membre' : r.sender_name}</span>
      <span className={`block truncate text-[13px] ${mine ? 'text-white/80' : 'text-muted'}`}>{r.excerpt ?? 'Message supprimé'}</span>
    </button>
  )
}

function Reactions({ m, mine, uid, onOpen }: { m: MessageRow; mine: boolean; uid: string | undefined; onOpen: () => void }) {
  if (!m.reactions.length) return null
  const counts = new Map<string, number>()
  for (const r of m.reactions) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const minePicked = m.reactions.some((r) => r.member_id === uid)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${m.reactions.length} réaction${m.reactions.length > 1 ? 's' : ''}`}
      className={`-mt-2 flex h-6 items-center gap-0.5 rounded-full border border-line-soft bg-surface px-1.5 text-[12px] font-bold text-muted shadow-sm ${mine ? 'mr-2 self-end' : 'ml-2 self-start'} ${minePicked ? 'ring-1 ring-safran' : ''}`}
    >
      {top.map(([kind]) => (
        <span key={kind} aria-hidden="true">
          {REACTION[kind as keyof typeof REACTION].emoji}
        </span>
      ))}
      {m.reactions.length > 1 ? <span className="ml-0.5">{m.reactions.length}</span> : null}
    </button>
  )
}

/** Appui long sur téléphone, clic droit ou petite flèche sur ordinateur. */
function usePress(onLong: () => void) {
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }
  useEffect(() => cancel, [])
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = window.setTimeout(() => {
        timer.current = null
        navigator.vibrate?.(15)
        onLong()
      }, 450)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      cancel()
      onLong()
    },
  }
}

type BubbleProps = {
  m: MessageRow
  uid: string | undefined
  /** Le bureau lit une conversation AEGB : les réponses d'AEGB sont « les miennes ». */
  staffView: boolean
  group: boolean
  /** Premier message d'une suite du même auteur : son nom et sa photo s'affichent. */
  first: boolean
  status?: { text: string; seen: boolean } | null
  highlighted?: boolean
  pending?: boolean
  onActions?: (m: MessageRow) => void
  onJump: (id: string) => void
}

export function Bubble({ m, uid, staffView, group, first, status, highlighted = false, pending = false, onActions, onJump }: BubbleProps) {
  const mine = staffView ? m.as_aegb : !m.as_aegb && m.sender_id === uid
  const press = usePress(() => onActions?.(m))
  const canAct = !!onActions && !m.deleted && !pending
  const photos = m.files.filter((f) => f.kind === 'photo')
  const voice = m.files.find((f) => f.kind === 'vocal')
  const doc = m.files.find((f) => f.kind === 'document')
  const showName = group && !mine && first && !m.as_aegb
  const masked = m.hidden && m.body === null && !m.files.length
  const aegbLabel = m.as_aegb && (staffView || group)
  // Une photo seule remplit la bulle, l'heure passe dessus.
  const photoOnly = !m.deleted && !masked && photos.length > 0 && !m.body && !m.reply && !m.hidden && !voice && !doc && !m.post_id && !showName && !aegbLabel

  let content: ReactNode
  if (m.deleted) {
    content = (
      <span className="flex items-center gap-2 text-[14px] text-muted italic">
        <Ban className="size-4 shrink-0" /> Message supprimé
      </span>
    )
  } else if (masked) {
    content = (
      <span className="flex items-center gap-2 text-[14px] text-muted italic">
        <EyeOff className="size-4 shrink-0" /> Message masqué par le bureau
      </span>
    )
  } else {
    content = (
      <>
        {m.reply ? <ReplyQuote m={m} mine={mine} onJump={onJump} /> : null}
        {photos.length ? <Photos files={photos} /> : null}
        {voice ? <VoicePlayer file={voice} mine={mine} /> : null}
        {doc ? <DocumentChip file={doc} mine={mine} /> : null}
        {m.post_id ? <SharedPost id={m.post_id} mine={mine} /> : null}
        {m.body ? <p className={`m-0 text-[15px] leading-[1.45] break-words whitespace-pre-line ${photos.length || voice || doc || m.post_id ? 'mt-1.5' : ''}`}>{frenchSpaces(m.body)}</p> : null}
      </>
    )
  }

  const plainBox = m.deleted || masked
  const tone = plainBox
    ? 'border border-line bg-transparent'
    : mine
      ? 'bg-primary text-primary-ink'
      : 'bg-surface text-ink shadow-[0_1px_1px_rgba(18,22,43,0.06)]'

  return (
    <div id={`msg-${m.id}`} className={`flex items-end gap-2 ${mine ? 'justify-end pl-10' : 'pr-10'} ${first ? 'mt-2.5' : 'mt-1'}`}>
      {group && !mine ? (
        <span className="w-8 shrink-0 self-start">
          {first && !m.as_aegb ? <Avatar person={{ id: m.sender_id ?? undefined, first_name: m.sender_first_name ?? '?', last_name: m.sender_last_name ?? '', avatar_path: m.sender_avatar_path }} size={32} /> : null}
          {first && m.as_aegb ? <Logo size={32} /> : null}
        </span>
      ) : null}
      <div className={`group relative flex max-w-[min(100%,520px)] min-w-0 flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {staffView && mine && m.written_by_name ? (
          <span className="mb-1 flex items-center gap-1 text-[12px] text-muted">
            <Lock className="size-3" /> Répondu par {m.written_by_name}, visible par le bureau seulement
          </span>
        ) : null}
        <div
          {...(canAct ? press : {})}
          className={`relative max-w-full min-w-0 rounded-[18px] transition ${photoOnly ? 'p-1' : 'px-3.5 py-2.5'} ${tone} ${mine ? 'rounded-br-[6px]' : 'rounded-bl-[6px]'} ${highlighted ? 'ring-[3px] ring-safran' : ''} ${pending ? 'opacity-70' : ''} select-none [-webkit-touch-callout:none] lg:select-text`}
        >
          {showName ? <span className="mb-0.5 block text-[13px] font-bold text-link">{m.sender_first_name ? `${m.sender_first_name} ${m.sender_last_name ?? ''}`.trim() : 'Ancien membre'}</span> : null}
          {aegbLabel ? (
            <span className={`mb-0.5 flex items-center gap-1.5 text-[12px] font-extrabold ${mine ? 'text-safran' : 'text-link'}`}>AEGB {group ? <OfficialBadge /> : null}</span>
          ) : null}
          {m.hidden && !masked ? (
            <span className={`mb-1.5 flex items-start gap-1.5 rounded-lg px-2 py-1 text-[12px] ${mine ? 'bg-white/12 text-white' : 'bg-danger-soft text-ink'}`}>
              <EyeOff className="mt-px size-3.5 shrink-0" />
              <span>
                <strong>Masqué par le bureau</strong>
                {m.hidden_reason ? ` · ${m.hidden_reason}` : ''}. Personne d’autre ne le voit.
              </span>
            </span>
          ) : null}
          {content}
          {photoOnly ? (
            <span className="pointer-events-none absolute right-3 bottom-2.5 rounded-full bg-nuit/55 px-1.5 py-0.5 text-[11px] text-white">{pending ? 'Envoi…' : clock(m.created_at)}</span>
          ) : (
            <span className={`mt-1 block text-right text-[11px] ${mine && !plainBox ? 'text-white/70' : 'text-muted'}`}>{pending ? 'Envoi…' : clock(m.created_at)}</span>
          )}
          {canAct ? (
            <button
              type="button"
              onClick={() => onActions?.(m)}
              aria-label="Actions sur le message"
              className={`absolute top-1 hidden size-7 place-items-center rounded-full bg-surface text-muted shadow group-hover:grid focus-visible:grid ${mine ? '-left-9' : '-right-9'}`}
            >
              <ChevronDown className="size-4" />
            </button>
          ) : null}
        </div>
        <Reactions m={m} mine={mine} uid={uid} onOpen={() => onActions?.(m)} />
        {status ? <span className={`mt-0.5 mr-1 text-[12px] font-bold ${status.seen ? 'text-ink' : 'text-muted'}`}>{status.text}</span> : null}
      </div>
    </div>
  )
}

/** « Awa a créé le groupe », « Moussa a quitté le groupe ». */
export function SystemLine({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <p className="mx-auto my-2 flex max-w-[90%] items-center justify-center gap-1.5 text-center text-[12px] font-semibold text-muted">
      {icon}
      <span>{children}</span>
    </p>
  )
}

export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-line-soft px-3 py-1 text-[12px] font-bold text-muted">{label}</span>
    </div>
  )
}

/** L'arrivée d'un membre, annoncée par AEGB dans le grand groupe. */
export function ArrivalCard({ m, uid, onHello }: { m: MessageRow; uid: string | undefined; onHello: (member: string) => void }) {
  const member = m.meta.member
  return (
    <div className="mt-3 flex items-end gap-2 pr-10">
      <span className="w-8 shrink-0 self-start">
        <Logo size={32} />
      </span>
      <div className="max-w-[min(100%,520px)] rounded-[18px] rounded-bl-[6px] border-[1.5px] border-safran bg-surface px-3.5 py-2.5">
        <span className="mb-1 flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
          AEGB <OfficialBadge />
        </span>
        <p className="m-0 text-[15px] leading-[1.45]">{frenchSpaces(m.body ?? '')}</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          {member && member !== uid ? (
            <button type="button" onClick={() => onHello(member)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-safran-pale px-3.5 text-[13px] font-bold text-[#6B4A00] hover:brightness-97">
              <UserPlus className="size-4" /> Dire bonjour
            </button>
          ) : (
            <span />
          )}
          <span className="text-[11px] text-muted">{clock(m.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

/** Le message de bienvenue côté membre : un paragraphe par bulle, puis les boutons. */
export function WelcomeMessage({ m, actions }: { m: MessageRow; actions: { label: string; to: string }[] }) {
  const paragraphs = (m.body ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <div className="mt-2.5 flex flex-col items-start gap-1.5 pr-10">
      {m.meta.essai ? (
        <span className="flex items-center gap-1 text-[12px] font-bold text-muted">
          <Sparkles className="size-3.5" /> Message d’essai
        </span>
      ) : null}
      {paragraphs.map((p, i) => (
        <div key={i} className="max-w-[min(100%,520px)] rounded-[18px] rounded-bl-[6px] bg-surface px-3.5 py-2.5 shadow-[0_1px_1px_rgba(18,22,43,0.06)]">
          <p className="m-0 text-[15px] leading-[1.45] whitespace-pre-line">{frenchSpaces(p)}</p>
          {i === paragraphs.length - 1 ? <span className="mt-1 block text-right text-[11px] text-muted">{clock(m.created_at)}</span> : null}
        </div>
      ))}
      {actions.length ? (
        <div className="flex w-full max-w-[300px] flex-col gap-1.5">
          {actions.map((a) => (
            <Link key={a.to} to={a.to} className="flex h-11 items-center justify-center rounded-[14px] border-[1.5px] border-primary bg-surface text-[15px] font-bold text-ink no-underline hover:bg-surface-2">
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const DUES_CARDS = {
  relance: { title: 'Rappel de cotisation', icon: <BellRing className="size-4" />, tone: 'bg-safran-pale text-[#6B4A00]' },
  recu: { title: 'Paiement reçu, merci !', icon: <CircleCheck className="size-4" />, tone: 'bg-ok-soft text-ok' },
  annule: { title: 'Paiement annulé', icon: <CircleX className="size-4" />, tone: 'bg-danger-soft text-danger' },
}

/** Les cartes de cotisation du compte AEGB : rappel, paiement reçu, paiement annulé. */
export function DuesCard({ m, staffView }: { m: MessageRow; staffView: boolean }) {
  const kind = DUES_CARDS[(m.meta.type ?? 'recu') as keyof typeof DUES_CARDS] ?? DUES_CARDS.recu
  const amount = m.meta.amount_cents != null ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(m.meta.amount_cents / 100) : null
  return (
    <div className={`mt-2.5 flex flex-col gap-1.5 ${staffView ? 'items-end pl-10' : 'items-start pr-10'}`}>
      <div className={`flex w-full max-w-[340px] flex-col gap-2.5 rounded-[18px] bg-surface px-3.5 py-3 shadow-[0_1px_1px_rgba(18,22,43,0.06)] ${staffView ? 'rounded-br-[6px]' : 'rounded-bl-[6px]'}`}>
        <span className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-extrabold ${kind.tone}`}>
          {kind.icon}
          {frenchSpaces(kind.title)}
        </span>
        <p className="m-0 text-[15px] leading-[1.45]">{frenchSpaces(m.body ?? '')}</p>
        {m.meta.type === 'relance' && !staffView ? (
          <Link to="/app/cotisation/payer" className="flex h-11 items-center justify-center rounded-[14px] bg-primary text-[15px] font-bold text-primary-ink no-underline">
            Payer{amount ? ` ${amount}` : ''}
          </Link>
        ) : null}
        {m.meta.type === 'recu' && m.meta.receipt ? (
          <Link to={`/app/cotisation/quittances/${m.meta.receipt}`} className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-line-soft px-3 py-2.5 text-ink no-underline hover:bg-surface-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-select text-[10px] font-extrabold text-link">PDF</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Quittance n° {m.meta.receipt}</span>
              <span className="block text-xs text-muted">Touche pour l'ouvrir</span>
            </span>
          </Link>
        ) : null}
        <span className="block text-right text-[11px] text-muted">{clock(m.created_at)}</span>
      </div>
      {m.meta.type === 'relance' && !staffView ? <p className="m-0 max-w-[340px] text-[12px] text-muted">Une difficulté pour payer ? Réponds ici, le bureau te répondra.</p> : null}
    </div>
  )
}

const ASSEMBLY_CARDS = {
  convocation: { title: 'Convocation à l’AG', icon: <Megaphone className="size-5" />, tone: 'text-ink' },
  seconde: { title: 'Convocation à la seconde AG', icon: <Megaphone className="size-5" />, tone: 'text-ink' },
  ouverture: { title: 'Le vote est ouvert', icon: <Vote className="size-5" />, tone: 'text-ok' },
  second_tour: { title: 'Second tour ouvert', icon: <Vote className="size-5" />, tone: 'text-ok' },
  relance: { title: 'Tu n’as pas encore voté', icon: <BellRing className="size-5" />, tone: 'text-[#6B4A00]' },
  annulation: { title: 'AG annulée', icon: <CircleX className="size-5" />, tone: 'text-danger' },
  candidature_validee: { title: 'Candidature validée', icon: <CircleCheck className="size-5" />, tone: 'text-ok' },
  candidature_refusee: { title: 'Candidature refusée', icon: <CircleX className="size-5" />, tone: 'text-danger' },
  candidature_retiree: { title: 'Candidature retirée', icon: <CircleX className="size-5" />, tone: 'text-danger' },
}

/** Les cartes de l'assemblée générale du compte AEGB : convocation, ouverture du vote, relance, candidature… */
export function AssemblyCard({ m, staffView }: { m: MessageRow; staffView: boolean }) {
  const type = (m.meta.type ?? 'convocation') as keyof typeof ASSEMBLY_CARDS
  const card = ASSEMBLY_CARDS[type] ?? ASSEMBLY_CARDS.convocation
  const meta = m.meta
  const convocation = (type === 'convocation' || type === 'seconde') && meta.held_at && meta.vote_opens_at && meta.vote_closes_at
  const vote = type === 'ouverture' || type === 'second_tour' || type === 'relance'
  return (
    <div className={`mt-2.5 flex flex-col gap-1.5 ${staffView ? 'items-end pl-10' : 'items-start pr-10'}`}>
      <div className={`flex w-full max-w-[400px] flex-col gap-3 rounded-[18px] bg-surface px-4 py-3.5 shadow-[0_1px_1px_rgba(18,22,43,0.06)] ${staffView ? 'rounded-br-[6px]' : 'rounded-bl-[6px]'}`}>
        <span className={`flex items-center gap-2 text-[17px] font-extrabold ${card.tone}`}>
          {card.icon}
          {frenchSpaces(card.title)}
        </span>
        {convocation ? (
          <>
            <p className="m-0 text-[15px] leading-[1.5]">
              Bonjour {meta.first_name ? <strong>{meta.first_name}</strong> : null}
              {type === 'seconde'
                ? frenchSpaces(`, la première AG n’a pas réuni assez de votants. Le bureau te convoque à une seconde assemblée générale ${meta.kind ?? ''}, avec le même ordre du jour.`)
                : frenchSpaces(`, le bureau te convoque à l’assemblée générale ${meta.kind ?? ''} de l’AEGB.`)}
            </p>
            <div className="flex flex-col gap-2 rounded-[14px] bg-surface-2 px-3.5 py-3 text-[15px]">
              <span className="flex items-start gap-2.5">
                <CalendarDays className="mt-0.5 size-[18px] shrink-0" />
                <strong>
                  {capitalize(dayYear(meta.held_at!))}, {hour(meta.held_at!)}
                </strong>
              </span>
              {meta.place ? (
                <span className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-[18px] shrink-0" />
                  {meta.place}
                </span>
              ) : null}
              <span className="flex items-start gap-2.5">
                <Vote className="mt-0.5 size-[18px] shrink-0" />
                Vote dans l’appli de {hour(meta.vote_opens_at!)} à {hour(meta.vote_closes_at!)}, en salle ou à distance
              </span>
            </div>
            {meta.items?.length ? (
              <div className="flex flex-col gap-1">
                <strong className="text-[15px]">Ordre du jour</strong>
                <ol className="m-0 flex list-decimal flex-col gap-0.5 pl-6 text-[15px] leading-[1.45]">
                  {meta.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ol>
              </div>
            ) : null}
            {meta.candidacy_until && type === 'convocation' ? (
              <p className="m-0 text-sm text-muted">Candidatures au bureau jusqu’au {dayMonth(meta.candidacy_until)}, dans l’appli.</p>
            ) : null}
          </>
        ) : (
          <p className="m-0 text-[15px] leading-[1.5]">{frenchSpaces(m.body ?? '')}</p>
        )}
        {staffView ? null : vote ? (
          <Link to="/app/votes/isoloir" className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-safran text-[16px] font-extrabold text-nuit no-underline hover:brightness-105">
            <Vote className="size-5" /> Voter
          </Link>
        ) : type !== 'annulation' ? (
          <Link to="/app/votes" className="flex h-11 items-center justify-center rounded-[14px] bg-primary text-[15px] font-bold text-primary-ink no-underline">
            Voir l’assemblée générale
          </Link>
        ) : null}
        <span className="block text-right text-[11px] text-muted">{clock(m.created_at)}</span>
      </div>
    </div>
  )
}

const EVENT_CARDS = {
  place: { title: 'Une place s’est libérée', icon: <CircleCheck className="size-[18px]" />, tone: 'text-ok' },
  rappel: { title: 'C’est demain !', icon: <CalendarDays className="size-[18px]" />, tone: 'text-[#6B5200]' },
  changement: { title: 'Changement', icon: <Clock className="size-[18px]" />, tone: 'text-link' },
  annulation: { title: 'Événement annulé', icon: <CircleX className="size-[18px]" />, tone: 'text-danger' },
  paiement: { title: 'Paiement reçu, merci !', icon: <CircleCheck className="size-[18px]" />, tone: 'text-ok' },
  desinscription: { title: 'Désinscription', icon: <CalendarDays className="size-[18px]" />, tone: 'text-ink' },
  rembourse: { title: 'Place remboursée', icon: <CircleCheck className="size-[18px]" />, tone: 'text-ok' },
  paiement_annule: { title: 'Paiement annulé', icon: <CircleX className="size-[18px]" />, tone: 'text-danger' },
}

function changeTitle(changes: { label: string }[] | undefined): string {
  const labels = (changes ?? []).map((c) => c.label)
  if (labels.length === 1 && labels[0] === 'Quand') return 'Nouvel horaire'
  if (labels.length === 1 && labels[0] === 'Où') return 'Nouveau lieu'
  return 'Nouvel horaire et nouveau lieu'
}

/** Les cartes « événement » du compte AEGB : place libérée, rappel de la veille, changement, annulation, paiement. */
export function EventMessageCard({ m, staffView }: { m: MessageRow; staffView: boolean }) {
  const type = (m.meta.type ?? 'rappel') as keyof typeof EVENT_CARDS
  const card = EVENT_CARDS[type] ?? EVENT_CARDS.rappel
  const meta = m.meta
  const title = type === 'changement' ? changeTitle(meta.changes) : card.title
  const to = meta.event ? `/app/evenements/${meta.event}` : '/app/evenements'
  const open = meta.event && !staffView && type !== 'annulation'
  return (
    <div className={`mt-2.5 flex flex-col gap-1.5 ${staffView ? 'items-end pl-10' : 'items-start pr-10'}`}>
      <div className={`flex w-full max-w-[340px] flex-col gap-2.5 rounded-[18px] bg-surface px-3.5 py-3 shadow-[0_1px_1px_rgba(18,22,43,0.06)] ${staffView ? 'rounded-br-[6px]' : 'rounded-bl-[6px]'}`}>
        <span className={`flex items-center gap-2 text-[15px] font-extrabold ${card.tone}`}>
          {card.icon}
          {frenchSpaces(title)}
        </span>
        <p className="m-0 text-[14px] leading-[1.45]">{frenchSpaces(m.body ?? '')}</p>
        {type === 'changement' && meta.changes?.length ? (
          <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-2.5 text-[13px]">
            {meta.changes.map((c) => (
              <span key={c.label} className="flex flex-col gap-1">
                <span className="text-muted line-through">{c.before}</span>
                <span className="flex items-center gap-1.5 font-extrabold">
                  <ChevronRight className="size-3.5" strokeWidth={2.6} />
                  {c.after}
                </span>
              </span>
            ))}
          </div>
        ) : null}
        {type === 'rappel' && meta.starts_at ? (
          <div className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-2.5 text-[13px] leading-[1.35]">
            <span className="flex items-start gap-2">
              <Clock className="mt-px size-4 shrink-0 text-leppi" />
              <strong>
                {capitalize(day(meta.starts_at))}, {hour(meta.starts_at)}
                {meta.ends_at ? ` à ${hour(meta.ends_at)}` : ''}
              </strong>
            </span>
            <span className="flex items-start gap-2">
              <MapPin className="mt-px size-4 shrink-0 text-leppi" />
              {meta.online ? 'En ligne : le lien est sur la page de l’événement' : meta.place}
            </span>
          </div>
        ) : null}
        {type === 'rappel' && meta.place && !meta.online && !staffView ? (
          <a
            href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(meta.place)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[42px] items-center justify-center gap-2 rounded-[14px] bg-safran text-[14px] font-bold text-nuit no-underline"
          >
            <MapPin className="size-4" /> Voir le plan
          </a>
        ) : null}
        {open ? (
          <Link to={to} className="self-center text-[13px] font-bold text-leppi">
            {type === 'rappel' ? 'Je ne peux plus venir' : 'Voir l’événement'}
          </Link>
        ) : null}
        <span className="block text-right text-[11px] text-muted">{clock(m.created_at)}</span>
      </div>
    </div>
  )
}
