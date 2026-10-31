import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Info, Megaphone, Users } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { ErrorNote } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { AttachButton, AttachmentPreviews } from '../../components/feed/Composer'
import { ConfirmDialog } from '../../components/feed/Dialogs'
import { discardUploads, takeHandedOffFiles, uploadAttachments, useAttachments } from '../../lib/attachments'
import { errorMessage } from '../../lib/errors'
import { POST_MAX } from '../../lib/feed'
import { can, useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'

/** Nouvelle publication : plein écran sur téléphone, carte centrée sur ordinateur. */
export function Publier() {
  const me = useMe().data!
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const media = useAttachments()
  const [text, setText] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const { add } = media

  // Les photos choisies depuis le fil.
  useEffect(() => {
    const files = takeHandedOffFiles()
    if (files) add(files)
  }, [add])

  // Le texte grandit avec ce qu'on écrit.
  useEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`
  }, [text])

  const dirty = !!text.trim() || media.list.length > 0
  const ready = dirty && !media.busy && !progress

  function back() {
    if (dirty && !progress) setLeaving(true)
    else navigate('/app/fil')
  }

  async function publish() {
    if (!ready) return
    setError(null)
    const id = crypto.randomUUID()
    const n = media.list.length
    setProgress(n ? `Envoi ${n > 1 ? 'des photos' : media.list[0].kind === 'video' ? 'de la vidéo' : 'de la photo'}…` : 'Publication…')
    try {
      const files = await uploadAttachments(me.profile.id, id, media.list, (done) => n > 1 && setProgress(`Envoi des photos… ${done} sur ${n}`))
      const { error } = await supabase.rpc('create_post', { p_id: id, p_body: text, p_media: files })
      if (error) {
        await discardUploads(files)
        throw error
      }
      await queryClient.invalidateQueries({ queryKey: ['fil'] })
      toast('Publié ! Ta publication est dans le fil.')
      navigate('/app/fil')
    } catch (e) {
      setError(errorMessage(e))
      setProgress(null)
    }
  }

  const submit = (
    <Button variant="accent" size="md" onClick={publish} busy={!!progress} disabled={!ready}>
      Publier
    </Button>
  )

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-surface lg:min-h-0 lg:bg-transparent lg:px-10 lg:py-8">
      <header className="sticky top-0 z-20 flex h-[calc(64px+env(safe-area-inset-top))] items-center gap-2 border-b border-line-soft bg-surface px-3 pt-[env(safe-area-inset-top)] lg:hidden">
        <button type="button" onClick={back} aria-label="Retour au fil" className="grid size-11 place-items-center rounded-xl hover:bg-surface-2">
          <ChevronLeft className="size-6" strokeWidth={2.2} />
        </button>
        <h1 className="titre m-0 flex-1 text-[22px]">Nouvelle publication</h1>
        {submit}
      </header>

      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col lg:flex-none lg:rounded-[12px] lg:bg-surface lg:p-6">
        <div className="mb-5 hidden items-center justify-between lg:flex">
          <h1 className="titre m-0 text-[28px]">Nouvelle publication</h1>
          <button type="button" onClick={back} className="text-[14px] font-bold text-muted hover:underline">
            Annuler
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 px-4 pt-4 pb-6 lg:p-0">
          <div className="flex items-center gap-3">
            <Avatar person={me.profile} size={48} />
            <div className="min-w-0">
              <p className="m-0 text-[16px] font-bold">
                {me.profile.first_name} {me.profile.last_name}
              </p>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-select px-2.5 py-1 text-[12px] font-bold text-ink">
                <Users className="size-3.5" /> Tous les membres de l'AEGB
              </span>
            </div>
          </div>

          <label htmlFor="texte" className="sr-only">
            Ton message
          </label>
          <textarea
            id="texte"
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={POST_MAX}
            autoFocus
            placeholder={`Quoi de neuf, ${me.profile.first_name} ?`}
            className="min-h-[120px] w-full resize-none bg-transparent text-[18px] leading-[1.5] text-ink outline-none placeholder:text-muted"
          />
          {text.length > POST_MAX - 200 ? (
            <p className="-mt-2 mb-0 text-right text-[13px] text-muted tabular-nums" aria-live="polite">
              {text.length} / {POST_MAX}
            </p>
          ) : null}

          <AttachmentPreviews media={media} />
          <ErrorNote error={media.error} />
          <ErrorNote error={error} />

          <div className="mt-auto flex flex-col gap-3 pt-2">
            <AttachButton media={media} />
            <p className="m-0 flex items-start gap-2 text-[13px] leading-[1.45] text-muted">
              <Info className="mt-px size-4 shrink-0" />
              <span>
                Ta publication apparaît tout de suite dans le fil. Les annonces officielles restent réservées au bureau.
                {can(me, 'annonces') ? (
                  <>
                    {' '}
                    <Link to="/bureau/annonces" className="inline-flex items-center gap-1 font-bold">
                      <Megaphone className="size-3.5" /> Écrire une annonce
                    </Link>
                  </>
                ) : null}
              </span>
            </p>
            {progress ? (
              <p className="m-0 text-center text-[14px] font-bold text-muted" role="status">
                {progress}
              </p>
            ) : null}
          </div>

          <div className="hidden justify-end lg:flex">{submit}</div>
        </div>
      </div>

      <ConfirmDialog
        open={leaving}
        title="Abandonner la publication ?"
        description="Ton texte et tes photos ne seront pas gardés."
        confirm="Abandonner"
        onClose={() => setLeaving(false)}
        onConfirm={async () => navigate('/app/fil')}
      />
    </div>
  )
}
