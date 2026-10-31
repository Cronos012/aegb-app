import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Ban, Check, ChevronRight, Info, ListOrdered, MessageCircle, ThumbsDown, ThumbsUp, Users } from 'lucide-react'
import { Avatar } from '../Avatar'
import { ButtonLink } from '../Button'
import { Dialog } from '../Dialog'
import { Pill } from '../Pill'
import { euros } from '../../lib/dues'
import {
  agendaLine,
  candidatesLine,
  dayShort,
  hour,
  personLine,
  stepOf,
  votants,
  type Assembly,
  type Ballot,
  type Candidacy,
  type VoteRight,
} from '../../lib/elections'

/* ----------------------------------------------------------------------------
   La participation : « 52 votants sur 96 », la barre et le trait du quorum.
---------------------------------------------------------------------------- */

export function Participation({ ballot, dark = false, compact = false }: { ballot: Pick<Ballot, 'voters' | 'electors' | 'quorum' | 'quorum_reached_at'>; dark?: boolean; compact?: boolean }) {
  const { voters, electors, quorum } = ballot
  const fill = electors ? Math.min(100, (100 * voters) / electors) : 0
  const mark = electors && quorum ? Math.min(100, (100 * quorum) / electors) : null
  const reached = quorum === 0 || voters >= quorum
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${compact ? 'text-[13px]' : 'text-[15px]'}`}>
        <span className={dark ? 'text-white/80' : 'text-muted'}>
          <strong className={dark ? 'text-white' : 'text-ink'}>
            {voters} votant{voters > 1 ? 's' : ''}
          </strong>{' '}
          sur {electors}
        </span>
        {quorum === 0 ? (
          <span className={`font-bold ${dark ? 'text-white/80' : 'text-muted'}`}>Sans quorum</span>
        ) : reached ? (
          <span className={`inline-flex items-center gap-1 font-bold ${dark ? 'text-[#7FE0A8]' : 'text-ok'}`}>
            <Check className="size-4" strokeWidth={2.6} /> Quorum de {quorum} atteint
          </span>
        ) : (
          <span className={`font-bold ${dark ? 'text-white/80' : 'text-muted'}`}>Quorum : {votants(quorum)}</span>
        )}
      </div>
      <div className={`relative h-2.5 rounded-full ${dark ? 'bg-white/90' : 'bg-line-soft'}`} role="img" aria-label={`${votants(voters)} sur ${electors}${quorum ? `, quorum de ${quorum}` : ''}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-ok" style={{ width: `${fill}%` }} />
        {mark !== null ? <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-nuit" style={{ left: `calc(${mark}% - 1px)` }} /> : null}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------------
   La frise de l'AG, côté membre : convocation, candidatures, vote, résultats.
---------------------------------------------------------------------------- */

export function Frise({ a }: { a: Assembly }) {
  const step = stepOf(a)
  const hasElection = a.seats.length > 0
  const steps = [
    { label: 'Convocation', date: a.convened_at ? dayShort(a.convened_at) : '' },
    hasElection
      ? { label: 'Candidatures', date: a.candidacy_until ? (step <= 1 ? `jusqu’au ${dayShort(a.candidacy_until)}` : dayShort(a.candidacy_until)) : '' }
      : { label: 'Ordre du jour', date: 'envoyé' },
    { label: 'Vote', date: dayShort(a.vote_opens_at) },
    { label: 'Résultats', date: a.published_at ? dayShort(a.published_at) : step >= 2 ? `après ${hour(a.vote_closes_at)}` : `le ${dayShort(a.vote_closes_at)}` },
  ]
  // L'étape en cours : candidatures avant le vote (ou la convocation si les candidatures sont closes).
  const current = step === 1 ? (a.candidacy_until && new Date(a.candidacy_until) > new Date(a.now) ? 1 : 2) : step === 3 && a.status !== 'publiee' ? 3 : step
  return (
    <ol className="m-0 grid list-none grid-cols-4 p-0" aria-label="Calendrier de l’assemblée générale">
      {steps.map((s, i) => {
        const done = i < current || a.status === 'publiee'
        const now = i === current && a.status !== 'publiee'
        return (
          <li key={s.label} className="relative flex flex-col items-center gap-1.5 text-center">
            {i > 0 ? <span className={`absolute top-[13px] right-1/2 left-[-50%] h-[3px] ${i <= current || a.status === 'publiee' ? 'bg-ok' : 'bg-line-soft'}`} aria-hidden="true" /> : null}
            <span
              className={`relative grid size-7 place-items-center rounded-full ${
                done ? 'bg-ok text-white' : now ? 'bg-leppi ring-4 ring-safran/60' : 'border-2 border-line bg-surface'
              }`}
              aria-hidden="true"
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : null}
            </span>
            <span className={`text-[12px] font-bold leading-tight tracking-tight ${done || now ? 'text-ink' : 'text-muted'}`}>{s.label}</span>
            <span className="text-xs leading-tight text-muted">{s.date}</span>
            <span className="sr-only">{done ? 'fait' : now ? 'en cours' : 'à venir'}</span>
          </li>
        )
      })}
    </ol>
  )
}

/* ----------------------------------------------------------------------------
   Mon droit de vote, toujours dit avec sa raison.
---------------------------------------------------------------------------- */

export function RightCard({ right, lateCents, lateMonths, voteOpen }: { right: VoteRight; lateCents: number | null; lateMonths: string | null; voteOpen: boolean }) {
  if (right === 'actif') {
    return (
      <div className="flex items-center gap-3.5 rounded-[12px] bg-ok-soft px-4 py-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ok text-white">
          <Check className="size-5" strokeWidth={2.8} />
        </span>
        <span className="flex min-w-0 flex-col">
          <strong className="text-[17px] leading-tight text-ok">Ton droit de vote est actif</strong>
          <span className="text-sm text-ink/80">Statut étudiant et cotisation à jour (articles 7 et 32)</span>
        </span>
      </div>
    )
  }
  if (right === 'suspendu') {
    return (
      <div className="flex flex-col gap-3.5 rounded-[12px] border-2 border-danger/30 bg-danger-soft/60 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
            <Ban className="size-5" />
          </span>
          <strong className="titre text-[22px] leading-tight text-danger">Ton droit de vote est suspendu</strong>
        </div>
        <p className="m-0 text-[15px] leading-[1.5]">
          {lateMonths ? `Ta cotisation ${lateMonths} n’est pas réglée` : 'Ta cotisation n’est pas à jour'} : tu ne peux ni voter ni te présenter au bureau (article 32 des statuts).
        </p>
        <ButtonLink to="/app/cotisation/payer">{lateCents ? `Régler ${euros(lateCents)} maintenant` : 'Régler mon retard'}</ButtonLink>
        <p className="m-0 flex items-start gap-2 text-[13px] leading-[1.45] text-muted">
          <Info className="mt-px size-4 shrink-0" />
          {voteOpen ? 'Dès que c’est payé, tu peux voter, même pendant le vote.' : 'Dès que c’est payé, tu retrouves ton droit de vote.'}
        </p>
      </div>
    )
  }
  if (right === 'consultatif') {
    return (
      <div className="flex items-center gap-3.5 rounded-[12px] bg-surface-2 px-4 py-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-select text-ink">
          <MessageCircle className="size-5" />
        </span>
        <span className="flex min-w-0 flex-col">
          <strong className="text-[16px] leading-tight">Tu as voix consultative</strong>
          <span className="text-sm text-muted">Tu participes à l’AG et tu donnes ton avis ; seuls les étudiants actifs votent (article 7).</span>
        </span>
      </div>
    )
  }
  return null
}

/* ----------------------------------------------------------------------------
   Ordre du jour et candidats, en liste et en fenêtre.
---------------------------------------------------------------------------- */

const ITEM_PILLS = {
  resolution: { label: 'Résolution', tone: 'brand' as const },
  election: { label: 'Élection', tone: 'safran' as const },
  discussion: { label: 'Sans vote', tone: 'neutral' as const },
}

export function AgendaList({ a }: { a: Assembly }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {a.items.map((i) => (
        <li key={i.id} className="flex items-center gap-3 border-t border-line-soft py-3 first:border-0">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-extrabold">{i.position}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-bold leading-snug">{i.title}</span>
            {i.detail ? <span className="text-[13px] leading-snug text-muted">{i.detail}</span> : null}
            {i.kind === 'election' ? <span className="text-[13px] text-muted">{i.seats.length} poste{i.seats.length > 1 ? 's' : ''}</span> : null}
          </span>
          <Pill tone={ITEM_PILLS[i.kind].tone}>{ITEM_PILLS[i.kind].label}</Pill>
        </li>
      ))}
    </ol>
  )
}

export function CandidateHead({ c, size = 44 }: { c: Candidacy; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar person={c.member} size={size} />
      <span className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <strong className="text-[16px] leading-tight">
            {c.member.first_name} {c.member.last_name}
          </strong>
          {c.outgoing ? <Pill tone="brand">Bureau sortant</Pill> : null}
        </span>
        {personLine(c.member) ? <span className="truncate text-[13px] text-muted">{personLine(c.member)}</span> : null}
      </span>
    </span>
  )
}

export function CandidatesList({ a, onRead }: { a: Assembly; onRead: (c: Candidacy) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {a.seats.map((s) => (
        <section key={s.role} className="flex flex-col gap-2">
          <h3 className="m-0 text-xs font-extrabold tracking-[0.08em] text-muted uppercase">{s.label}</h3>
          {s.candidates.length ? (
            s.candidates.map((c) => (
              <button key={c.id} type="button" onClick={() => onRead(c)} className="flex flex-col gap-2 rounded-[12px] border-[1.5px] border-line-soft bg-surface p-3.5 text-left hover:bg-surface-2">
                <CandidateHead c={c} />
                <span className="line-clamp-2 text-sm leading-[1.45] text-ink/85">« {c.statement} »</span>
              </button>
            ))
          ) : (
            <p className="m-0 text-sm text-muted">Aucun candidat pour l’instant.</p>
          )}
        </section>
      ))}
    </div>
  )
}

export function StatementDialog({ c, label, onClose }: { c: Candidacy | null; label?: string; onClose: () => void }) {
  return (
    <Dialog open={!!c} onClose={onClose} title={c ? `${c.member.first_name} ${c.member.last_name}` : ''} description={label ? `Candidature : ${label}` : undefined}>
      {c ? (
        <div className="flex flex-col gap-3 pb-2">
          <CandidateHead c={c} size={52} />
          <p className="m-0 text-[15px] leading-[1.6] whitespace-pre-line">{c.statement}</p>
        </div>
      ) : null}
    </Dialog>
  )
}

/** Les deux lignes « Ordre du jour » et « Les candidats », qui ouvrent chacune une fenêtre. */
export function AgendaLinks({ a }: { a: Assembly }) {
  const [open, setOpen] = useState<'agenda' | 'candidats' | null>(null)
  const [reading, setReading] = useState<Candidacy | null>(null)
  const labels = new Map(a.seats.map((s) => [s.role, s.label]))
  return (
    <>
      <div className="overflow-hidden rounded-[12px] bg-surface shadow-[0_1px_0_rgba(18,24,61,0.04)]">
        <LinkRow icon={<ListOrdered className="size-5" />} tone="bg-select text-ink" title="Ordre du jour" detail={agendaLine(a)} onClick={() => setOpen('agenda')} />
        {a.seats.length ? (
          <LinkRow icon={<Users className="size-5" />} tone="bg-safran-pale text-[#163F93]" title="Les candidats" detail={candidatesLine(a)} onClick={() => setOpen('candidats')} />
        ) : null}
      </div>
      <Dialog open={open === 'agenda'} onClose={() => setOpen(null)} title="Ordre du jour" description="Seuls ces points peuvent être votés (article 12).">
        <AgendaList a={a} />
      </Dialog>
      <Dialog open={open === 'candidats'} onClose={() => setOpen(null)} title="Les candidats" description="Les candidatures validées par le bureau (article 15).">
        <CandidatesList a={a} onRead={setReading} />
      </Dialog>
      <StatementDialog c={reading} label={reading ? labels.get(reading.role) : undefined} onClose={() => setReading(null)} />
    </>
  )
}

function LinkRow({ icon, tone, title, detail, onClick }: { icon: ReactNode; tone: string; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3.5 border-t border-line-soft px-4 py-3.5 text-left first:border-0 hover:bg-surface-2">
      <span className={`grid size-11 shrink-0 place-items-center rounded-[14px] ${tone}`}>{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[16px] font-bold">{title}</span>
        <span className="truncate text-sm text-muted">{detail}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </button>
  )
}

/* ----------------------------------------------------------------------------
   Les cartes de choix de l'isoloir.
---------------------------------------------------------------------------- */

/** Une carte de choix. « after » se place sous le texte, hors de l'étiquette (un lien « Lire sa présentation », par exemple). */
export function ChoiceCard({ selected, onSelect, dashed = false, children, name, after }: { selected: boolean; onSelect: () => void; dashed?: boolean; children: ReactNode; name: string; after?: ReactNode }) {
  return (
    <div
      className={`rounded-[12px] transition-colors ${
        selected ? 'border-2 border-leppi bg-select ring-4 ring-safran/45' : dashed ? 'border-[1.5px] border-dashed border-line bg-surface hover:bg-surface-2' : 'border-[1.5px] border-line bg-surface hover:bg-surface-2'
      }`}
    >
      <label className="flex cursor-pointer items-start gap-3.5 p-4">
        <input type="radio" name={name} checked={selected} onChange={onSelect} className="peer sr-only" />
        <span
          className={`mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-link ${selected ? 'border-leppi bg-leppi' : 'border-line bg-surface'}`}
          aria-hidden="true"
        >
          {selected ? <span className="size-2 rounded-full bg-white" /> : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">{children}</span>
      </label>
      {after ? <div className="-mt-2.5 pr-4 pb-4 pl-[52px]">{after}</div> : null}
    </div>
  )
}

export function ForAgainst({ value, onChange, name, single }: { value: string | undefined; onChange: (v: string) => void; name: string; single: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <ChoiceCard name={name} selected={value === 'pour'} onSelect={() => onChange('pour')}>
        <span className="flex items-center gap-2 text-[18px] font-extrabold text-ok">
          <ThumbsUp className="size-5" /> Pour
        </span>
        <span className="text-sm text-muted">{single ? 'La candidature passe si les « pour » dépassent les « contre ».' : 'J’approuve la résolution.'}</span>
      </ChoiceCard>
      <ChoiceCard name={name} selected={value === 'contre'} onSelect={() => onChange('contre')}>
        <span className="flex items-center gap-2 text-[18px] font-extrabold text-danger">
          <ThumbsDown className="size-5" /> Contre
        </span>
        <span className="text-sm text-muted">{single ? 'Sinon, le poste reste vacant et une élection partielle suit.' : 'Je la rejette.'}</span>
      </ChoiceCard>
      {single ? (
        <ChoiceCard name={name} dashed selected={value === 'blanc'} onSelect={() => onChange('blanc')}>
          <span className="text-[18px] font-extrabold">Je vote blanc</span>
          <span className="text-sm text-muted">Ton vote compte dans la participation, pas dans les suffrages exprimés.</span>
        </ChoiceCard>
      ) : (
        <ChoiceCard name={name} dashed selected={value === 'abstention'} onSelect={() => onChange('abstention')}>
          <span className="text-[18px] font-extrabold">Abstention</span>
          <span className="text-sm text-muted">Je ne me prononce pas.</span>
        </ChoiceCard>
      )}
    </div>
  )
}

/** Le lien « Voter » ou « Voir l'assemblée générale ». */
export function VoteLink({ to = '/app/votes/isoloir', children }: { to?: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-safran text-[16px] font-extrabold text-white no-underline hover:brightness-95">
      {children}
    </Link>
  )
}
