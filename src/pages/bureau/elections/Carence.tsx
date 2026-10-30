import { useState } from 'react'
import { AlertTriangle, Check, Megaphone, Plus, Send } from 'lucide-react'
import { Button } from '../../../components/Button'
import { Dialog } from '../../../components/Dialog'
import { TextField } from '../../../components/Field'
import { useToast } from '../../../components/Toast'
import { capitalize, dayMonth, dayShort, dayYear, hour, isoToParis, parisToIso, useElectionActions, type AdminView } from '../../../lib/elections'
import { errorMessage } from '../../../lib/errors'
import { useIsDesktop } from '../../../lib/media'
import { BureauPage } from '../BureauPage'
import { PvButton } from './Resultats'
import { Panel, Steps } from './shared'

/* ----------------------------------------------------------------------------
   Quorum non atteint : les bulletins sont détruits sans être lus, et le
   bureau convoque une seconde AG entre 7 et 21 jours plus tard (article 13).
---------------------------------------------------------------------------- */

const DAY = 86_400_000

export function Carence({ view, full, onNew }: { view: AdminView; full: boolean; onNew: () => void }) {
  const a = view.assembly!
  const desktop = useIsDesktop()
  const toast = useToast()
  const { secondAssembly } = useElectionActions()
  const b = a.ballots.find((x) => x.round === 1)
  const held = new Date(a.held_at).getTime()
  const options = [7, 14, 21].map((n) => isoToParis(new Date(held + n * DAY).toISOString()).slice(0, 10))
  const [date, setDate] = useState(options[0])
  const [time, setTime] = useState(isoToParis(a.held_at).slice(11))
  const [voteFrom, setVoteFrom] = useState(isoToParis(a.vote_opens_at).slice(11))
  const [voteTo, setVoteTo] = useState(isoToParis(a.vote_closes_at).slice(11))
  const [place, setPlace] = useState(a.place)
  const [confirm, setConfirm] = useState(false)
  const canSecond = a.convocation === 1 && full
  const validated = a.seats.reduce((n, s) => n + s.candidates.filter((c) => c.status === 'validee').length, 0)
  const whenIso = parisToIso(`${date}T${time}`)
  const fill = b && b.electors ? Math.min(100, (100 * b.voters) / b.electors) : 0
  const mark = b && b.electors && b.quorum ? Math.min(100, (100 * b.quorum) / b.electors) : null

  const send = () =>
    secondAssembly
      .mutateAsync({ first: a.id, held_at: whenIso, place: place.trim(), vote_opens_at: parisToIso(`${date}T${voteFrom}`), vote_closes_at: parisToIso(`${date}T${voteTo}`) })
      .then(
        () => {
          setConfirm(false)
          toast('Seconde AG convoquée : les membres sont prévenus')
        },
        (e) => {
          setConfirm(false)
          toast(errorMessage(e), 'error')
        },
      )

  const alert = (
    <section className="flex gap-4 rounded-[22px] border-2 border-danger/30 bg-danger-soft/50 p-5 lg:p-6">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <h2 className="titre m-0 text-[22px] leading-tight text-danger">
          {b ? `${b.voters} votant${b.voters > 1 ? 's' : ''} sur ${b.electors} : il en fallait ${b.quorum}` : 'Quorum non atteint'}
        </h2>
        <p className="m-0 text-[15px] leading-[1.5]">
          Le quorum {a.kind === 'ordinaire' ? 'd’un tiers' : a.convocation === 2 ? 'd’un tiers' : 'de la moitié'} n’est pas atteint (article {a.kind === 'ordinaire' ? 13 : 14}). Le vote ne compte pas : les bulletins ont été détruits
          sans être lus. Personne, même le bureau, ne connaîtra ces résultats.
        </p>
        {b ? (
          <div className="flex flex-col gap-1">
            <div className="relative h-2.5 rounded-full bg-line-soft" aria-hidden="true">
              <div className="absolute inset-y-0 left-0 rounded-full bg-[#B3122A]" style={{ width: `${fill}%` }} />
              {mark !== null ? <div className="absolute -top-1 -bottom-1 w-0.5 rounded bg-nuit" style={{ left: `calc(${mark}% - 1px)` }} /> : null}
            </div>
            <span className="text-[13px] text-muted">Le trait marque le quorum.</span>
          </div>
        ) : null}
      </div>
    </section>
  )

  const form = canSecond ? (
    <Panel title="Convoquer la seconde assemblée">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-sm font-bold">Date</legend>
        <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Date de la seconde AG">
          {options.map((d, i) => {
            const selected = d === date
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setDate(d)}
                className={`flex flex-col items-start rounded-[16px] px-3.5 py-2.5 text-left ${
                  selected ? 'border-2 border-leppi bg-select ring-4 ring-safran/45' : 'border-[1.5px] border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <strong className="text-[15px]">{capitalize(dayShort(`${d}T12:00:00Z`).replace(/\.$/, ''))}</strong>
                <span className="text-[13px] text-muted">{[7, 14, 21][i]} jours après</span>
              </button>
            )
          })}
        </div>
        <span className="text-[13px] text-muted">
          Entre 7 et 21 jours après la première (article 13) : du {dayMonth(`${options[0]}T12:00:00Z`)} au {dayMonth(`${options[2]}T12:00:00Z`)}.
        </span>
      </fieldset>
      <div className="grid gap-3 lg:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <TextField label="Heure" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <TextField label="Vote, de" type="time" value={voteFrom} onChange={(e) => setVoteFrom(e.target.value)} />
        <TextField label="à" type="time" value={voteTo} onChange={(e) => setVoteTo(e.target.value)} />
        <TextField label="Lieu" value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} />
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 rounded-[16px] bg-surface-2 p-4 text-[15px]">
        <li className="flex items-start gap-2.5">
          <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.8} />
          <span>
            {a.kind === 'ordinaire' ? (
              <>
                <strong>Sans quorum</strong> : le vote comptera quel que soit le nombre de votants.
              </>
            ) : (
              <>
                <strong>Quorum d’un tiers</strong> de la liste électorale (article 14).
              </>
            )}
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.8} />
          <span>
            <strong>Même ordre du jour</strong>
            {a.seats.length ? `, et les ${validated} candidatures validées restent valables.` : '.'}
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.8} />
          <span>
            <strong>{view.members} membres convoqués</strong> en message du compte AEGB et dans le fil.
          </span>
        </li>
      </ul>
      <Button className="self-start" icon={<Send className="size-5" />} disabled={!place.trim()} onClick={() => setConfirm(true)}>
        Envoyer la convocation du {dayMonth(`${date}T12:00:00Z`)}
      </Button>
    </Panel>
  ) : a.convocation === 2 ? (
    <Panel title="Et maintenant ?">
      <p className="m-0 text-[15px] leading-[1.5]">
        La seconde AG extraordinaire n’a pas non plus atteint son quorum : rien n’est décidé. Le bureau peut préparer une nouvelle AG.
      </p>
      {full ? (
        <Button className="self-start" icon={<Plus className="size-5" />} onClick={onNew}>
          Préparer une nouvelle AG
        </Button>
      ) : null}
    </Panel>
  ) : null

  const preview =
    canSecond ? (
      <Panel title="Le message envoyé">
        <div className="rounded-[18px] bg-surface-2 p-3">
          <div className="flex flex-col gap-2.5 rounded-[16px] bg-surface p-4">
            <strong className="flex items-center gap-2 text-[15px]">
              <Megaphone className="size-4" /> Seconde assemblée générale
            </strong>
            <p className="m-0 text-sm leading-[1.55]">
              Bonjour, la première AG n’a pas réuni assez de votants. Le bureau te convoque à une seconde AG le{' '}
              <strong>
                {dayYear(whenIso).replace(/ \d{4}$/, '')}, {hour(whenIso)}
              </strong>
              , à {place || '…'}. Même ordre du jour ;{' '}
              {a.kind === 'ordinaire' ? 'cette fois, le vote compte quel que soit le nombre de votants.' : 'cette fois, il faut un tiers des inscrits.'}
            </p>
            <span className="flex h-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-ink">Voir l’assemblée générale</span>
          </div>
        </div>
        <span className="text-[13px] text-muted">Une annonce officielle reprend le même texte dans le fil.</span>
      </Panel>
    ) : null

  return (
    <BureauPage title="Quorum non atteint" subtitle={`Vote fermé le ${dayYear(b?.closed_at ?? a.vote_closes_at)} à ${hour(b?.closed_at ?? a.vote_closes_at)}.`} actions={<PvButton a={a} label="Procès-verbal de carence (PDF)" />}>
      {desktop ? <Steps step={3} /> : null}
      {alert}
      {desktop && preview ? (
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-4">
          {form}
          {preview}
        </div>
      ) : (
        <>
          {form}
          {preview}
        </>
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Convoquer la seconde AG ?"
        description={`Tous les membres actifs reçoivent la convocation pour le ${dayYear(whenIso)}, ${hour(whenIso)}, et une annonce part dans le fil.`}
      >
        <div className="flex flex-col gap-3 pb-2">
          <Button icon={<Send className="size-5" />} busy={secondAssembly.isPending} onClick={send}>
            Envoyer la convocation
          </Button>
          <Button variant="outline" onClick={() => setConfirm(false)}>
            Relire encore
          </Button>
        </div>
      </Dialog>
    </BureauPage>
  )
}
