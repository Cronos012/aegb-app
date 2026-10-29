import { useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, EyeOff, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { EmptyState, ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { Pill } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { HideDialog } from '../../components/feed/Dialogs'
import { MediaThumb } from '../../components/feed/Media'
import { RichText } from '../../components/feed/RichText'
import { errorMessage } from '../../lib/errors'
import { orNull, REASON_LABELS, useModerationDecisions, useModerationQueue, type QueueItem, type ReportReason } from '../../lib/feed'
import { longDate, relative, shortDate } from '../../lib/format'
import { can, useCharter, useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { BureauPage, Card, Chips } from './BureauPage'

type Tab = 'examiner' | 'traites'

function reasonsByCount(item: QueueItem): ReportReason[] {
  return (Object.keys(item.reasons) as ReportReason[]).sort((a, b) => (item.reasons[b] ?? 0) - (item.reasons[a] ?? 0))
}

const DECISIONS = { garder: 'Gardé', masquer: 'Masqué', masquer_avertir: 'Masqué avec avertissement' } as const

function QueueCard({ item, manage }: { item: QueueItem; manage: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [hide, setHide] = useState<null | { warn: boolean }>(null)
  const [keeping, setKeeping] = useState(false)
  const reasons = reasonsByCount(item)
  const isPost = !!item.post_id
  const first = item.author_first_name ?? 'Le membre'
  const name = item.author_first_name ? `${item.author_first_name} ${item.author_last_name ?? ''}`.trim() : 'Membre parti'
  const postLink = `/app/fil/${item.post_id ?? item.parent_post_id}`

  async function keep() {
    setKeeping(true)
    const { error } = await supabase.rpc('moderate', { p_post: orNull(item.post_id), p_comment: orNull(item.comment_id), p_decision: 'garder' })
    setKeeping(false)
    if (error) return toast(errorMessage(error), 'error')
    await queryClient.invalidateQueries({ queryKey: ['bureau'] })
    toast(isPost ? 'Publication gardée. Les signalements sont classés.' : 'Commentaire gardé. Les signalements sont classés.')
  }

  return (
    <Card className="flex flex-col gap-3.5 p-4 lg:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="danger">
          Signalé par {item.reports} membre{item.reports > 1 ? 's' : ''}
        </Pill>
        {reasons.map((r) => (
          <Pill key={r}>
            {REASON_LABELS[r]}
            {reasons.length > 1 ? ` · ${item.reasons[r]}` : ''}
          </Pill>
        ))}
        <span className="ml-auto text-[13px] text-muted">{isPost ? 'Dans le fil' : 'Dans les commentaires'}</span>
      </div>

      <div className="rounded-2xl border border-line-soft p-4">
        <div className="flex items-center gap-3">
          <Avatar person={{ id: item.author_id ?? undefined, first_name: item.author_first_name ?? '?', last_name: item.author_last_name ?? '', avatar_path: item.author_avatar_path }} size={36} />
          <div className="min-w-0">
            <p className="m-0 truncate text-[15px] font-bold">{name}</p>
            <p className="m-0 truncate text-[13px] text-muted">
              {isPost ? 'Publication' : `Commentaire sous la publication de ${item.parent_author_name}`} · {relative(item.created_at)}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-3">
          {item.body ? <RichText text={item.body} className="min-w-0 flex-1 text-[15px] leading-[1.5]" /> : <span className="flex-1 text-[14px] text-muted">Sans texte.</span>}
          {item.media_path && item.media_kind ? <MediaThumb media={{ path: item.media_path, kind: item.media_kind }} className="size-20 shrink-0 rounded-xl" /> : null}
        </div>
        <Link to={postLink} className="mt-3 inline-block text-[13px] font-bold">
          Voir dans le fil
        </Link>
      </div>

      {item.warnings ? (
        <Note>
          {first} a déjà reçu {item.warnings} avertissement{item.warnings > 1 ? 's' : ''}
          {item.last_warning_at ? `, le dernier le ${longDate(item.last_warning_at)}` : ''}
          {item.last_warning_reason ? ` : « ${item.last_warning_reason.trim().replace(/[.\s]+$/, '')} »` : ''}.
        </Note>
      ) : null}

      {manage ? (
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" size="md" icon={<Check className="size-5" />} onClick={keep} busy={keeping}>
            {isPost ? 'Garder la publication' : 'Garder le commentaire'}
          </Button>
          <Button variant="outline" size="md" icon={<EyeOff className="size-5" />} onClick={() => setHide({ warn: false })}>
            Masquer
          </Button>
          <Button variant="danger-outline" size="md" icon={<TriangleAlert className="size-5" />} onClick={() => setHide({ warn: true })} disabled={!item.author_id}>
            Masquer et avertir
          </Button>
        </div>
      ) : null}

      {hide ? (
        <HideDialog
          target={isPost ? { post: item.post_id! } : { comment: item.comment_id! }}
          firstName={first}
          initialReason={reasons[0] ?? null}
          warn={hide.warn}
          canWarn={!!item.author_id}
          onClose={() => setHide(null)}
        />
      ) : null}
    </Card>
  )
}

export default function Moderation() {
  const me = useMe().data!
  const manage = can(me, 'moderation')
  const queue = useModerationQueue()
  const decisions = useModerationDecisions()
  const charter = useCharter()
  const [tab, setTab] = useState<Tab>('examiner')

  if (queue.isPending) return <PageLoader />
  const items = queue.data ?? []
  const done = decisions.data ?? []

  const decisionLine = (d: (typeof done)[number]) =>
    `${DECISIONS[d.decision]}${d.reason ? ` (${REASON_LABELS[d.reason].toLowerCase()})` : ''} · par ${d.decided_by_name} · ${shortDate(d.created_at)}`

  return (
    <BureauPage
      title="Modération"
      subtitle="Les publications signalées par les membres. Rien n'est masqué sans une décision du bureau."
      controls={(onDark) => (
        <Chips
          label="Afficher"
          options={[
            { value: 'examiner', label: 'À examiner', count: items.length },
            { value: 'traites', label: 'Traités', count: done.length },
          ]}
          value={tab}
          onChange={setTab}
          onDark={onDark}
        />
      )}
    >
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-3 lg:gap-4">
          <ErrorNote error={queue.error} />
          {!manage ? <Note>Ton poste peut consulter la modération, pas décider.</Note> : null}
          {tab === 'examiner' ? (
            items.length ? (
              items.map((item) => <QueueCard key={item.post_id ?? item.comment_id} item={item} manage={manage} />)
            ) : (
              <Card>
                <EmptyState title="Rien à examiner" icon={<ShieldCheck className="size-6" />}>
                  Quand un membre signale une publication ou un commentaire, il arrive ici. Le bureau décide de le garder ou de le masquer.
                </EmptyState>
              </Card>
            )
          ) : (
            <Card className="p-4 lg:p-5">
              <ErrorNote error={decisions.error} />
              {done.length ? (
                <ul className="m-0 flex list-none flex-col divide-y divide-line-soft p-0">
                  {done.map((d) => (
                    <li key={d.id} className="py-3">
                      <p className="m-0 truncate text-[15px] font-bold">{d.excerpt}</p>
                      <p className="m-0 text-[13px] text-muted">
                        {d.comment_id ? 'Commentaire de ' : d.post_id ? 'Publication de ' : 'Supprimé depuis · '}
                        {d.author_name} · {decisionLine(d)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Aucune décision pour le moment" />
              )}
            </Card>
          )}
        </div>

        <aside className="hidden flex-col gap-6 lg:flex">
          {charter.data ? (
            <Card className="p-5">
              <h2 className="titre m-0 text-[19px]">La charte</h2>
              <ol className="m-0 mt-4 flex list-none flex-col gap-3.5 p-0">
                {charter.data.rules.slice(0, 4).map((r, i) => (
                  <li key={r.title} className="flex items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-safran-pale text-[13px] font-extrabold text-[#6B4A00]">{i + 1}</span>
                    <span>
                      <span className="block text-[14px] font-bold">{r.title}</span>
                      <span className="block text-[13px] text-muted">{r.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
          {done.length ? (
            <Card className="p-5">
              <h2 className="titre m-0 text-[19px]">Derniers traitements</h2>
              <ul className="m-0 mt-3 flex list-none flex-col divide-y divide-line-soft p-0">
                {done.slice(0, 3).map((d) => (
                  <li key={d.id} className="py-3">
                    <p className="m-0 truncate text-[14px] font-bold">{d.excerpt}</p>
                    <p className="m-0 text-[12px] text-muted">{decisionLine(d)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </BureauPage>
  )
}
