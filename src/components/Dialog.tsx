import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/** Feuille qui monte du bas sur téléphone, fenêtre centrée sur ordinateur. */
export function Dialog({ open, onClose, title, description, children, footer, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={`m-0 mt-auto w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-nuit/55 backdrop:backdrop-blur-[2px] open:flex lg:m-auto ${wide ? 'lg:max-w-[640px]' : 'lg:max-w-[480px]'}`}
    >
      {open ? (
        <div className="flex max-h-[calc(88dvh/var(--zoom,1))] w-full flex-col rounded-t-[12px] bg-surface shadow-2xl lg:rounded-[12px]">
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line lg:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4 px-5 pt-4 lg:px-6 lg:pt-6">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id={titleId} className="titre m-0 text-[22px] leading-tight">
                {title}
              </h2>
              {description ? <div className="text-sm leading-[1.45] text-muted">{description}</div> : null}
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink">
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 lg:px-6">{children}</div>
          {footer ? <div className="flex gap-3 border-t border-line-soft px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] lg:px-6 lg:pb-5">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  )
}
