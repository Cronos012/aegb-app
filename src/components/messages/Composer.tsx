import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { FileText, ImagePlus, LoaderCircle, Mic, Plus, SendHorizontal, Trash2, X } from 'lucide-react'
import { useIsDesktop } from '../../lib/media'
import { checkDocument, DOCUMENT_ACCEPT, duration, MAX_FILE_MB, MAX_PHOTOS, MAX_VOICE_S, MESSAGE_MAX, preparePhoto, type MessageRow, type Outgoing } from '../../lib/messages'
import { Dialog } from '../Dialog'
import { useToast } from '../Toast'
import { SheetAction } from '../feed/Dialogs'
import { Waveform } from './Bubble'

/* ----------------------------------------------------------------------------
   Le vocal : on touche le micro, un compteur défile, puis Annuler ou Envoyer.
---------------------------------------------------------------------------- */

const VOICE_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

type Recording = { state: 'idle' } | { state: 'recording'; elapsed: number } | { state: 'ready'; blob: Blob; seconds: number }

function useRecorder() {
  const [rec, setRec] = useState<Recording>({ state: 'idle' })
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const started = useRef(0)
  const ticker = useRef<number | null>(null)
  const done = useRef<((r: { blob: Blob; seconds: number } | null) => void) | null>(null)
  const keep = useRef(true)

  const release = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current)
    ticker.current = null
    recorder.current?.stream.getTracks().forEach((t) => t.stop())
    recorder.current = null
  }, [])

  useEffect(() => release, [release])

  /** Arrête l'enregistrement. keepIt : on garde le vocal (pour l'envoyer). */
  const stop = useCallback((keepIt: boolean): Promise<{ blob: Blob; seconds: number } | null> => {
    const r = recorder.current
    if (!r || r.state === 'inactive') {
      release()
      setRec({ state: 'idle' })
      return Promise.resolve(null)
    }
    keep.current = keepIt
    return new Promise((resolve) => {
      done.current = resolve
      r.stop()
    })
  }, [release])

  async function start(): Promise<string | null> {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'Ce navigateur ne permet pas d’enregistrer un vocal.'
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return 'Autorise le micro pour enregistrer un vocal.'
    }
    const mimeType = VOICE_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    chunks.current = []
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    r.onstop = () => {
      const seconds = Math.min(MAX_VOICE_S, (performance.now() - started.current) / 1000)
      const blob = new Blob(chunks.current, { type: (r.mimeType || mimeType || 'audio/webm').split(';')[0] })
      release()
      const result = keep.current && blob.size > 0 && seconds >= 0.5 ? { blob, seconds } : null
      setRec(result ? { state: 'ready', ...result } : { state: 'idle' })
      done.current?.(result)
      done.current = null
    }
    recorder.current = r
    started.current = performance.now()
    r.start(250)
    setRec({ state: 'recording', elapsed: 0 })
    ticker.current = window.setInterval(() => {
      const elapsed = (performance.now() - started.current) / 1000
      // À 2 minutes, l'enregistrement s'arrête : on peut encore l'envoyer ou l'annuler.
      if (elapsed >= MAX_VOICE_S) stop(true)
      else setRec({ state: 'recording', elapsed })
    }, 200)
    return null
  }

  function reset() {
    setRec({ state: 'idle' })
  }

  return { rec, start, stop, reset }
}

/* ----------------------------------------------------------------------------
   Le champ du bas
---------------------------------------------------------------------------- */

type Props = {
  placeholder: string
  replyTo: { message: MessageRow; name: string } | null
  onCancelReply: () => void
  onSend: (input: { body: string; files: Outgoing[] }) => Promise<boolean>
  /** Sous le champ : la note du bureau qui répond au nom d'AEGB. */
  note?: ReactNode
  /** Le bureau écrit au nom d'AEGB : « Envoyer » en toutes lettres. */
  labelled?: boolean
  allowFiles?: boolean
  autoFocus?: boolean
}

export function Composer({ placeholder, replyTo, onCancelReply, onSend, note, labelled = false, allowFiles = true, autoFocus = false }: Props) {
  const desktop = useIsDesktop()
  const toast = useToast()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Outgoing[]>([])
  const [preparing, setPreparing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)
  const { rec, start, stop, reset } = useRecorder()
  const ready = text.trim().length > 0 || files.length > 0

  useEffect(() => {
    if (replyTo) area.current?.focus()
  }, [replyTo])

  // Les aperçus des photos sont libérés quand on les retire, après l'envoi, ou en quittant l'écran.
  const previews = useRef(new Set<string>())
  useEffect(() => {
    const made = previews.current
    return () => made.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function drop(list: Outgoing[]) {
    for (const f of list) {
      if (f.kind === 'photo') {
        URL.revokeObjectURL(f.preview)
        previews.current.delete(f.preview)
      }
    }
  }

  function grow() {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  async function addPhotos(list: File[]) {
    if (files.some((f) => f.kind !== 'photo')) return toast('Envoie le document et les photos séparément.', 'error')
    const room = MAX_PHOTOS - files.length
    if (list.length > room) toast(`${MAX_PHOTOS} photos au plus par envoi.`, 'error')
    setPreparing(true)
    const next: Outgoing[] = []
    for (const f of list.slice(0, Math.max(0, room))) {
      try {
        next.push(await preparePhoto(f))
      } catch (e) {
        toast(e instanceof Error ? e.message : "Cette photo ne s'ouvre pas.", 'error')
      }
    }
    setPreparing(false)
    for (const f of next) if (f.kind === 'photo') previews.current.add(f.preview)
    setFiles((current) => [...current, ...next])
  }

  function addDocument(file: File) {
    if (files.length) return toast('Envoie le document et les photos séparément.', 'error')
    try {
      setFiles([checkDocument(file)])
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ce fichier ne passe pas.', 'error')
    }
  }

  /** Le champ se vide tout de suite ; si l'envoi échoue, le texte et les fichiers reviennent. */
  async function send() {
    if (busy) return
    const body = text.trim()
    const list = files
    if (!body && !list.length) return
    if (body.length > MESSAGE_MAX) return toast(`Ton message dépasse ${MESSAGE_MAX.toLocaleString('fr-FR')} caractères.`, 'error')
    setBusy(true)
    setText('')
    setFiles([])
    requestAnimationFrame(grow)
    const ok = await onSend({ body, files: list })
    setBusy(false)
    if (ok) return drop(list)
    setText((current) => current || body)
    setFiles((current) => (current.length ? current : list))
    requestAnimationFrame(grow)
  }

  async function sendVoice() {
    if (busy) return
    const result = rec.state === 'ready' ? { blob: rec.blob, seconds: rec.seconds } : await stop(true)
    if (!result) return toast('Le vocal est trop court.', 'error')
    setBusy(true)
    const ok = await onSend({ body: '', files: [{ kind: 'vocal', blob: result.blob, duration: result.seconds }] })
    setBusy(false)
    if (ok) reset()
  }

  async function record() {
    const problem = await start()
    if (problem) toast(problem, 'error')
  }

  if (rec.state !== 'idle') {
    const seconds = rec.state === 'recording' ? rec.elapsed : rec.seconds
    return (
      <div className="shrink-0 border-t border-line-soft bg-surface px-3 pt-2.5 pb-[max(env(safe-area-inset-bottom),10px)] lg:px-5">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => (rec.state === 'ready' ? reset() : stop(false))} aria-label="Annuler le vocal" className="grid size-12 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
            <Trash2 className="size-5" />
          </button>
          <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full bg-surface-2 px-4">
            {rec.state === 'recording' ? <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-gn-rouge" aria-hidden="true" /> : null}
            <span className="w-10 shrink-0 text-[15px] font-bold tabular-nums" aria-live="off">
              {duration(seconds)}
            </span>
            <Waveform seed="enregistrement" progress={seconds / MAX_VOICE_S} mine={false} />
          </div>
          <button type="button" onClick={sendVoice} disabled={busy} aria-label="Envoyer le vocal" className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-ink disabled:opacity-50">
            {busy ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
          </button>
        </div>
        <p className="m-0 mt-1.5 text-center text-[12px] text-muted" role="status">
          {rec.state === 'recording' ? 'Enregistrement en cours · 2 minutes au plus' : 'Vocal prêt : envoie-le ou annule-le'}
        </p>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t border-line-soft bg-surface px-3 pt-2.5 pb-[max(env(safe-area-inset-bottom),10px)] lg:px-5">
      {replyTo ? (
        <div className="mb-2 flex items-center gap-2 rounded-[12px] border-l-[3px] border-primary bg-surface-2 py-1.5 pr-1.5 pl-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-bold text-link">Réponse à {replyTo.name}</span>
            <span className="block truncate text-[13px] text-muted">{replyTo.message.body ?? (replyTo.message.files.length ? 'Fichier joint' : 'Publication partagée')}</span>
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Ne plus répondre à ce message" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-line-soft">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {files.length || preparing ? (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {files.map((f, i) =>
            f.kind === 'photo' ? (
              <div key={f.preview} className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                <img src={f.preview} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" onClick={() => {
                    drop([f])
                    setFiles(files.filter((_, k) => k !== i))
                  }} aria-label={`Retirer la photo ${i + 1}`} className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-nuit/75 text-white">
                  <X className="size-4" />
                </button>
              </div>
            ) : f.kind === 'document' ? (
              <div key="doc" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-surface-2 p-2 pr-1">
                <FileText className="size-6 shrink-0 text-danger" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{f.name}</span>
                <button type="button" onClick={() => setFiles([])} aria-label="Retirer le document" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-line-soft">
                  <X className="size-4" />
                </button>
              </div>
            ) : null,
          )}
          {preparing ? (
            <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted" role="status">
              <LoaderCircle className="size-6 animate-spin" aria-label="Préparation de la photo" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        {allowFiles ? (
          <>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const list = [...(e.target.files ?? [])]
                e.target.value = ''
                if (list.length) addPhotos(list)
              }}
            />
            <input
              ref={docInput}
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) addDocument(file)
              }}
            />
            <button type="button" onClick={() => setMenu(true)} aria-label="Joindre une photo ou un document" className="grid size-12 shrink-0 place-items-center rounded-full text-ink hover:bg-surface-2">
              <Plus className="size-6" />
            </button>
          </>
        ) : null}
        <label className="flex min-h-12 min-w-0 flex-1 items-center rounded-[12px] bg-surface-2 px-4 py-2 focus-within:ring-[3px] focus-within:ring-safran/45">
          <span className="sr-only">{placeholder}</span>
          <textarea
            ref={area}
            value={text}
            rows={1}
            maxLength={MESSAGE_MAX}
            autoFocus={autoFocus}
            onChange={(e) => {
              setText(e.target.value)
              grow()
            }}
            onKeyDown={(e) => {
              if (desktop && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={placeholder}
            className="max-h-40 w-full resize-none bg-transparent text-[16px] leading-[1.4] text-ink outline-none placeholder:text-muted"
          />
        </label>
        {ready || !allowFiles ? (
          <button
            type="button"
            onClick={() => send()}
            disabled={busy || preparing || !ready}
            aria-label="Envoyer"
            className={`flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-primary font-bold text-primary-ink disabled:opacity-50 ${labelled ? 'px-5 text-[15px]' : 'w-12'}`}
          >
            {busy ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
            {labelled ? <span className="hidden lg:inline">Envoyer</span> : null}
          </button>
        ) : (
          <button type="button" onClick={record} aria-label="Enregistrer un vocal" className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-ink">
            <Mic className="size-5" />
          </button>
        )}
      </div>
      {note ? <div className="mt-2 text-[12px] text-muted">{note}</div> : null}

      <Dialog open={menu} onClose={() => setMenu(false)} title="Joindre">
        <div className="-mx-2 flex flex-col pb-2">
          <SheetAction
            icon={<ImagePlus className="size-5" />}
            hint={`${MAX_PHOTOS} photos au plus, réduites avant l’envoi`}
            onClick={() => {
              setMenu(false)
              photoInput.current?.click()
            }}
          >
            Photos
          </SheetAction>
          <SheetAction
            icon={<FileText className="size-5" />}
            hint={`PDF, Word, Excel, PowerPoint ou texte, ${MAX_FILE_MB} Mo au plus`}
            onClick={() => {
              setMenu(false)
              docInput.current?.click()
            }}
          >
            Document
          </SheetAction>
        </div>
      </Dialog>
    </div>
  )
}
