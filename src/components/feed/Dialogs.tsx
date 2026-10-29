import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { errorMessage } from '../../lib/errors'
import { orNull, REPORT_REASONS, type ReportReason } from '../../lib/feed'
import { supabase } from '../../lib/supabase'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { ErrorNote } from '../Feedback'
import { TextArea } from '../Field'
import { useToast } from '../Toast'

export type Target = { post?: string; comment?: string }

/** Une liste d'actions, en feuille sur téléphone. */
export function ActionSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="-mx-2 flex flex-col pb-2">{children}</div>
    </Dialog>
  )
}

export function SheetAction({ icon, children, onClick, danger = false, hint }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; hint?: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-13 items-center gap-3.5 rounded-xl px-2 py-2 text-left hover:bg-surface-2 ${danger ? 'text-danger' : 'text-ink'}`}>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${danger ? 'bg-danger-soft' : 'bg-select'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">{children}</span>
        {hint ? <span className="block text-[13px] text-muted">{hint}</span> : null}
      </span>
    </button>
  )
}

/** Les motifs, en boutons radio larges, comme dans la maquette. */
function ReasonPicker({ value, onChange, name }: { value: ReportReason | null; onChange: (r: ReportReason) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label="Motif" className="flex flex-col gap-1">
      {REPORT_REASONS.map((r) => {
        const active = value === r.value
        return (
          <label key={r.value} className={`flex min-h-13 cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 text-[16px] font-semibold ${active ? 'bg-select font-bold' : 'hover:bg-surface-2'}`}>
            {r.label}
            <input type="radio" name={name} value={r.value} checked={active} onChange={() => onChange(r.value)} className="peer sr-only" />
            <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 peer-focus-visible:ring-[3px] peer-focus-visible:ring-safran/60 ${active ? 'border-primary bg-primary' : 'border-line'}`} aria-hidden="true">
              {active ? <span className="size-2.5 rounded-full bg-primary-ink" /> : null}
            </span>
          </label>
        )
      })}
    </div>
  )
}

/** Signaler : le bureau voit le nombre et les motifs, jamais qui a signalé. */
export function ReportDialog({ target, firstName, onClose }: { target: Target | null; firstName: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const toast = useToast()
  const what = target?.comment ? 'ce commentaire' : 'cette publication'

  function close() {
    setReason(null)
    setError(null)
    onClose()
  }

  async function send() {
    if (!target || !reason) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('report_content', { p_post: orNull(target.post), p_comment: orNull(target.comment), p_reason: reason })
    setBusy(false)
    if (error) return setError(error)
    close()
    toast(data ? 'Merci. Le bureau va regarder.' : 'Tu l’avais déjà signalé. Le bureau va regarder.')
  }

  return (
    <Dialog
      open={!!target}
      onClose={close}
      title={`Signaler ${what}`}
      description={`Le bureau examine chaque signalement. ${firstName} ne saura pas que c'est toi.`}
      footer={
        <Button onClick={send} busy={busy} disabled={!reason} className="w-full">
          Envoyer le signalement
        </Button>
      }
    >
      <ReasonPicker value={reason} onChange={setReason} name="signalement" />
      <ErrorNote error={error} className="mt-3" />
    </Dialog>
  )
}

/** Masquer, pour le bureau : avec ou sans signalement, et avec un avertissement si besoin. */
export function HideDialog({
  target,
  firstName,
  initialReason = null,
  warn: initialWarn = false,
  canWarn = true,
  onClose,
  onDone,
}: {
  target: Target | null
  firstName: string
  initialReason?: ReportReason | null
  warn?: boolean
  canWarn?: boolean
  onClose: () => void
  onDone?: () => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(initialReason)
  const [warn, setWarn] = useState(initialWarn)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const toast = useToast()
  const queryClient = useQueryClient()
  const post = !target?.comment

  async function send() {
    if (!target || !reason) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('moderate', {
      p_post: orNull(target.post),
      p_comment: orNull(target.comment),
      p_decision: warn ? 'masquer_avertir' : 'masquer',
      p_reason: reason,
    })
    setBusy(false)
    if (error) return setError(error)
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['fil'] }), queryClient.invalidateQueries({ queryKey: ['bureau'] })])
    onClose()
    onDone?.()
    toast(warn ? `Masqué, et ${firstName} a reçu un avertissement.` : 'Masqué. Le bureau garde une trace au journal.')
  }

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={post ? 'Masquer cette publication' : 'Masquer ce commentaire'}
      description={`Plus personne ne le voit, sauf ${firstName}, avec le motif. La décision va au journal.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button variant="danger" onClick={send} busy={busy} disabled={!reason} className="flex-1">
            Masquer
          </Button>
        </>
      }
    >
      <ReasonPicker value={reason} onChange={setReason} name="masquer" />
      {canWarn ? (
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-line-soft px-4 py-3">
          <input type="checkbox" checked={warn} onChange={(e) => setWarn(e.target.checked)} className="peer sr-only" />
          <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 peer-focus-visible:ring-[3px] peer-focus-visible:ring-safran/60 ${warn ? 'border-primary bg-primary text-primary-ink' : 'border-line'}`} aria-hidden="true">
            {warn ? <Check className="size-4" strokeWidth={3} /> : null}
          </span>
          <span>
            <span className="block text-[15px] font-bold">Avertir aussi {firstName}</span>
            <span className="block text-[13px] text-muted">L’avertissement s’ajoute à sa fiche.</span>
          </span>
        </label>
      ) : null}
      <ErrorNote error={error} className="mt-3" />
    </Dialog>
  )
}

/** Modifier le texte d'une publication ou d'un commentaire. */
export function EditTextDialog({
  open,
  title,
  initial,
  max,
  onSave,
  onClose,
}: {
  open: boolean
  title: string
  initial: string
  max: number
  onSave: (text: string) => Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await onSave(text)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={save} busy={busy} disabled={text.trim() === initial.trim()} className="flex-1">
            Enregistrer
          </Button>
        </>
      }
    >
      <TextArea label="Texte" value={text} onChange={(e) => setText(e.target.value)} maxLength={max} counter rows={6} autoFocus />
      <ErrorNote error={error} className="mt-3" />
    </Dialog>
  )
}

/** Une question avant une action qu'on ne peut pas défaire. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirm,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirm: string
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button variant="danger" onClick={run} busy={busy} className="flex-1">
            {confirm}
          </Button>
        </>
      }
    >
      <ErrorNote error={error} />
    </Dialog>
  )
}
