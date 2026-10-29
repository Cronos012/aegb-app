import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Briefcase, Calendar, ChevronRight, FileText, LogOut, Shield, SquareCheckBig, UserPen, Users, X } from 'lucide-react'
import { signOut } from '../../auth/session'
import { Avatar } from '../../components/Avatar'
import { useDirectory } from '../../lib/feed'
import { isBureau, useMe } from '../../lib/queries'

function Tile({ to, icon, tone, title, detail, soon = false }: { to: string; icon: ReactNode; tone: string; title: string; detail: string; soon?: boolean }) {
  return (
    <Link to={to} className="relative flex flex-col rounded-[20px] border border-line bg-surface p-4 text-ink no-underline hover:bg-surface-2">
      <span className={`grid size-12 place-items-center rounded-2xl ${tone}`}>{icon}</span>
      <span className="mt-3.5 text-[17px] font-extrabold">{title}</span>
      <span className="text-[14px] text-muted">{detail}</span>
      {soon ? <span className="absolute top-3 right-3 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">bientôt</span> : null}
    </Link>
  )
}

function Row({ to, onClick, icon, children, danger = false }: { to?: string; onClick?: () => void; icon: ReactNode; children: ReactNode; danger?: boolean }) {
  const body = (
    <>
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${danger ? 'bg-danger-soft text-danger' : 'bg-select text-ink'}`}>{icon}</span>
      <span className={`flex-1 text-[16px] font-bold ${danger ? 'text-danger' : ''}`}>{children}</span>
      {danger ? null : <ChevronRight className="size-5 text-muted" />}
    </>
  )
  const cls = 'flex w-full items-center gap-4 px-4 py-3 text-left text-ink no-underline hover:bg-surface-2'
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  )
}

/** Tout ce qui ne tient pas dans la barre du bas. */
export function Menu() {
  const me = useMe().data!
  const navigate = useNavigate()
  const members = useDirectory().data?.length

  return (
    <div className="flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-[640px] lg:py-8">
      <header className="bg-tisse px-5 pt-[max(env(safe-area-inset-top),16px)] pb-12 text-white lg:rounded-t-[26px]">
        <div className="flex items-center justify-between">
          <h1 className="titre m-0 text-[32px]">Menu</h1>
          <button type="button" onClick={() => navigate(-1)} aria-label="Fermer le menu" className="grid size-11 place-items-center rounded-full bg-white/12 hover:bg-white/20">
            <X className="size-6" />
          </button>
        </div>
        <Link to="/app/profil" className="mt-5 flex items-center gap-4 text-white no-underline">
          <Avatar person={me.profile} size={64} ring />
          <span className="min-w-0 flex-1">
            <span className="titre block truncate text-[22px]">
              {me.profile.first_name} {me.profile.last_name}
            </span>
            <span className="block text-[14px] text-white/80">Voir mon profil</span>
          </span>
          <ChevronRight className="size-6" />
        </Link>
      </header>

      <div className="relative -mt-6 flex flex-1 flex-col gap-4 rounded-t-[26px] bg-surface px-4 pt-6 pb-8 lg:rounded-b-[26px]">
        <div className="grid grid-cols-2 gap-3">
          <Tile to="/app/evenements" icon={<Calendar className="size-6" />} tone="bg-danger-soft text-danger" title="Événements" detail="Soirées, ateliers" soon />
          <Tile to="/app/votes" icon={<SquareCheckBig className="size-6" />} tone="bg-safran-pale text-[#6B4A00]" title="Votes" detail="Élections du bureau" soon />
          <Tile to="/app/documents" icon={<FileText className="size-6" />} tone="bg-select text-ink" title="Documents" detail="Statuts, guides" soon />
          <Tile to="/app/membres" icon={<Users className="size-6" />} tone="bg-ok-soft text-ok" title="Annuaire" detail={members ? `${members} membre${members > 1 ? 's' : ''}` : 'Les membres'} />
        </div>

        <div className="overflow-hidden rounded-[20px] border border-line">
          <Row to="/app/profil/modifier" icon={<UserPen className="size-5" />}>
            Modifier mon profil
          </Row>
          <div className="h-px bg-line-soft" />
          <Row to="/charte" icon={<Shield className="size-5" />}>
            La charte
          </Row>
          {isBureau(me) ? (
            <>
              <div className="h-px bg-line-soft" />
              <Row to="/bureau" icon={<Briefcase className="size-5" />}>
                Mode bureau
              </Row>
            </>
          ) : null}
          <div className="h-px bg-line-soft" />
          <Row onClick={signOut} icon={<LogOut className="size-5" />} danger>
            Se déconnecter
          </Row>
        </div>
      </div>
    </div>
  )
}
