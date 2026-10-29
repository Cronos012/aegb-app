import { useState } from 'react'
import { Link } from 'react-router'
import { Calendar, Check, GraduationCap, Lock, LogOut, MapPin, ScrollText, SlidersHorizontal } from 'lucide-react'
import { signOut } from '../../auth/session'
import { Avatar } from '../../components/Avatar'
import { Button, ButtonLink } from '../../components/Button'
import { Cover } from '../../components/Cover'
import { Dialog } from '../../components/Dialog'
import { ErrorNote, Spinner } from '../../components/Feedback'
import { NewMembers } from '../../components/feed/NewMembers'
import { PostsGrid } from '../../components/feed/PostsGrid'
import { Pill } from '../../components/Pill'
import { monthYear, TYPE_LABELS } from '../../lib/format'
import { useMemberPosts } from '../../lib/feed'
import { useMe, type Me } from '../../lib/queries'

function completion(me: Me) {
  const p = me.profile
  return [
    { label: 'Ta bio', done: !!p.bio?.trim() },
    { label: 'Ta ville et ta formation', done: !!p.city?.trim() && !!(p.school?.trim() || p.formation?.trim()) },
    { label: 'Ton téléphone', done: !!me.contact?.phone?.trim() },
    { label: 'Ta photo de profil', done: !!p.avatar_path },
  ]
}

function About({ me }: { me: Me }) {
  const p = me.profile
  const rows: [string, string | null | undefined, boolean?][] = [
    ['École', p.school],
    ['Formation', p.formation],
    ['Ville', p.city],
    ['Email', me.contact?.email],
    ['Téléphone', me.contact?.phone, true],
    ['Membre depuis', p.validated_at ? monthYear(p.validated_at) : null],
  ]
  return (
    <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-3.5 px-5 py-5 text-[15px] lg:px-6">
      {rows.map(([label, value, privateValue]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="m-0 min-w-0 break-words">
            {value || <span className="text-muted">Non renseigné</span>}
            {privateValue && value ? (
              <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <Lock className="size-3" /> Visible seulement par le bureau
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function Profil() {
  const me = useMe().data!
  const p = me.profile
  const [tab, setTab] = useState<'publications' | 'apropos'>('publications')
  const [menu, setMenu] = useState(false)
  const steps = completion(me)
  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100)
  const posts = useMemberPosts(p.id)

  const school = [p.school, p.formation].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 lg:px-10 lg:py-8">
      <section className="flex-1 bg-surface lg:overflow-hidden lg:rounded-[26px]">
        <Cover path={p.cover_path} className="h-[150px] pt-[env(safe-area-inset-top)] lg:h-[170px]" />
        <div className="px-5 lg:px-6">
          <div className="flex items-end justify-between gap-3">
            <div className="-mt-[56px] lg:-mt-[64px]">
              <Avatar person={p} size={104} ring />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <ButtonLink to="/app/profil/modifier" size="md">
                Modifier le profil
              </ButtonLink>
              <button type="button" onClick={() => setMenu(true)} aria-label="Plus d'options" className="grid size-11 place-items-center rounded-xl border-[1.5px] border-line text-ink lg:hidden">
                <SlidersHorizontal className="size-5" />
              </button>
            </div>
          </div>
          <h1 className="titre mt-3.5 mb-0 text-[28px] leading-tight">
            {p.first_name} {p.last_name}
          </h1>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Pill tone="brand">{TYPE_LABELS[p.member_type]}</Pill>
            <Pill tone="ok" icon={<Check className="size-3.5" strokeWidth={3} />}>
              Membre validé
            </Pill>
            {me.role ? <Pill tone="safran">{me.role.label}</Pill> : null}
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
              ['publications', posts.data ? `Publications · ${posts.data.count}` : 'Publications'],
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
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="m-0 text-[14px] text-muted">Tes photos et tes publications apparaîtront ici.</p>
                <ButtonLink to="/app/publier" size="md" variant="outline">
                  Publier
                </ButtonLink>
              </div>
            )}
          </div>
        ) : (
          <About me={me} />
        )}
      </section>

      <aside className="hidden flex-col gap-6 lg:flex">
        <div className="rounded-[22px] bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="titre m-0 text-[19px]">Complète ton profil</h2>
            <span className="text-sm font-bold">{percent} %</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line-soft">
            <div className="h-full rounded-full" style={{ width: `${percent}%`, background: 'linear-gradient(90deg, #CE1126, #FCD116, #009460)' }} />
          </div>
          <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
            {steps.map((s) => (
              <li key={s.label} className={`flex items-center gap-2.5 text-sm ${s.done ? 'text-muted line-through' : 'font-bold'}`}>
                {s.done ? (
                  <span className="grid size-5 place-items-center rounded-full bg-ok-soft text-ok">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="size-5 rounded-full border-2 border-ink" />
                )}
                {s.label}
              </li>
            ))}
          </ul>
          {percent < 100 ? (
            <ButtonLink to="/app/profil/modifier" variant="outline" size="md" className="mt-4 w-full">
              Compléter mon profil
            </ButtonLink>
          ) : null}
        </div>
        <NewMembers />
      </aside>

      <Dialog open={menu} onClose={() => setMenu(false)} title="Mon compte">
        <div className="flex flex-col gap-2 pb-2">
          <Link to="/charte" className="flex h-12 items-center gap-3 rounded-xl px-2 text-[15px] font-semibold text-ink no-underline hover:bg-surface-2">
            <ScrollText className="size-5 text-muted" /> Charte des membres
          </Link>
          <Button variant="danger-outline" icon={<LogOut className="size-5" />} onClick={signOut} className="mt-2">
            Se déconnecter
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
