import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { inputClass } from '../../components/Field'
import { Pill } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { Toggle } from '../../components/Toggle'
import { exerciseLabel, frenchDay, useCardPayments, useDuesMatrix, useDuesSettings, useLedger, type DuesSettings } from '../../lib/dues'
import { TYPE_PLURALS, type MemberType } from '../../lib/format'
import { can, useActiveMembers, useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { BureauPage, Card } from './BureauPage'

const TYPES: MemberType[] = ['etudiant', 'alumni', 'sympathisant', 'honneur']

type Form = {
  amount: string
  start: string
  paying: MemberType[]
  reminders: boolean
  address: string
  rna: string
}

function fromSettings(s: DuesSettings): Form {
  return {
    amount: (s.monthly_cents / 100).toFixed(2).replace('.', ','),
    start: s.start_month.slice(0, 7),
    paying: s.paying_types,
    reminders: s.reminders,
    address: s.org_address ?? '',
    rna: s.org_rna ?? '',
  }
}

function parseCents(text: string): number | null {
  const clean = text.replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  return Math.round(Number(clean) * 100)
}

function Section({ title, detail, children, right }: { title: string; detail?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">{title}</h2>
          {detail ? <p className="m-0 mt-0.5 text-[13px] text-muted">{detail}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </Card>
  )
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-2.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right font-bold">{value}</span>
    </div>
  )
}

function Editor({ settings, readOnly }: { settings: DuesSettings; readOnly: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const members = useActiveMembers().data ?? []
  const matrix = useDuesMatrix().data ?? []
  const card = useCardPayments()
  const lastCard = useLedger().data?.find((e) => e.method === 'helloasso' && !e.reverses)
  const initial = fromSettings(settings)
  const [form, setForm] = useState<Form>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const cents = parseCents(form.amount)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  const counts = new Map<MemberType, number>()
  for (const m of members) counts.set(m.member_type, (counts.get(m.member_type) ?? 0) + 1)
  const noVote = matrix.filter((r) => r.dues.vote_suspended).length
  const radiable = matrix.filter((r) => r.dues.radiation_possible).length
  const exercise = matrix[0]?.dues.exercise_start
  const year = matrix[0]?.dues.today.slice(0, 4)

  async function save() {
    if (!cents) return setError('Indique un montant par mois, par exemple 5,00.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('save_dues_settings', {
      p_monthly_cents: cents,
      p_start_month: `${form.start}-01`,
      p_paying: form.paying,
      p_reminders: form.reminders,
      p_org_address: form.address.trim() || undefined,
      p_org_rna: form.rna.trim() || undefined,
    })
    setBusy(false)
    if (error) return setError(error)
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['cotisation'] }), queryClient.invalidateQueries({ queryKey: ['bureau'] })])
    toast('Réglages enregistrés.')
  }

  const cardState = card.data ? (card.data.ready ? (card.data.mode === 'production' ? 'Connecté' : 'Mode essai') : 'Pas encore branché') : card.isError ? 'Injoignable' : '…'

  return (
    <>
      {!readOnly ? (
        <div className={`sticky top-2 z-10 flex items-center justify-between gap-3 rounded-[18px] px-4 py-3 lg:static ${dirty ? 'bg-safran-pale text-[#5C4300]' : 'bg-surface'}`}>
          <span className="text-sm font-bold">{dirty ? 'Modifications non enregistrées' : settings.updated_at ? `Enregistré${settings.updated_by_name ? ` par ${settings.updated_by_name}` : ''}` : 'Réglages proposés pour les essais'}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!dirty || busy} onClick={() => setForm(initial)}>
              Annuler
            </Button>
            <Button size="sm" disabled={!dirty} busy={busy} onClick={save}>
              Enregistrer
            </Button>
          </div>
        </div>
      ) : (
        <Note>Ton poste te permet de voir ces réglages, pas de les changer.</Note>
      )}
      <ErrorNote error={error} />

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-4">
          <Section title="Montant et calendrier" detail={exercise ? `Année ${exerciseLabel(exercise)}` : undefined}>
            <label className="flex flex-col gap-[7px]">
              <span className="text-sm font-bold">Montant par mois</span>
              <span className="relative">
                <input inputMode="decimal" value={form.amount} disabled={readOnly} onChange={(e) => set('amount', e.target.value)} className={`${inputClass} pr-10`} aria-invalid={!cents ? true : undefined} />
                <span className="absolute top-1/2 right-4 -translate-y-1/2 text-muted">€</span>
              </span>
            </label>
            <label className="flex flex-col gap-[7px]">
              <span className="text-sm font-bold">Début des cotisations</span>
              <input type="month" value={form.start} disabled={readOnly} onChange={(e) => set('start', e.target.value)} className={inputClass} />
            </label>
            <div className="flex flex-col gap-2.5">
              <Line label="L'année va de" value="septembre à août" />
              <Line label="Payer d'avance" value="jusqu'en août, l'année suivante dès juillet" />
            </div>
            <p className="m-0 text-[13px] leading-[1.45] text-muted">Un nouveau montant ne touche que les mois pas encore payés. Les mois déjà payés gardent leur prix.</p>
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Qui paie" detail="Les autres types de membres sont exonérés">
            <div className="flex flex-col gap-2">
              {TYPES.map((t) => (
                <label key={t} className={`flex items-center gap-3 rounded-[14px] border-[1.5px] px-3.5 py-3 ${form.paying.includes(t) ? 'border-primary bg-select' : 'border-line-soft'}`}>
                  <input
                    type="checkbox"
                    checked={form.paying.includes(t)}
                    disabled={readOnly}
                    onChange={(e) => set('paying', e.target.checked ? [...form.paying, t] : form.paying.filter((x) => x !== t))}
                    className="size-5 accent-[var(--primary)]"
                  />
                  <span className="flex-1 text-[15px] font-bold">{TYPE_PLURALS[t]}</span>
                  <span className="text-[13px] text-muted">{counts.get(t) ?? 0}</span>
                </label>
              ))}
            </div>
            <p className="m-0 text-[13px] text-muted">
              {form.paying.length ? `Cotisent : ${form.paying.map((t) => TYPE_PLURALS[t].toLowerCase()).join(', ')}.` : 'Personne ne cotise.'}
            </p>
          </Section>

          <Section title="Retard et droit de vote" detail="Article 32 des statuts">
            <p className="m-0 text-sm leading-[1.5]">
              Dès qu'un mois passé n'est pas payé, le droit de vote et l'éligibilité au bureau d'un étudiant sont suspendus. Ils reviennent tout seuls quand le retard est réglé.
            </p>
            <p className="m-0 text-sm leading-[1.5]">Après trois mois de retard et un rappel resté sans effet, le bureau peut prononcer la radiation.</p>
            <Line label="Sans droit de vote aujourd'hui" value={`${noVote} membre${noVote > 1 ? 's' : ''}`} />
            <Line label="Radiation possible" value={`${radiable} membre${radiable > 1 ? 's' : ''}`} />
            <p className="m-0 text-[13px] leading-[1.45] text-muted">
              La solidarité (article 30) reste une aide ponctuelle décidée par le bureau : elle ne dépend pas de la cotisation.
            </p>
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Relance automatique" detail="Le 1er du mois à 9 h, par le compte AEGB">
            <Toggle checked={form.reminders} disabled={readOnly} onChange={(v) => set('reminders', v)} title={form.reminders ? 'Relance activée' : 'Relance coupée'} detail="Seuls les membres en retard la reçoivent, une fois par mois. C'est le rappel écrit de l'article 32." />
            <div className="flex flex-col gap-1.5 rounded-[16px] bg-surface-2 p-3.5">
              <span className="text-[11px] font-bold tracking-wide text-muted uppercase">Ce que reçoit le membre</span>
              <span className="text-sm font-bold">Rappel de cotisation</span>
              <span className="text-sm leading-[1.45]">
                Bonjour {'{prénom}'}, ta cotisation de {'{mois}'} n'est pas encore réglée, soit {'{montant}'}. Tant qu'elle ne l'est pas, ton droit de vote et ton éligibilité au bureau sont suspendus (article 32 des statuts).
              </span>
              <span className="mt-1 inline-flex h-9 w-fit items-center rounded-xl border-[1.5px] border-primary px-3 text-sm font-bold">Payer {'{montant}'}</span>
            </div>
          </Section>

          <Section
            title="Paiement en ligne"
            detail="Par carte, avec HelloAsso"
            right={<Pill tone={card.data?.ready ? (card.data.mode === 'production' ? 'ok' : 'safran') : 'neutral'}>{cardState}</Pill>}
          >
            <div className="flex flex-col gap-2.5">
              <Line label="Dernier paiement" value={lastCard ? `${frenchDay(lastCard.entry_date)} · ${(lastCard.amount_cents / 100).toFixed(2).replace('.', ',')} €` : 'Aucun'} />
              <Line label="Frais pour l'asso" value="0 €" />
            </div>
            <p className="m-0 text-[13px] leading-[1.45] text-muted">
              {card.data?.ready
                ? "Les identifiants HelloAsso sont rangés côté serveur. Ils ne s'affichent jamais ici."
                : "Pour le brancher, il faut le compte HelloAsso de l'asso et ses identifiants d'API, posés une fois côté serveur. En attendant, le bureau encaisse les espèces, virements et chèques."}
            </p>
          </Section>

          <Section title="Quittances" detail="Une par paiement, en PDF">
            <div className="flex flex-col gap-2.5">
              <Line label="Numéros" value={year ? `${year}-0001, ${year}-0002…` : 'Par année, sans trou'} />
              <Line label="Signée" value="Le bureau de l'AEGB" />
              <Line label="Envoyée" value="Dans la conversation AEGB" />
            </div>
            <label className="flex flex-col gap-[7px]">
              <span className="text-sm font-bold">Adresse du siège</span>
              <input value={form.address} maxLength={200} disabled={readOnly} onChange={(e) => set('address', e.target.value)} placeholder="Imprimée en bas des quittances" className={inputClass} />
            </label>
            <label className="flex flex-col gap-[7px]">
              <span className="text-sm font-bold">N° RNA</span>
              <input value={form.rna} maxLength={40} disabled={readOnly} onChange={(e) => set('rna', e.target.value)} placeholder="W291000000" className={inputClass} />
            </label>
          </Section>
        </div>
      </div>
    </>
  )
}

export default function ReglagesCotisation() {
  const me = useMe().data
  const settings = useDuesSettings()
  return (
    <BureauPage title="Réglages de la cotisation" subtitle="Chaque changement est noté dans le journal d'activité, avec ton nom et la date." back="/bureau/cotisations">
      <ErrorNote error={settings.error} />
      {settings.isPending ? <PageLoader /> : null}
      {settings.data ? <Editor key={settings.data.updated_at ?? 'depart'} settings={settings.data} readOnly={!can(me, 'tresorerie')} /> : null}
    </BureauPage>
  )
}
