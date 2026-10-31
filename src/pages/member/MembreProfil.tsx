import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, Calendar, ChevronLeft, ClipboardList, GraduationCap, MapPin, MessageSquare, MoreHorizontal, Star, UserX } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { Cover } from '../../components/Cover'
import { EmptyState, ErrorNote, PageLoader, Spinner } from '../../components/Feedback'
import { Pill } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { ActionSheet, SheetAction } from '../../components/feed/Dialogs'
import { NewMembers } from '../../components/feed/NewMembers'
import { PostsGrid } from '../../components/feed/PostsGrid'
import { BlockDialog } from '../../components/messages/BlockDialog'
import { errorMessage } from '../../lib/errors'
import { useMemberPosts, useProfile, type PublicProfile } from '../../lib/feed'
import { monthYear, TYPE_LABELS } from '../../lib/format'
import { openPrivate, setBlocked, useBlocks } from '../../lib/messages'
import { can, useMe } from '../../lib/queries'

function About({ p }: { p: PublicProfile }) {
  const rows: [string, string | null | undefined][] = [
    ['École', p.school],
    ['Formation', p.formation],
    ['Ville', p.city],
    ['Membre depuis', p.validated_at ? monthYear(p.validated_at) : null],
  ]
  return (
    <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-3.5 px-5 py-5 text-[15px] lg:px-6">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="m-0 min-w-0 break-words">{value || <span className="text-muted">Non renseigné</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Le profil d'un autre membre : ce qu'il a choisi de montrer, et ses publications. */
export function MembreProfil() {
  const { id } = useParams()
  const me = useMe().data!
  const navigate = useNavigate()
  const toast = useToast()
  const profile = useProfile(id)
  const posts = useMemberPosts(id)
  const [tab, setTab] = useState<'publications' | 'apropos'>('publications')
  const [menu, setMenu] = useState(false)
  const [block, setBlock] = useState<{ id: string; first_name: string } | null>(null)
  const [opening, setOpening] = useState(false)
  const queryClient = useQueryClient()
  const blocked = useBlocks().data?.has(id ?? '') ?? false

  if (id === me.profile.id) return <Navigate to="/app/profil" replace />
  if (profile.isPending) return <PageLoader />
  const p = profile.data
  const seesFile = can(me, 'membres', 'lecture')

  if (!p || p.status !== 'actif') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
        <ErrorNote error={profile.error} className="w-full max-w-sm" />
        <EmptyState title="Ce profil n'est pas disponible" icon={<UserX className="size-6" />}>
          Le compte n'est plus actif, ou le lien n'est pas le bon.
        </EmptyState>
        <Button variant="outline" size="md" onClick={() => navigate('/app/membres')}>
          Voir l'annuaire
        </Button>
      </div>
    )
  }

  const school = [p.school, p.formation].filter(Boolean).join(' · ')

  async function write() {
    setOpening(true)
    try {
      navigate(`/app/messages/${await openPrivate(p!.id)}`)
    } catch (e) {
      toast(errorMessage(e), 'error')
      setOpening(false)
    }
  }

  async function unblock() {
    try {
      await setBlocked(p!.id, false)
      await queryClient.invalidateQueries({ queryKey: ['messages'] })
      toast(`Tu as débloqué ${p!.first_name}.`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }
  const count = posts.data?.count ?? 0

  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 lg:px-10 lg:py-8">
      <section className="flex-1 bg-surface lg:overflow-hidden lg:rounded-[26px]">
        <div className="relative">
          <Cover path={p.cover_path} className="h-[150px] pt-[env(safe-area-inset-top)] lg:h-[170px]" />
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Retour"
            className="absolute top-[max(env(safe-area-inset-top),12px)] left-3 grid size-11 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm hover:bg-black/35"
          >
            <ChevronLeft className="size-6" strokeWidth={2.2} />
          </button>
        </div>
        <div className="px-5 lg:px-6">
          <div className="flex items-end justify-between gap-3">
            <div className="relative z-10 -mt-[56px] lg:-mt-[64px]">
              <Avatar person={p} size={104} ring />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Button size="md" icon={<MessageSquare className="size-5" />} busy={opening} onClick={write}>
                Écrire
              </Button>
              <button type="button" onClick={() => setMenu(true)} aria-label="Plus d'options" className="grid size-11 place-items-center rounded-xl border-[1.5px] border-line bg-surface text-ink hover:bg-surface-2">
                <MoreHorizontal className="size-5" />
              </button>
            </div>
          </div>
          <h1 className="titre mt-3.5 mb-0 text-[28px] leading-tight">
            {p.first_name} {p.last_name}
          </h1>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Pill tone="brand">{TYPE_LABELS[p.member_type]}</Pill>
            {p.role ? (
              <Pill tone="safran" icon={<Star className="size-3.5" />}>
                {p.role.label}
              </Pill>
            ) : null}
          </div>
          {p.bio ? <p className="mt-3.5 mb-0 text-[15px] leading-[1.5]">{p.bio}</p> : null}
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[13px] text-muted">
            {p.city ? (
              <li className="flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {p.city}
              </li>
            ) : null}
            {school ? (
              <li className="flex items-center gap-1.5">
                <GraduationCap className="size-3.5" /> {school}
              </li>
            ) : null}
            {p.validated_at ? (
              <li className="flex items-center gap-1.5">
                <Calendar className="size-3.5" /> Membre depuis {monthYear(p.validated_at)}
              </li>
            ) : null}
          </ul>
        </div>
        <div className="mt-5 flex gap-6 border-b border-line-soft px-5 lg:px-6" role="tablist">
          {(
            [
              ['publications', posts.data ? `Publications · ${count}` : 'Publications'],
              ['apropos', 'À propos'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-[3px] pb-2.5 text-[15px] font-bold ${tab === key ? 'border-safran text-ink' : 'border-transparent text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'publications' ? (
          <div className="px-4 py-4 lg:px-6 lg:py-5">
            <ErrorNote error={posts.error} />
            {posts.isPending ? (
              <div className="grid place-items-center py-8">
                <Spinner />
              </div>
            ) : posts.data?.posts.length ? (
              <PostsGrid posts={posts.data.posts} />
            ) : (
              <p className="m-0 py-8 text-center text-[14px] text-muted">{p.first_name} n'a encore rien publié.</p>
            )}
          </div>
        ) : (
          <About p={p} />
        )}
      </section>

      <aside className="hidden flex-col gap-6 lg:flex">
        <NewMembers />
      </aside>

      <ActionSheet open={menu} onClose={() => setMenu(false)} title={`${p.first_name} ${p.last_name}`}>
        {seesFile ? (
          <SheetAction icon={<ClipboardList className="size-5" />} onClick={() => navigate(`/bureau/membres/${p.id}`)} hint="Coordonnées, historique et avertissements. Pour le bureau.">
            Voir sa fiche
          </SheetAction>
        ) : null}
        {blocked ? (
          <SheetAction
            icon={<Ban className="size-5" />}
            hint="Ses messages privés t’arriveront de nouveau"
            onClick={() => {
              setMenu(false)
              unblock()
            }}
          >
            Débloquer {p.first_name}
          </SheetAction>
        ) : (
          <SheetAction
            icon={<Ban className="size-5" />}
            danger
            hint="Tu ne recevras plus ses messages privés"
            onClick={() => {
              setMenu(false)
              setBlock({ id: p.id, first_name: p.first_name })
            }}
          >
            Bloquer {p.first_name}
          </SheetAction>
        )}
      </ActionSheet>
      <BlockDialog member={block} onClose={() => setBlock(null)} />
    </div>
  )
}
