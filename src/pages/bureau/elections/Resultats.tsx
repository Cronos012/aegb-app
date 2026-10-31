import { useState } from 'react'
import { Link } from 'react-router'
import { Check, ChevronRight, Download, FileText, KeyRound, Megaphone, Plus, RefreshCw, SquareCheckBig, Users } from 'lucide-react'
import { Button } from '../../../components/Button'
import { Dialog } from '../../../components/Dialog'
import { Pill } from '../../../components/Pill'
import { useToast } from '../../../components/Toast'
import {
  candidacyMap,
  dayMonth,
  dayYear,
  hour,
  percent,
  plainDay,
  seatResults,
  useElectionActions,
  votants,
  type AdminView,
  type Assembly,
  type Candidacy,
  type Question,
} from '../../../lib/elections'
import { errorMessage } from '../../../lib/errors'
import { useIsDesktop } from '../../../lib/media'
import { downloadPv } from '../../../lib/pvPdf'
import { BureauPage } from '../BureauPage'
import { Panel, Steps, Tile } from './shared'

/* ----------------------------------------------------------------------------
   Les résultats : vus par le bureau seul au dépouillement, puis publiés.
---------------------------------------------------------------------------- */

export function PvButton({ a, label = 'Procès-verbal (PDF)' }: { a: Assembly; label?: string }) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  return (
    <Button
      variant="outline"
      size="md"
      busy={busy}
      icon={<Download className="size-[18px]" />}
      onClick={async () => {
        setBusy(true)
        try {
          await downloadPv(a)
        } catch {
          toast('Le procès-verbal n’a pas pu être créé. Réessaie.', 'error')
        } finally {
          setBusy(false)
        }
      }}
    >
      {label}
    </Button>
  )
}

export function Resultats({ view, full, onNew }: { view: AdminView; full: boolean; onNew: () => void }) {
  const a = view.assembly!
  const desktop = useIsDesktop()
  const toast = useToast()
  const { publish, secondRound } = useElectionActions()
  const [confirm, setConfirm] = useState<'publish' | 'second' | null>(null)
  const names = candidacyMap(a)
  const first = a.ballots.find((b) => b.round === 1)
  const second = a.ballots.find((b) => b.round === 2)
  const last = second ?? first
  const seats = seatResults(a)
  const resolutions = first?.questions.filter((q) => q.kind === 'resolution') ?? []
  const adopted = resolutions.filter((q) => q.result?.outcome === 'adoptee').length
  const filled = seats.filter((s) => s.question?.result?.outcome === 'pourvu').length
  const tie = !second && seats.some((s) => s.question?.result?.outcome === 'egalite')
  const published = a.status === 'publiee'
  const pv = <PvButton a={a} />

  const run = (what: 'publish' | 'second') =>
    (what === 'publish' ? publish : secondRound).mutateAsync(a.id).then(
      () => {
        setConfirm(null)
        toast(what === 'publish' ? 'Résultats publiés dans le fil et dans l’onglet Votes' : 'Second tour ouvert pour 30 minutes')
      },
      (e) => {
        setConfirm(null)
        toast(errorMessage(e), 'error')
      },
    )

  const actions = (
    <>
      {pv}
      {full && !published && tie ? (
        <Button variant="accent" size="md" icon={<RefreshCw className="size-[18px]" />} onClick={() => setConfirm('second')}>
          Ouvrir le second tour
        </Button>
      ) : null}
      {full && !published && !tie ? (
        <Button variant="accent" size="md" icon={<Megaphone className="size-[18px]" />} onClick={() => setConfirm('publish')}>
          Publier les résultats
        </Button>
      ) : null}
      {full && published ? (
        <Button size="md" icon={<Plus className="size-[18px]" />} onClick={onNew}>
          Préparer une nouvelle AG
        </Button>
      ) : null}
    </>
  )

  const subtitle = published
    ? `Publiés le ${dayMonth(a.published_at!)} à ${hour(a.published_at!)}, dans le fil et dans l’onglet Votes.`
    : `Vote fermé le ${dayYear(last?.closed_at ?? a.vote_closes_at)} à ${hour(last?.closed_at ?? a.vote_closes_at)}. Seul le bureau les voit pour l’instant.`

  const tiles = first ? (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Tile icon={<Users className="size-4" />} tone="bg-ok-soft text-ok" label="Participation" value={`${percent(first.voters, first.electors)} %`} detail={`${votants(first.voters)} sur ${first.electors}`} />
      <Tile
        icon={<Check className="size-4" strokeWidth={2.6} />}
        tone="bg-ok-soft text-ok"
        label="Quorum"
        value={first.quorum ? 'Atteint' : 'Sans quorum'}
        detail={first.quorum ? `Il en fallait ${first.quorum}` : 'Seconde AG ordinaire'}
      />
      <Tile icon={<FileText className="size-4" />} tone="bg-select text-ink" label="Résolutions" value={`${adopted} sur ${resolutions.length}`} detail={resolutions.length ? `adoptée${adopted > 1 ? 's' : ''}` : 'aucune résolution'} />
      <Tile
        icon={<SquareCheckBig className="size-4" />}
        tone="bg-ok-soft text-ok"
        label="Postes pourvus"
        value={`${filled} sur ${seats.length}`}
        detail={second ? 'après un second tour' : tie ? 'égalité à départager' : seats.length ? 'au premier tour' : 'pas d’élection'}
      />
    </div>
  ) : null

  const resolutionsPanel = resolutions.length ? (
    <Panel title="Résolutions">
      {resolutions.map((q) => {
        const r = q.result
        if (!r) return null
        const pour = r.counts.pour ?? 0
        const ok = r.outcome === 'adoptee'
        return (
          <div key={q.id} className="flex flex-col gap-1.5 border-t border-line-soft pt-3 first:border-0 first:pt-0">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-[16px]">{q.title}</strong>
              <Pill tone={ok ? 'ok' : 'danger'} icon={ok ? <Check className="size-3.5" strokeWidth={3} /> : undefined}>
                {ok ? 'Adoptée' : 'Rejetée'}
              </Pill>
            </div>
            <div className="h-2 rounded-full bg-line-soft" aria-hidden="true">
              <div className={`h-2 rounded-full ${ok ? 'bg-ok' : 'bg-danger'}`} style={{ width: `${percent(pour, r.expressed)}%` }} />
            </div>
            <span className="text-[13px] text-muted">
              <strong className="text-ink">{percent(pour, r.expressed)} % de pour</strong> · {pour} pour, {r.counts.contre ?? 0} contre, {r.counts.abstention ?? 0} abstention
              {(r.counts.abstention ?? 0) > 1 ? 's' : ''}
            </span>
          </div>
        )
      })}
    </Panel>
  ) : null

  const passation =
    seats.length && filled ? (
      <section className="flex flex-col gap-2.5 rounded-[12px] bg-ok-soft/70 p-5">
        <strong className="flex items-center gap-2 text-[16px] text-ok">
          <KeyRound className="size-5" /> {a.mandate_start ? `Passation le ${plainDay(a.mandate_start)}` : 'Passation dès la confirmation'}
        </strong>
        <p className="m-0 text-sm leading-[1.55] text-ink/85">
          {published
            ? `${filled > 1 ? `Les ${filled} postes pourvus sont préparés` : 'Le poste pourvu est préparé'} dans Postes et droits. Une fois ${filled > 1 ? 'confirmés' : 'confirmé'}, ${a.mandate_start ? `le nouveau bureau a ses accès le ${plainDay(a.mandate_start)} (article 16).` : 'les titulaires ont leurs accès tout de suite.'}`
            : `À la publication, ${filled > 1 ? `les ${filled} postes pourvus sont préparés` : 'le poste pourvu est préparé'} dans Postes et droits, à confirmer ; ${a.mandate_start ? `le nouveau bureau a ses accès le ${plainDay(a.mandate_start)} (article 16).` : 'les titulaires ont leurs accès dès la confirmation.'}`}
        </p>
        {published ? (
          <Link to="/bureau/postes" className="inline-flex h-10 items-center gap-2 self-start rounded-xl bg-surface px-3.5 text-sm font-bold text-ink no-underline hover:bg-surface-2">
            <ChevronRight className="size-4" /> Voir la passation
          </Link>
        ) : null}
      </section>
    ) : null

  const bureauPanel = seats.length ? (
    <Panel title={`Le bureau ${a.mandate_year}`} right={<span className="text-[13px] text-muted">Pourcentages des suffrages exprimés (article 13)</span>}>
      <div className="grid gap-3 lg:grid-cols-2">
        {seats.map((s) => (
          <SeatCard key={s.role} label={s.label} q={s.question} firstRound={s.round === 2 ? s.firstRound : null} names={names} year={a.mandate_year} />
        ))}
      </div>
    </Panel>
  ) : null

  return (
    <BureauPage title="Résultats de l’AG" subtitle={subtitle} actions={desktop ? actions : null}>
      {desktop ? <Steps step={3} done={published} /> : null}
      {!desktop ? <div className="flex flex-col gap-2.5">{actions}</div> : null}
      {tie && !published ? (
        <section className="rounded-[12px] border-2 border-safran bg-safran-pale/50 p-5 text-[15px] leading-[1.5]">
          <strong>Égalité pour un poste.</strong> Le second tour départage les candidats à égalité, pendant 30 minutes, avec la même liste électorale. Publie ensuite tous les résultats en une fois.
        </section>
      ) : null}
      {tiles}
      {desktop ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-4">
          <div className="flex flex-col gap-4">
            {resolutionsPanel}
            {passation}
          </div>
          {bureauPanel}
        </div>
      ) : (
        <>
          {resolutionsPanel}
          {bureauPanel}
          {passation}
        </>
      )}
      <Dialog
        open={confirm === 'publish'}
        onClose={() => setConfirm(null)}
        title="Publier les résultats ?"
        description="Une annonce officielle part dans le fil, et chacun voit les résultats et le procès-verbal dans l’onglet Votes. La publication est définitive."
      >
        <div className="flex flex-col gap-3 pb-2">
          <Button variant="accent" icon={<Megaphone className="size-5" />} busy={publish.isPending} onClick={() => run('publish')}>
            Publier les résultats
          </Button>
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Pas encore
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={confirm === 'second'}
        onClose={() => setConfirm(null)}
        title="Ouvrir le second tour ?"
        description="Les électeurs du premier tour reçoivent un message et ont 30 minutes pour départager les candidats à égalité."
      >
        <div className="flex flex-col gap-3 pb-2">
          <Button icon={<RefreshCw className="size-5" />} busy={secondRound.isPending} onClick={() => run('second')}>
            Ouvrir le second tour
          </Button>
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Pas encore
          </Button>
        </div>
      </Dialog>
    </BureauPage>
  )
}

function SeatCard({ label, q, firstRound, names, year }: { label: string; q: Question | null; firstRound: Question | null; names: Map<string, Candidacy>; year: number }) {
  const r = q?.result
  const name = (id: string) => {
    const c = names.get(id)
    return c ? `${c.member.first_name} ${c.member.last_name}` : '—'
  }
  let rows: { key: string; label: string; votes: number; win: boolean }[] = []
  if (q && r) {
    if (q.candidates.length === 1) {
      rows = [
        { key: 'pour', label: `${name(q.candidates[0])} · pour`, votes: r.counts.pour ?? 0, win: r.outcome === 'pourvu' },
        { key: 'contre', label: 'Contre', votes: r.counts.contre ?? 0, win: false },
      ]
    } else {
      rows = q.candidates.map((id) => ({ key: id, label: name(id), votes: r.counts[id] ?? 0, win: r.winner === id })).sort((x, y) => y.votes - x.votes)
    }
  }
  const blank = r?.counts.blanc ?? 0
  let foot = `${blank} blanc${blank > 1 ? 's' : ''}, non comptés`
  if (firstRound?.result) {
    const tied = firstRound.result.tied
    const each = tied.length ? (firstRound.result.counts[tied[0]] ?? 0) : 0
    foot = `Second tour, ${blank} blanc${blank > 1 ? 's' : ''}. Premier tour : ${each} voix pour ${tied.length === 2 ? 'chacun des deux' : `chacun des ${tied.length}`}.`
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-[12px] border-[1.5px] border-line-soft p-4">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[16px]">{label}</strong>
        {!q ? (
          <Pill tone="neutral">Aucun candidat</Pill>
        ) : r?.outcome === 'pourvu' ? (
          <Pill tone="ok" icon={<Check className="size-3.5" strokeWidth={3} />}>
            Titulaire {year}
          </Pill>
        ) : r?.outcome === 'egalite' ? (
          <Pill tone="safran">Égalité</Pill>
        ) : (
          <Pill tone="danger">Vacant</Pill>
        )}
      </div>
      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 text-[15px]">
            <span className={`flex min-w-0 flex-1 items-center gap-1 truncate ${row.win ? 'font-bold' : ''}`}>
              {row.label}
              {row.win ? <Check className="size-4 shrink-0 text-ok" strokeWidth={2.8} /> : null}
            </span>
            <strong>{percent(row.votes, r!.expressed)} %</strong>
            <span className="w-14 text-right text-[13px] text-muted">
              {row.votes} voix
            </span>
          </div>
          <div className="h-2 rounded-full bg-line-soft" aria-hidden="true">
            <div className={`h-2 rounded-full ${row.win ? 'bg-leppi' : 'bg-muted/40'}`} style={{ width: `${percent(row.votes, r!.expressed)}%` }} />
          </div>
        </div>
      ))}
      {q && r ? <span className="text-[13px] text-muted">{foot}</span> : null}
      {r?.outcome === 'vacant' ? <span className="text-[13px] text-danger">Pas assez de « pour » : une élection partielle suivra.</span> : null}
      {r?.outcome === 'egalite' && firstRound ? <span className="text-[13px] text-danger">Égalité persistante : le règlement intérieur tranche.</span> : null}
    </div>
  )
}
