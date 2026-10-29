import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ThumbsUp } from 'lucide-react'
import { TYPE_LABELS } from '../../lib/format'
import { REACTION, REACTIONS, useReactors, type ReactionKind, type ReactionSummary } from '../../lib/feed'
import { Avatar } from '../Avatar'
import { Dialog } from '../Dialog'
import { EmptyState, ErrorNote, Spinner } from '../Feedback'
import { useToast } from '../Toast'

const HINT_KEY = 'aegb.astuceReactions'

function hintOnce(toast: (m: string) => void) {
  try {
    if (localStorage.getItem(HINT_KEY)) return
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    return
  }
  toast("Appuie longtemps sur J'aime pour choisir ta réaction.")
}

type ButtonProps = {
  mine: ReactionKind | null
  onPick: (kind: ReactionKind | null) => void
  /** bar : la barre d'actions d'une publication. text : le petit « J'aime » sous un commentaire. */
  variant?: 'bar' | 'text'
}

/**
 * J'aime d'un appui, les six réactions d'un appui long (ou en survolant sur
 * ordinateur). Pas de « je n'aime pas ».
 */
export function ReactionButton({ mine, onPick, variant = 'bar' }: ButtonProps) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const press = useRef<number | null>(null)
  const hover = useRef<number | null>(null)
  const longPressed = useRef(false)
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  useEffect(
    () => () => {
      if (press.current) clearTimeout(press.current)
      if (hover.current) clearTimeout(hover.current)
    },
    [],
  )

  function stopPress() {
    if (press.current) clearTimeout(press.current)
    press.current = null
  }

  function pick(kind: ReactionKind | null) {
    setOpen(false)
    onPick(kind)
  }

  const current = mine ? REACTION[mine] : null
  const label = current?.label ?? "J'aime"

  const trigger =
    variant === 'bar' ? (
      <span className={`flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-[15px] font-bold hover:bg-surface-2 ${current ? current.tone : 'text-muted'}`}>
        {current ? <span className="text-[19px] leading-none">{current.emoji}</span> : <ThumbsUp className="size-5" />}
        {label}
      </span>
    ) : (
      <span className={`text-[13px] font-bold hover:underline ${current ? current.tone : 'text-muted'}`}>{label}</span>
    )

  return (
    <div
      ref={wrap}
      className={`relative ${variant === 'bar' ? 'flex-1' : ''}`}
      onMouseEnter={() => {
        hover.current = window.setTimeout(() => setOpen(true), 550)
      }}
      onMouseLeave={() => {
        if (hover.current) clearTimeout(hover.current)
        hover.current = window.setTimeout(() => setOpen(false), 350)
      }}
    >
      {open ? (
        <div
          role="menu"
          aria-label="Choisir une réaction"
          className={`absolute bottom-full z-30 mb-2 flex animate-[pop_160ms_ease-out] items-center gap-0.5 rounded-full border border-line-soft bg-surface px-2 py-1.5 shadow-xl ${variant === 'bar' ? 'left-0' : '-left-2'}`}
        >
          {REACTIONS.map((r) => (
            <button
              key={r.kind}
              type="button"
              role="menuitemradio"
              aria-checked={mine === r.kind}
              aria-label={r.label}
              title={r.label}
              onClick={() => pick(mine === r.kind ? null : r.kind)}
              className={`group relative grid size-11 place-items-center rounded-full text-[28px] leading-none transition-transform duration-150 hover:-translate-y-1.5 hover:scale-125 focus-visible:scale-125 ${mine === r.kind ? 'bg-select' : ''}`}
            >
              {r.emoji}
              <span className="pointer-events-none absolute -top-7 hidden rounded-full bg-nuit px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-white group-hover:block">{r.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        aria-pressed={!!mine}
        aria-haspopup="menu"
        aria-label={mine ? `${label}. Appuie pour retirer ta réaction, longtemps pour en choisir une autre.` : "J'aime. Appui long pour choisir une autre réaction."}
        className={`touch-manipulation select-none [-webkit-touch-callout:none] ${variant === 'bar' ? 'w-full' : ''}`}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          longPressed.current = false
          press.current = window.setTimeout(() => {
            longPressed.current = true
            setOpen(true)
            navigator.vibrate?.(8)
          }, 420)
        }}
        onPointerUp={stopPress}
        onPointerLeave={stopPress}
        onPointerCancel={stopPress}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false
            return
          }
          if (hover.current) clearTimeout(hover.current)
          setOpen(false)
          if (mine) pick(null)
          else {
            pick('jaime')
            hintOnce(toast)
          }
        }}
      >
        {trigger}
      </button>
    </div>
  )
}

/** Les trois réactions les plus données, puis le total. Ouvre la liste des personnes. */
export function ReactionCount({ summary, onOpen, compact = false }: { summary: ReactionSummary; onOpen: () => void; compact?: boolean }) {
  if (!summary.total) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${summary.total} réaction${summary.total > 1 ? 's' : ''}. Voir qui a réagi.`}
      className={`flex items-center gap-1.5 text-muted hover:underline ${compact ? 'rounded-full bg-surface px-1.5 py-0.5 text-[12px] shadow-sm ring-1 ring-line-soft' : 'text-[14px]'}`}
    >
      <span className="flex items-center" aria-hidden="true">
        {summary.top.map((k, i) => (
          <span key={k} className={`grid place-items-center rounded-full bg-surface leading-none ${compact ? 'size-[18px] text-[13px]' : 'size-[22px] text-[15px]'} ${i ? '-ml-1' : ''}`}>
            {REACTION[k].emoji}
          </span>
        ))}
      </span>
      <span className="tabular-nums">{summary.total}</span>
    </button>
  )
}

/** Qui a réagi, avec un onglet par réaction. */
export function ReactorsDialog({ target, onClose }: { target: { post?: string; comment?: string } | null; onClose: () => void }) {
  const reactors = useReactors(target)
  const [tab, setTab] = useState<ReactionKind | 'tout'>('tout')
  const list = reactors.data ?? []
  const kinds = REACTIONS.filter((r) => list.some((x) => x.kind === r.kind))
  const shown = tab === 'tout' ? list : list.filter((x) => x.kind === tab)

  return (
    <Dialog open={!!target} onClose={onClose} title="Réactions">
      <div role="tablist" aria-label="Filtrer par réaction" className="-mx-5 flex gap-1.5 overflow-x-auto border-b border-line-soft px-5 pb-3 [scrollbar-width:none] lg:-mx-6 lg:px-6">
        <TabButton active={tab === 'tout'} onClick={() => setTab('tout')}>
          Tout · {list.length}
        </TabButton>
        {kinds.map((r) => (
          <TabButton key={r.kind} active={tab === r.kind} onClick={() => setTab(r.kind)} label={r.label}>
            <span className="text-[16px] leading-none">{r.emoji}</span> {list.filter((x) => x.kind === r.kind).length}
          </TabButton>
        ))}
      </div>
      <ErrorNote error={reactors.error} className="mt-3" />
      {reactors.isPending ? (
        <div className="grid place-items-center py-8">
          <Spinner />
        </div>
      ) : shown.length ? (
        <ul className="m-0 flex list-none flex-col p-0 pt-2">
          {shown.map((r, i) =>
            r.member ? (
              <li key={`${r.member.id}-${i}`}>
                <Link to={`/app/membres/${r.member.id}`} onClick={onClose} className="flex items-center gap-3 rounded-xl px-1 py-2 text-ink no-underline hover:bg-surface-2">
                  <span className="relative">
                    <Avatar person={r.member} size={44} />
                    <span className="absolute -right-1 -bottom-1 grid size-[22px] place-items-center rounded-full bg-surface text-[14px] leading-none shadow-sm">{REACTION[r.kind].emoji}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-bold">
                      {r.member.first_name} {r.member.last_name}
                    </span>
                    <span className="block text-[13px] text-muted">{TYPE_LABELS[r.member.member_type]}</span>
                  </span>
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      ) : (
        <EmptyState title="Aucune réaction pour le moment" />
      )}
    </Dialog>
  )
}

function TabButton({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap ${active ? 'bg-primary text-primary-ink' : 'bg-surface-2 text-ink hover:bg-select'}`}
    >
      {children}
    </button>
  )
}
