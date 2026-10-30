import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, Bot, Lock, MessageSquare, UserX } from 'lucide-react'
import { useSession } from '../../auth/session'
import { errorMessage } from '../../lib/errors'
import { clock, dayLabel, markRead, openPrivate, refreshMessages, sameDay, sendMessage, useThread, WELCOME_ACTIONS, type ConversationInfo, type MessageRow, type Outgoing } from '../../lib/messages'
import { supabase } from '../../lib/supabase'
import { Button } from '../Button'
import { EmptyState, ErrorNote, Spinner } from '../Feedback'
import { useToast } from '../Toast'
import { ReportDialog } from '../feed/Dialogs'
import { ArrivalCard, AssemblyCard, Bubble, DaySeparator, DuesCard, SystemLine, WelcomeMessage } from './Bubble'
import { Composer } from './Composer'
import { MessageActions } from './MessageActions'

/** Deux messages du même auteur à moins de 5 minutes d'écart forment une suite : le nom ne s'affiche qu'une fois. */
const SERIES_MS = 5 * 60_000

function startsSeries(m: MessageRow, prev: MessageRow | undefined): boolean {
  if (!prev || prev.kind !== 'message') return true
  if (prev.as_aegb !== m.as_aegb || prev.sender_id !== m.sender_id) return true
  if (!sameDay(prev.created_at, m.created_at)) return true
  return new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > SERIES_MS
}

/** Ce qu'on montre pendant l'envoi d'un fichier. */
function describe(files: Outgoing[]): string {
  const first = files[0]
  if (!first) return ''
  if (first.kind === 'photo') return files.length > 1 ? `${files.length} photos` : 'Photo'
  if (first.kind === 'vocal') return 'Message vocal'
  return `Document : ${first.name}`
}

function senderName(m: MessageRow, uid: string | undefined, staffView: boolean): string {
  if (m.as_aegb) return staffView ? 'ta réponse AEGB' : 'AEGB'
  if (m.sender_id === uid) return 'toi'
  return m.sender_first_name ? `${m.sender_first_name} ${m.sender_last_name ?? ''}`.trim() : 'un membre parti'
}

type Props = {
  id: string
  info: ConversationInfo
  /** Au-dessus des messages, dans la zone qui défile. */
  intro?: ReactNode
  /** Le poste peut lire la boîte d'AEGB, pas y répondre. */
  readOnly?: boolean
}

/**
 * Les messages d'une conversation et le champ pour écrire. La zone défile
 * depuis le bas : à l'ouverture, on voit les derniers messages, et charger
 * les plus anciens ne fait pas sauter l'écran. À monter avec key={id} pour
 * repartir de zéro à chaque conversation.
 */
export function Thread({ id, info, intro, readOnly = false }: Props) {
  const uid = useSession().session?.user.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const thread = useThread(id)
  const scroller = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<MessageRow[]>([])
  const [replyTo, setReplyTo] = useState<{ message: MessageRow; name: string } | null>(null)
  const [actions, setActions] = useState<MessageRow | null>(null)
  const [report, setReport] = useState<MessageRow | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [unblocking, setUnblocking] = useState(false)

  const staffView = info.as_aegb
  const group = info.kind === 'groupe' || info.kind === 'grand_groupe'
  const other = info.other
  // Du plus ancien au plus récent.
  const rows = (thread.data?.pages ?? []).flat().reverse()
  const newest = rows[rows.length - 1]
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = thread

  // Lu : à l'ouverture, à chaque nouveau message, et quand on revient sur l'onglet.
  useEffect(() => {
    if (!info.member) return
    const read = () => {
      if (document.visibilityState !== 'visible') return
      markRead(id)
        .then(() => queryClient.invalidateQueries({ queryKey: ['messages', 'liste'] }))
        .catch(() => undefined)
    }
    read()
    document.addEventListener('visibilitychange', read)
    return () => document.removeEventListener('visibilitychange', read)
  }, [id, info.member, newest?.id, queryClient])

  // Les messages plus anciens se chargent quand on remonte en haut.
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) fetchNextPage()
    }, { root: scroller.current, rootMargin: '200px 0px 0px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  function toBottom() {
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: 0 }))
  }

  function jump(target: string) {
    const el = document.getElementById(`msg-${target}`)
    if (!el) {
      if (hasNextPage) fetchNextPage()
      toast('Ce message est plus haut : remonte la conversation pour le voir.')
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlight(target)
    window.setTimeout(() => setHighlight((h) => (h === target ? null : h)), 1600)
  }

  async function hello(member: string) {
    try {
      navigate(`/app/messages/${await openPrivate(member)}`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  async function send({ body, files }: { body: string; files: Outgoing[] }): Promise<boolean> {
    const messageId = crypto.randomUUID()
    const quoted = replyTo
    const temp: MessageRow = {
      id: messageId,
      kind: 'message',
      sender_id: staffView ? null : (uid ?? null),
      sender_first_name: null,
      sender_last_name: null,
      sender_avatar_path: null,
      as_aegb: staffView,
      written_by_name: null,
      body: body || describe(files),
      meta: {},
      files: [],
      post_id: null,
      reply: quoted ? { id: quoted.message.id, sender_id: quoted.message.sender_id, as_aegb: quoted.message.as_aegb, sender_name: quoted.name, excerpt: quoted.message.body } : null,
      reactions: [],
      created_at: new Date().toISOString(),
      deleted: false,
      hidden: false,
      hidden_reason: null,
      reported: false,
    }
    setPending((list) => [...list, temp])
    setReplyTo(null)
    toBottom()
    try {
      await sendMessage({ conversation: id, id: messageId, body, replyTo: quoted?.message.id, files })
      await refreshMessages(queryClient, id)
      if (staffView) queryClient.invalidateQueries({ queryKey: ['bureau', 'aegb'] })
      return true
    } catch (e) {
      toast(errorMessage(e), 'error')
      setReplyTo(quoted)
      return false
    } finally {
      setPending((list) => list.filter((m) => m.id !== messageId))
    }
  }

  async function unblock() {
    if (!other) return
    setUnblocking(true)
    const { error } = await supabase.rpc('unblock_member', { p_member: other.id })
    setUnblocking(false)
    if (error) return toast(errorMessage(error), 'error')
    toast(`Tu as débloqué ${other.first_name}.`)
    queryClient.invalidateQueries({ queryKey: ['messages'] })
  }

  const isMine = (m: MessageRow) => (staffView ? m.as_aegb : !m.as_aegb && m.sender_id === uid)
  // « Vu » sous mon dernier message, s'il est le dernier de la conversation.
  const lastMine = newest && newest.kind === 'message' && !newest.deleted && isMine(newest) ? newest : null
  const seen = lastMine && other && (info.kind === 'prive' || staffView) ? new Date(other.last_read_at) >= new Date(lastMine.created_at) : false
  const status = lastMine && other && (info.kind === 'prive' || staffView) ? (seen ? (staffView ? `Vu par ${other.first_name}` : 'Vu') : 'Envoyé') : null

  const items: ReactNode[] = []
  rows.forEach((m, i) => {
    const prev = rows[i - 1]
    if (!prev || !sameDay(prev.created_at, m.created_at)) items.push(<DaySeparator key={`jour-${m.id}`} label={dayLabel(m.created_at)} />)
    if (m.kind === 'systeme') {
      items.push(<SystemLine key={m.id}>{m.body}</SystemLine>)
    } else if (m.kind === 'arrivee') {
      items.push(<ArrivalCard key={m.id} m={m} uid={uid} onHello={hello} />)
    } else if (m.kind === 'bienvenue' && staffView) {
      items.push(
        <SystemLine key={m.id} icon={<Bot className="size-3.5" />}>
          {m.meta.essai ? 'Message d’essai envoyé' : 'Message de bienvenue envoyé automatiquement'} à {clock(m.created_at)}
        </SystemLine>,
      )
    } else if (m.kind === 'cotisation') {
      items.push(<DuesCard key={m.id} m={m} staffView={staffView} />)
    } else if (m.kind === 'assemblee') {
      items.push(<AssemblyCard key={m.id} m={m} staffView={staffView} />)
    } else if (m.kind === 'bienvenue') {
      const list = (m.meta.actions ?? []).map((v) => WELCOME_ACTIONS.find((a) => a.value === v)).filter((a) => !!a)
      items.push(<WelcomeMessage key={m.id} m={m} actions={list} />)
    } else {
      items.push(
        <Bubble
          key={m.id}
          m={m}
          uid={uid}
          staffView={staffView}
          group={group}
          first={startsSeries(m, prev)}
          status={m === lastMine ? status : null}
          highlighted={highlight === m.id}
          onActions={setActions}
          onJump={jump}
        />,
      )
    }
  })
  // Le vrai message peut arriver avant que l'attente ne soit retirée.
  const known = new Set(rows.map((m) => m.id))
  pending.filter((m) => !known.has(m.id)).forEach((m, i) => {
    items.push(<Bubble key={m.id} m={m} uid={uid} staffView={staffView} group={group} first={i === 0 && (!newest || !isMine(newest))} pending onJump={jump} />)
  })

  const name = other ? `${other.first_name} ${other.last_name}` : ''
  let footer: ReactNode
  if (info.kind === 'prive' && other?.blocked) {
    footer = (
      <div className="flex shrink-0 flex-col items-center gap-2.5 border-t border-line-soft bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] text-center">
        <p className="m-0 flex items-center gap-2 text-[14px] text-muted">
          <Ban className="size-4" /> Tu as bloqué {name}. Tu ne reçois plus ses messages.
        </p>
        <Button variant="outline" size="sm" busy={unblocking} onClick={unblock}>
          Débloquer
        </Button>
      </div>
    )
  } else if (info.kind === 'prive' && other && other.status !== 'actif') {
    footer = (
      <p className="m-0 flex shrink-0 items-center justify-center gap-2 border-t border-line-soft bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] text-[14px] text-muted">
        <UserX className="size-4" /> {name} n’est plus joignable.
      </p>
    )
  } else if (staffView && readOnly) {
    footer = (
      <p className="m-0 flex shrink-0 items-center justify-center gap-2 border-t border-line-soft bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] text-[14px] text-muted">
        <Lock className="size-4" /> Ton poste peut lire ces messages, pas y répondre.
      </p>
    )
  } else if (info.member || staffView) {
    footer = (
      <Composer
        placeholder={staffView ? 'Répondre au nom d’AEGB' : info.kind === 'aegb' ? 'Écrire au bureau' : 'Écrire un message'}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={send}
        labelled={staffView}
        note={
          staffView ? (
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5 shrink-0" /> Tu réponds au nom d’AEGB. {other?.first_name ?? 'Le membre'} voit seulement « AEGB ».
            </span>
          ) : undefined
        }
      />
    )
  }

  const empty = !thread.isPending && !rows.length && !pending.length

  return (
    <>
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto overscroll-contain bg-page">
        <div className="flex flex-col px-3 pt-2 pb-4 lg:px-8">
          <div ref={sentinel} aria-hidden="true" />
          {isFetchingNextPage ? (
            <div className="flex justify-center py-3">
              <Spinner className="size-5" />
            </div>
          ) : hasNextPage ? (
            <button type="button" onClick={() => fetchNextPage()} className="mx-auto my-2 rounded-full bg-surface px-4 py-2 text-[13px] font-bold text-link shadow-sm">
              Voir les messages plus anciens
            </button>
          ) : (
            intro
          )}
          <ErrorNote error={thread.error} className="my-3" />
          {thread.isPending ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : null}
          {empty ? (
            <EmptyState title={info.kind === 'aegb' && !staffView ? 'Écris au bureau' : other ? `Dis bonjour à ${other.first_name}` : 'Pas encore de message'} icon={<MessageSquare className="size-6" />}>
              {info.kind === 'aegb' && !staffView ? 'Une question ? Un membre du bureau te répond ici.' : 'Ton premier message ouvrira la conversation.'}
            </EmptyState>
          ) : null}
          {items}
        </div>
      </div>
      {footer}
      <MessageActions
        message={actions}
        uid={uid}
        mine={actions ? isMine(actions) : false}
        otherName={info.kind === 'prive' ? (other?.first_name ?? null) : staffView ? (other?.first_name ?? null) : null}
        canReact={info.member}
        canReport={info.member && !staffView}
        onClose={() => setActions(null)}
        onReply={(m) => setReplyTo({ message: m, name: senderName(m, uid, staffView) })}
        onReport={setReport}
        onChanged={() => refreshMessages(queryClient, id)}
      />
      <ReportDialog
        target={report ? { message: report.id } : null}
        firstName={report?.sender_first_name ?? 'Ce membre'}
        onClose={() => {
          setReport(null)
          refreshMessages(queryClient, id)
        }}
      />
    </>
  )
}
