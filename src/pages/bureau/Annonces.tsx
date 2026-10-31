import { useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Clock, Megaphone, Pin, PinOff, Send, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { TextArea, TextField } from '../../components/Field'
import { Pill } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { AttachButton, AttachmentPreviews } from '../../components/feed/Composer'
import { ConfirmDialog } from '../../components/feed/Dialogs'
import { PostCard } from '../../components/feed/PostCard'
import { discardUploads, uploadAttachments, useAttachments } from '../../lib/attachments'
import { errorMessage } from '../../lib/errors'
import { AUDIENCES, POST_MAX, useAnnouncements, useNow, type Audience, type FeedPost } from '../../lib/feed'
import { dateTime, shortDate } from '../../lib/format'
import { removeFiles } from '../../lib/photos'
import { can, useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { BureauPage, Card, Chips } from './BureauPage'

const TITLE_MAX = 120

/** La date du champ « date et heure » du navigateur, à l'heure du téléphone. */
function localInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function Toggle({ checked, onChange, title, detail }: { checked: boolean; onChange: (v: boolean) => void; title: string; detail: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-surface-2 px-4 py-3.5">
      <span>
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-[13px] text-muted">{detail}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className={`relative h-8 w-[52px] shrink-0 rounded-full transition peer-focus-visible:ring-[3px] peer-focus-visible:ring-safran/60 ${checked ? 'bg-primary' : 'bg-line'}`} aria-hidden="true">
        <span className={`absolute top-1 size-6 rounded-full bg-surface shadow transition-all ${checked ? 'left-[24px]' : 'left-1'}`} />
      </span>
    </label>
  )
}

export default function Annonces() {
  const me = useMe().data!
  const writes = can(me, 'annonces')
  const toast = useToast()
  const queryClient = useQueryClient()
  const list = useAnnouncements()
  const media = useAttachments()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('tous')
  const [pin, setPin] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState(false)
  const [when, setWhen] = useState('')
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null)

  const ready = !!title.trim() && !media.busy && !busy
  // La liste revient du serveur après chaque publication : son heure d'arrivée sert de « maintenant ».
  const now = new Date(Math.max(useNow(), list.dataUpdatedAt))

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['bureau', 'annonces'] }), queryClient.invalidateQueries({ queryKey: ['fil'] })])
  }

  async function publish(at: Date | null) {
    if (!ready) return
    setError(null)
    setBusy(at ? 'programmer' : 'publier')
    const id = crypto.randomUUID()
    try {
      const files = await uploadAttachments('bureau', id, media.list)
      const { error } = await supabase.rpc('publish_announcement', {
        p_id: id,
        p_title: title,
        p_body: body,
        p_audience: audience,
        p_pin: pin,
        p_publish_at: at ? at.toISOString() : undefined,
        p_media: files,
      })
      if (error) {
        await discardUploads(files)
        throw error
      }
      setTitle('')
      setBody('')
      setAudience('tous')
      setPin(true)
      media.clear()
      setScheduling(false)
      await refresh()
      toast(at ? `Annonce programmée pour le ${dateTime(at)}.` : 'Annonce publiée. Elle est en tête du fil.')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function unpin(id: string) {
    const { error } = await supabase.rpc('unpin_announcement', { p_id: id })
    if (error) return toast(errorMessage(error), 'error')
    await refresh()
    toast("L'annonce n'est plus épinglée.")
  }

  const preview: FeedPost = {
    id: 'apercu',
    author_id: null,
    official: true,
    title: title.trim() || "Le titre de l'annonce",
    body: body.trim() || 'Ton message apparaîtra ici, tel que les membres le verront.',
    audience,
    published_at: now.toISOString(),
    pinned_until: null,
    edited_at: null,
    hidden_at: null,
    hidden_reason: null,
    created_at: now.toISOString(),
    author: null,
    post_media: [],
    reactions: [],
    comments: [{ count: 0 }],
    announcement_authors: null,
  }

  const items = list.data ?? []
  const scheduled = items.filter((a) => new Date(a.published_at) > now).length

  const form = writes ? (
    <Card className="flex flex-col gap-4 p-4 lg:p-6">
      <h2 className="titre m-0 text-[20px]">Nouvelle annonce</h2>
      <TextField label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} placeholder="Soirée d'intégration samedi 8 novembre" />
      <TextArea label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={POST_MAX} counter rows={5} placeholder="Bonsoir à toutes et à tous !" />
      <AttachmentPreviews media={media} />
      <div className="flex flex-wrap gap-2">
        <AttachButton media={media} variant="chip" />
      </div>
      <ErrorNote error={media.error} />
      <div className="flex flex-col gap-2">
        <p className="m-0 text-sm font-bold">Qui la reçoit</p>
        <Chips label="Qui reçoit l'annonce" options={AUDIENCES.map((a) => ({ value: a.value, label: a.label }))} value={audience} onChange={setAudience} />
      </div>
      <Toggle checked={pin} onChange={setPin} title="Épingler en haut du fil" detail="Pendant 7 jours, puis elle redescend normalement" />
      <ErrorNote error={error} />
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Button variant="outline" size="md" icon={<Clock className="size-5" />} onClick={() => setScheduling(true)} disabled={!ready}>
          Programmer
        </Button>
        <Button size="md" icon={<Send className="size-5" />} onClick={() => publish(null)} busy={busy === 'publier'} disabled={!ready}>
          Publier l'annonce
        </Button>
      </div>
    </Card>
  ) : (
    <Note>Ton poste peut lire les annonces, pas en publier.</Note>
  )

  const recent = (
    <Card className="p-4 lg:p-5">
      <h2 className="titre m-0 text-[18px] lg:text-[19px]">Dernières annonces</h2>
      <ErrorNote error={list.error} className="mt-3" />
      {items.length ? (
        <ul className="m-0 mt-2 flex list-none flex-col divide-y divide-line-soft p-0">
          {items.map((a) => {
            const later = new Date(a.published_at) > now
            const pinned = !later && !!a.pinned_until && new Date(a.pinned_until) > now
            return (
              <li key={a.id} className="flex flex-col gap-1.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  {later ? (
                    <span className="min-w-0 text-[15px] font-bold">{a.title}</span>
                  ) : (
                    <Link to={`/app/fil/${a.id}`} className="min-w-0 text-[15px] font-bold text-ink no-underline hover:underline">
                      {a.title}
                    </Link>
                  )}
                  {later ? (
                    <Pill tone="safran" icon={<Clock className="size-3.5" />}>
                      {dateTime(a.published_at)}
                    </Pill>
                  ) : (
                    <Pill>Vue par {a.views}</Pill>
                  )}
                </div>
                <p className="m-0 text-[13px] text-muted">
                  {later ? 'Programmée' : shortDate(a.published_at)} · {a.written_by_name}
                  {a.audience !== 'tous' ? ` · pour ${AUDIENCES.find((x) => x.value === a.audience)?.short}` : ''}
                  {pinned ? ' · épinglée' : ''}
                </p>
                {writes ? (
                  <div className="flex gap-4 text-[13px] font-bold">
                    {pinned ? (
                      <button type="button" onClick={() => unpin(a.id)} className="flex items-center gap-1 text-muted hover:text-ink">
                        <PinOff className="size-3.5" /> Retirer l'épingle
                      </button>
                    ) : null}
                    <button type="button" onClick={() => setRemoving({ id: a.id, title: a.title })} className="flex items-center gap-1 text-danger hover:underline">
                      <Trash2 className="size-3.5" /> Supprimer
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : list.isPending ? null : (
        <EmptyState title="Aucune annonce pour le moment" icon={<Megaphone className="size-6" />} />
      )}
    </Card>
  )

  if (list.isPending && !writes) return <PageLoader />

  return (
    <BureauPage
      title="Annonces officielles"
      subtitle="Publiées au nom du bureau. Elles passent en tête du fil avec le badge Officiel."
      actions={scheduled ? <Pill tone="safran" icon={<Clock className="size-3.5" />} className="h-10 px-4 text-[14px]">Programmées · {scheduled}</Pill> : null}
    >
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6">
        {form}
        <div className="flex flex-col gap-3 lg:gap-4">
          {writes ? (
            <div>
              <p className="m-0 mb-2.5 px-1 text-[11px] font-bold tracking-[0.08em] text-muted uppercase">Aperçu dans le fil</p>
              <PostCard
                post={preview}
                preview
                pinned={pin}
                className="rounded-[22px]"
                mediaSlot={
                  media.list.length ? (
                    <div className="px-4 pb-2">
                      <AttachmentPreviews media={media} readOnly />
                    </div>
                  ) : null
                }
              />
            </div>
          ) : null}
          {recent}
        </div>
      </div>

      <Dialog
        open={scheduling}
        onClose={() => setScheduling(false)}
        title="Programmer l'annonce"
        description="Elle apparaîtra dans le fil à l'heure choisie. D'ici là, seul le bureau la voit."
        footer={
          <>
            <Button variant="outline" onClick={() => setScheduling(false)} className="flex-1">
              Annuler
            </Button>
            <Button onClick={() => when && publish(new Date(when))} busy={busy === 'programmer'} disabled={!when} className="flex-1">
              Programmer
            </Button>
          </>
        }
      >
        <TextField
          label="Date et heure"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          min={localInput(new Date(now.getTime() + 10 * 60_000))}
          max={localInput(new Date(now.getTime() + 89 * 86_400_000))}
          hint={pin ? (<><Pin className="size-3.5" /> Épinglée 7 jours à partir de sa parution.</>) : undefined}
        />
        <ErrorNote error={error} className="mt-3" />
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        title="Supprimer l'annonce ?"
        description={removing ? `« ${removing.title} » disparaît du fil de tous les membres. La suppression va au journal.` : ''}
        confirm="Supprimer"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const { data, error } = await supabase.rpc('delete_announcement', { p_id: removing!.id })
          if (error) throw error
          await removeFiles('publications', data ?? [])
          await refresh()
          toast('Annonce supprimée.')
        }}
      />
    </BureauPage>
  )
}
