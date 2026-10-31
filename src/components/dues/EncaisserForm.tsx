import { useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { Avatar } from '../Avatar'
import { Button, ButtonLink } from '../Button'
import { ErrorNote, Note } from '../Feedback'
import { inputClass, SearchField } from '../Field'
import { Pill } from '../Pill'
import { Toggle } from '../Toggle'
import {
  byExercise,
  defaultUntil,
  euros,
  legendFor,
  METHOD_LABELS,
  monthsLabel,
  monthsUntil,
  payableMonths,
  statusShort,
  useDuesMatrix,
  type MatrixRow,
  type PayMethod,
} from '../../lib/dues'
import { fullName, TYPE_LABELS } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { MonthGrid, MonthLegend } from './MonthGrid'

const METHODS: PayMethod[] = ['especes', 'virement', 'cheque']

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function MemberPicker({ rows, onPick }: { rows: MatrixRow[]; onPick: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const q = normalize(query.trim())
  const payers = rows.filter((r) => r.dues.paying && r.dues.status !== 'pas_encore')
  const list = payers
    .filter((r) => !q || normalize(fullName(r)).includes(q))
    .sort((a, b) => b.dues.late.length - a.dues.late.length || fullName(a).localeCompare(fullName(b)))
    .slice(0, 8)
  return (
    <div className="flex flex-col gap-3">
      <SearchField value={query} onChange={setQuery} placeholder="Qui a payé ?" label="Chercher le membre" />
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((r) => {
          const st = statusShort(r.dues)
          return (
            <li key={r.member_id} className="border-t border-line-soft first:border-0">
              <button type="button" onClick={() => onPick(r.member_id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface-2">
                <Avatar person={{ id: r.member_id, first_name: r.first_name, last_name: r.last_name, avatar_path: r.avatar_path }} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{fullName(r)}</span>
                  <span className="block text-[13px] text-muted">{TYPE_LABELS[r.member_type]}</span>
                </span>
                <Pill tone={st.tone}>{st.label}</Pill>
              </button>
            </li>
          )
        })}
      </ul>
      {!list.length ? <p className="m-0 text-sm text-muted">Aucun membre qui cotise ne correspond.</p> : null}
    </div>
  )
}

type Result = { receipt: string; amount: number; first: string; sent: boolean; member: string }

/** Encaisser des espèces, un virement ou un chèque : membre, mois, moyen, puis la quittance part toute seule. */
export function EncaisserForm({ initialMember, onCancel }: { initialMember?: string | null; onCancel?: () => void }) {
  const queryClient = useQueryClient()
  const matrix = useDuesMatrix()
  const [memberId, setMemberId] = useState<string | null>(initialMember ?? null)
  const [until, setUntil] = useState<string | null>(null)
  const [method, setMethod] = useState<PayMethod>('especes')
  const [paidOn, setPaidOn] = useState(today())
  const [note, setNote] = useState('')
  const [send, setSend] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<Result | null>(null)

  const row = matrix.data?.find((r) => r.member_id === memberId) ?? null
  const state = row?.dues ?? null
  const payable = state ? payableMonths(state) : []
  const chosenUntil = until ?? (state ? defaultUntil(state) : null)
  const chosen = state && chosenUntil ? monthsUntil(state, chosenUntil) : []
  const total = chosen.length * (state?.monthly_cents ?? 0)

  function pickMember(id: string | null) {
    setMemberId(id)
    setUntil(null)
    setError(null)
  }

  function pick(month: string) {
    if (month === chosenUntil) {
      const i = payable.indexOf(month)
      setUntil(i > 0 ? payable[i - 1] : month)
    } else {
      setUntil(month)
    }
  }

  async function save() {
    if (!row || !chosenUntil) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('record_payment', {
      p_member: row.member_id,
      p_until: chosenUntil,
      p_method: method,
      p_paid_on: paidOn,
      p_note: note.trim() || undefined,
      p_send: send,
    })
    setBusy(false)
    if (error) return setError(error)
    const r = data as { receipt: string; amount_cents: number }
    setDone({ receipt: r.receipt, amount: r.amount_cents, first: row.first_name, sent: send, member: row.member_id })
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['bureau'] }), queryClient.invalidateQueries({ queryKey: ['cotisation'] })])
  }

  function again() {
    setDone(null)
    pickMember(null)
    setNote('')
    setSend(true)
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="grid size-[72px] place-items-center rounded-full bg-gn-vert text-white" aria-hidden="true">
          <Check className="size-9" strokeWidth={3} />
        </span>
        <h2 className="titre m-0 text-[26px]" aria-live="polite">
          {euros(done.amount)} enregistrés
        </h2>
        <p className="m-0 max-w-[360px] text-[15px] leading-[1.5] text-muted">
          Quittance n° {done.receipt}
          {done.sent ? ` envoyée à ${done.first} dans sa conversation AEGB.` : ` créée. Elle n'a pas été envoyée à ${done.first}.`} L'écriture est dans le journal financier.
        </p>
        <div className="mt-2 flex w-full max-w-[360px] flex-col gap-2.5">
          <ButtonLink to={`/app/cotisation/quittances/${done.receipt}`} variant="outline">
            Voir la quittance
          </ButtonLink>
          <Button onClick={again}>Encaisser un autre paiement</Button>
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              Fermer
            </Button>
          ) : (
            <ButtonLink to="/bureau/cotisations" variant="ghost">
              Retour aux cotisations
            </ButtonLink>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <ErrorNote error={matrix.error} />
      {!row ? (
        matrix.data ? <MemberPicker rows={matrix.data} onPick={pickMember} /> : null
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-[12px] bg-surface-2 p-3">
            <Avatar person={{ id: row.member_id, first_name: row.first_name, last_name: row.last_name, avatar_path: row.avatar_path }} size={44} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold">{fullName(row)}</span>
              <span className="block text-[13px] text-muted">
                {TYPE_LABELS[row.member_type]} · {statusShort(row.dues).label}
              </span>
            </span>
            <Button variant="outline" size="sm" onClick={() => pickMember(null)} icon={<X className="size-4" />}>
              Changer
            </Button>
          </div>

          {!state?.paying || state.status === 'pas_encore' ? (
            <Note tone="warn">{state?.paying ? 'Les cotisations de ce membre ne sont pas encore ouvertes.' : 'Ce membre ne cotise pas : rien à encaisser.'}</Note>
          ) : !payable.length ? (
            <Note>Tout est déjà payé jusqu'à la fin de l'année.</Note>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-[15px] font-extrabold">Mois payés</h3>
                <p className="m-0 text-[13px] text-muted">Touche le dernier mois réglé : tout ce qui est avant est compté.</p>
                {byExercise(state.months).map((g) => (
                  <MonthGrid key={g.label} months={g.months} selected={new Set(chosen)} pickable={new Set(payable)} onPick={pick} label={`Mois de ${row.first_name}, année ${g.label}`} />
                ))}
                <MonthLegend items={legendFor(state.months, true)} />
              </div>

              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="mb-2 p-0 text-[15px] font-extrabold">Moyen</legend>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Moyen de paiement">
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={method === m}
                      onClick={() => setMethod(m)}
                      className={`h-11 rounded-xl text-sm font-bold ${method === m ? 'border-2 border-primary bg-select text-ink' : 'border-[1.5px] border-line bg-surface text-ink'}`}
                    >
                      {METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-[7px]">
                  <span className="text-sm font-bold">Reçu le</span>
                  <input type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
                </label>
                <label className="flex flex-col gap-[7px]">
                  <span className="text-sm font-bold">
                    Note <span className="font-normal text-muted">(facultatif)</span>
                  </span>
                  <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={method === 'cheque' ? 'N° du chèque' : method === 'virement' ? 'Référence du virement' : 'Ex. : réunion du samedi'} className={inputClass} />
                </label>
              </div>

              <div className="flex flex-col gap-2.5 rounded-[12px] bg-surface-2 p-4">
                <div className="flex justify-between gap-3 text-[15px]">
                  <span>{chosen.length ? monthsLabel(chosen) : 'Aucun mois choisi'}</span>
                  <span className="shrink-0 text-muted">
                    {chosen.length} × {euros(state.monthly_cents)}
                  </span>
                </div>
                <div className="h-px bg-line-soft" />
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-extrabold">Total reçu</span>
                  <span className="titre text-[28px]">{euros(total)}</span>
                </div>
              </div>

              <Toggle checked={send} onChange={setSend} title={`Envoyer la quittance à ${row.first_name}`} detail="Dans sa conversation AEGB" />
              <p className="m-0 text-[13px] text-muted">
                L'écriture entre dans le <Link to="/bureau/journal-financier">journal financier</Link> et ne se modifie plus. En cas d'erreur, on la corrige par une contre-passation.
              </p>
              <ErrorNote error={error} />
              <div className="flex gap-2.5">
                {onCancel ? (
                  <Button variant="outline" className="flex-1" onClick={onCancel}>
                    Annuler
                  </Button>
                ) : null}
                <Button className="flex-1" onClick={save} busy={busy} disabled={!chosen.length || !paidOn}>
                  Enregistrer {euros(total)}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
