import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { EyeOff, Flag, MoreHorizontal, Pencil, SendHorizontal, Trash2, X } from 'lucide-react'
import { useSession } from '../../auth/session'
import { errorMessage } from '../../lib/errors'
import { COMMENT_MAX, react, summarize, type Comment, type ReactionKind } from '../../lib/feed'
import { relative } from '../../lib/format'
import { can, useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../Avatar'
import { useToast } from '../Toast'
import { ActionSheet, ConfirmDialog, EditTextDialog, HideDialog, ReportDialog, SheetAction, type Target } from './Dialogs'
import { ReactionButton, ReactionCount, ReactorsDialog } from './Reactions'
import { RichText } from './RichText'

export type ReplyTo = { id: string; firstName: string } | null

/** Les commentaires d'une publication, du plus ancien au plus récent, avec les réponses en dessous. */
export function CommentList({ comments, onReply }: { comments: Comment[]; onReply: (to: ReplyTo) => void }) {
  const uid = useSession().session?.user.id
  // Un commentaire masqué ne reste visible que pour son auteur.
  const visible = comments.filter((c) => !c.hidden_at || c.author_id === uid)
  const top = visible.filter((c) => !c.parent_id)
  const replies = (id: string) => visible.filter((c) => c.parent_id === id)

  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {top.map((c) => (
        <li key={c.id}>
          <CommentItem comment={c} onReply={onReply} />
          {replies(c.id).length ? (
            <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0 pl-11">
              {replies(c.id).map((r) => (
                <li key={r.id}>
                  <CommentItem comment={r} onReply={() => onReply({ id: c.id, firstName: r.author?.first_name ?? '' })} small />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function CommentItem({ comment: c, onReply, small = false }: { comment: Comment; onReply: (to: ReplyTo) => void; small?: boolean }) {
  const uid = useSession().session?.user.id
  const toast = useToast()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<ReactionKind | null | undefined>(undefined)
  const [reactors, setReactors] = useState(false)
  const summary = summarize(c.reactions, uid, pending)
  const a = c.author

  async function pick(kind: ReactionKind | null) {
    setPending(kind)
    try {
      await react({ comment: c.id }, kind)
      await queryClient.invalidateQueries({ queryKey: ['fil', 'commentaires', c.post_id] })
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setPending(undefined)
    }
  }

  return (
    <div className="flex items-start gap-2.5">
      {a ? (
        <Link to={`/app/membres/${a.id}`} aria-label={`Profil de ${a.first_name} ${a.last_name}`} className="shrink-0">
          <Avatar person={a} size={small ? 30 : 36} />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className={`w-fit max-w-full rounded-[18px] bg-surface-2 px-3.5 py-2.5 ${c.hidden_at ? 'opacity-70' : ''}`}>
          <p className="m-0 text-[14px] font-bold">
            {a ? (
              <Link to={`/app/membres/${a.id}`} className="text-ink no-underline hover:underline">
                {a.first_name} {a.last_name}
              </Link>
            ) : (
              'Membre parti'
            )}
          </p>
          <RichText text={c.body} className="text-[15px] leading-[1.45]" />
        </div>
        {c.hidden_at ? (
          <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-danger">
            <EyeOff className="size-3.5" /> Masqué par le bureau{c.hidden_reason ? ` · ${c.hidden_reason}` : ''}. Personne d’autre ne le voit.
          </p>
        ) : (
          <div className="mt-1 flex items-center gap-3.5 pl-3.5 text-[13px] text-muted">
            <span className="whitespace-nowrap">
              {relative(c.created_at).replace('il y a ', '')}
              {c.edited_at ? ' · modifié' : ''}
            </span>
            <ReactionButton variant="text" mine={summary.mine} onPick={pick} />
            <button type="button" onClick={() => onReply({ id: c.id, firstName: a?.first_name ?? '' })} className="font-bold hover:underline">
              Répondre
            </button>
            <CommentMenu comment={c} />
            {summary.total ? (
              <ReactionCount summary={summary} onOpen={() => setReactors(true)} compact />
            ) : null}
          </div>
        )}
      </div>
      <ReactorsDialog target={reactors ? { comment: c.id } : null} onClose={() => setReactors(false)} />
    </div>
  )
}

type Sheet = 'menu' | 'modifier' | 'supprimer' | 'masquer' | null

function CommentMenu({ comment: c }: { comment: Comment }) {
  const me = useMe().data!
  const toast = useToast()
  const queryClient = useQueryClient()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [report, setReport] = useState<Target | null>(null)
  const mine = c.author_id === me.profile.id
  const firstName = c.author?.first_name ?? 'Le membre'
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['fil'] })

  return (
    <>
      <button type="button" onClick={() => setSheet('menu')} aria-label="Plus d'options sur ce commentaire" className="-my-1 grid size-7 place-items-center rounded-full hover:bg-surface-2 hover:text-ink">
        <MoreHorizontal className="size-4" />
      </button>
      <ActionSheet open={sheet === 'menu'} onClose={() => setSheet(null)} title="Commentaire">
        {mine ? (
          <>
            <SheetAction icon={<Pencil className="size-5" />} onClick={() => setSheet('modifier')}>
              Modifier
            </SheetAction>
            <SheetAction icon={<Trash2 className="size-5" />} danger onClick={() => setSheet('supprimer')}>
              Supprimer
            </SheetAction>
          </>
        ) : (
          <>
            <SheetAction
              icon={<Flag className="size-5" />}
              onClick={() => {
                setSheet(null)
                setReport({ comment: c.id })
              }}
              hint={`${firstName} ne saura pas que c'est toi.`}
            >
              Signaler
            </SheetAction>
            {can(me, 'moderation') ? (
              <SheetAction icon={<EyeOff className="size-5" />} danger onClick={() => setSheet('masquer')} hint="Pour le bureau : retirer sans attendre de signalement.">
                Masquer le commentaire
              </SheetAction>
            ) : null}
          </>
        )}
      </ActionSheet>
      {sheet === 'modifier' ? (
        <EditTextDialog
          open
          title="Modifier le commentaire"
          initial={c.body}
          max={COMMENT_MAX}
          onClose={() => setSheet(null)}
          onSave={async (text) => {
            const { error } = await supabase.rpc('update_comment', { p_id: c.id, p_body: text })
            if (error) throw error
            await refresh()
            toast('Commentaire modifié.')
          }}
        />
      ) : null}
      <ConfirmDialog
        open={sheet === 'supprimer'}
        title="Supprimer le commentaire ?"
        description="Les réponses en dessous disparaissent aussi."
        confirm="Supprimer"
        onClose={() => setSheet(null)}
        onConfirm={async () => {
          const { error } = await supabase.rpc('delete_comment', { p_id: c.id })
          if (error) throw error
          await refresh()
          toast('Commentaire supprimé.')
        }}
      />
      {sheet === 'masquer' ? <HideDialog target={{ comment: c.id }} firstName={firstName} onClose={() => setSheet(null)} /> : null}
      <ReportDialog target={report} firstName={firstName} onClose={() => setReport(null)} />
    </>
  )
}

/** Le champ du bas : écrire un commentaire, ou répondre à quelqu'un. */
export function CommentInput({ postId, replyTo, onCancelReply, focusKey }: { postId: string; replyTo: ReplyTo; onCancelReply: () => void; focusKey: number }) {
  const me = useMe().data!
  const toast = useToast()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (focusKey) field.current?.focus()
  }, [focusKey])

  // Le champ grandit avec le texte, jusqu'à cinq lignes.
  useEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [text])

  async function send() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('add_comment', { p_post: postId, p_body: body, p_parent: replyTo?.id })
    setBusy(false)
    if (error) return toast(errorMessage(error), 'error')
    setText('')
    onCancelReply()
    await queryClient.invalidateQueries({ queryKey: ['fil'] })
  }

  return (
    <div className="flex flex-col gap-2">
      {replyTo ? (
        <p className="m-0 flex items-center gap-2 pl-14 text-[13px] text-muted">
          Réponse à <strong className="text-ink">{replyTo.firstName}</strong>
          <button type="button" onClick={onCancelReply} aria-label="Annuler la réponse" className="grid size-6 place-items-center rounded-full hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </p>
      ) : null}
      <form
        className="flex items-end gap-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <Avatar person={me.profile} size={40} />
        <div className="flex min-h-12 min-w-0 flex-1 items-end gap-1 rounded-[24px] bg-surface-2 py-1 pr-1 pl-4 focus-within:ring-[3px] focus-within:ring-safran/45">
          <label htmlFor="commentaire" className="sr-only">
            {replyTo ? `Répondre à ${replyTo.firstName}` : 'Écrire un commentaire'}
          </label>
          <textarea
            id="commentaire"
            ref={field}
            rows={1}
            value={text}
            maxLength={COMMENT_MAX}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 1024px)').matches) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={replyTo ? `Répondre à ${replyTo.firstName}…` : 'Écrire un commentaire…'}
            className="min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-[1.4] text-ink outline-none placeholder:text-muted"
          />
          <button type="submit" disabled={!text.trim() || busy} aria-label="Envoyer" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-ink disabled:opacity-40">
            <SendHorizontal className="size-5" />
          </button>
        </div>
      </form>
    </div>
  )
}
