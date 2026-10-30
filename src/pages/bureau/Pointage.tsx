import { useState } from 'react'
import { useParams } from 'react-router'
import { Briefcase, Check, CircleDollarSign, UserPlus } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { SearchField } from '../../components/Field'
import { BackLink } from '../../components/Hero'
import { useToast } from '../../components/Toast'
import { euros } from '../../lib/dues'
import { hour } from '../../lib/elections'
import { errorMessage } from '../../lib/errors'
import { useEventActions, useEventAdmin, type AdminEvent, type AdminPerson } from '../../lib/events'
import { useDirectory } from '../../lib/feed'
import { sameDay } from '../../lib/format'

function payLine(e: AdminEvent, p: AdminPerson): { text: string; tone: string } {
  if (e.member_price_cents <= 0) return { text: p.walk_in ? 'Sans inscription' : 'Gratuit', tone: 'text-muted' }
  if (!p.payment) return { text: `${euros(e.member_price_cents)} à encaisser`, tone: 'text-[#8A5A00]' }
  return { text: p.payment.method === 'carte' ? 'Payé dans l’appli' : `${euros(p.payment.amount_cents)} payés sur place`, tone: 'text-ok' }
}

function WalkInDialog({ e, open, onClose }: { e: AdminEvent; open: boolean; onClose: () => void }) {
  const directory = useDirectory()
  const { checkIn } = useEventActions()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const known = new Set(e.people.filter((p) => p.status === 'inscrit').map((p) => p.id))
  const needle = query.trim().toLowerCase()
  const list = (directory.data ?? []).filter((m) => !known.has(m.id) && (!needle || `${m.first_name} ${m.last_name}`.toLowerCase().includes(needle))).slice(0, 30)
  return (
    <Dialog open={open} onClose={onClose} title="Ajouter une présence sans inscription" description="Sa présence est notée tout de suite. Une personne de la liste d’attente peut aussi être ajoutée ici.">
      <div className="flex flex-col gap-3">
        <SearchField value={query} onChange={setQuery} placeholder="Chercher un membre" label="Chercher un membre" />
        {directory.isPending ? (
          <PageLoader />
        ) : list.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {list.map((m) => (
              <li key={m.id} className="border-t border-line-soft first:border-0">
                <button
                  type="button"
                  disabled={checkIn.isPending}
                  onClick={() =>
                    checkIn.mutate(
                      { event: e.id, member: m.id, present: true },
                      {
                        onSuccess: () => {
                          toast(`${m.first_name} : présence notée.`)
                          setQuery('')
                          onClose()
                        },
                        onError: (err) => toast(errorMessage(err), 'error'),
                      },
                    )
                  }
                  className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface-2"
                >
                  <Avatar person={m} size={38} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
                    {m.first_name} {m.last_name}
                  </span>
                  <UserPlus className="size-5 text-leppi" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Personne à ce nom" />
        )}
      </div>
    </Dialog>
  )
}

/** Le jour J, à l'entrée : cocher les présents et encaisser les places payées sur place. */
export default function Pointage() {
  const { id } = useParams()
  const q = useEventAdmin(id)
  const { checkIn, cash } = useEventActions()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [walkIn, setWalkIn] = useState(false)

  if (q.isPending) return <PageLoader />
  if (q.error || !q.data) return <ErrorNote error={q.error ?? 'Cet événement n’existe plus.'} className="m-4" />
  const e = q.data
  const going = e.people.filter((p) => p.status === 'inscrit').sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'fr'))
  const present = going.filter((p) => p.present).length
  const inApp = going.filter((p) => p.payment?.method === 'carte').length
  const onSite = going.filter((p) => p.payment && p.payment.method !== 'carte').length
  const due = e.member_price_cents > 0 ? going.length - inApp - onSite : 0
  const needle = query.trim().toLowerCase()
  const rows = going.filter((p) => !needle || `${p.first_name} ${p.last_name}`.toLowerCase().includes(needle))
  const today = sameDay(e.starts_at, new Date())
  const when = `${today ? (new Date(e.starts_at).getHours() >= 17 ? 'ce soir' : 'aujourd’hui') : new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(e.starts_at))}, ${hour(e.starts_at)}`

  return (
    <div className="flex flex-1 flex-col bg-page lg:mx-auto lg:w-full lg:max-w-[560px]">
      <header className="bg-tisse flex shrink-0 flex-col gap-2 px-5 pt-[max(env(safe-area-inset-top),8px)] pb-10 text-white lg:rounded-t-[26px]">
        <div className="flex items-center justify-between">
          <BackLink to={`/bureau/evenements/${e.id}`} label="Retour à l’événement" />
          <span className="flex h-6 items-center gap-1 rounded-full bg-safran px-2.5 text-[11px] font-extrabold tracking-[0.5px] text-nuit uppercase">
            <Briefcase className="size-3" strokeWidth={2.4} /> Bureau
          </span>
        </div>
        <h1 className="titre m-0 text-[28px]">Pointer les présences</h1>
        <p className="m-0 text-[14px] text-white/85">
          {e.title} · {when}
          {e.member_price_cents > 0 ? ` · ${euros(e.member_price_cents)}` : ''}
        </p>
      </header>

      <div className="relative -mt-[26px] flex flex-1 flex-col gap-2.5 px-4 pb-2.5">
        <div className="flex flex-col gap-2.5 rounded-[20px] bg-surface px-4 py-3.5 shadow-[0_1px_2px_rgba(18,22,43,0.06),0_6px_18px_rgba(18,22,43,0.06)]">
          <div className="flex items-baseline gap-2">
            <span className="titre text-[40px] leading-none" aria-live="polite">
              {present}
            </span>
            <span className="text-[15px] text-muted">
              présence{present > 1 ? 's' : ''} sur {going.length} inscription{going.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="relative h-2.5 rounded-full bg-[#E8EAF2]" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full bg-gn-vert transition-all" style={{ width: `${going.length ? (100 * present) / going.length : 0}%` }} />
          </div>
          {e.member_price_cents > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
              <CircleDollarSign className="size-[15px] text-leppi" />
              <span>
                <b className="text-ink">{inApp}</b> payés dans l’appli · <b className="text-ink">{onSite}</b> sur place · <b className="text-[#8A5A00]">{due}</b> à encaisser
              </span>
            </div>
          ) : null}
        </div>

        {new Date(e.starts_at).getTime() > Date.now() + 86_400_000 ? <Note tone="warn">Le pointage s’ouvre la veille de l’événement. Tu peux déjà encaisser les places payées en avance.</Note> : null}
        {e.status !== 'publie' ? <Note tone="warn">Cet événement n’est pas publié : le pointage est fermé.</Note> : null}

        <SearchField value={query} onChange={setQuery} placeholder="Chercher un nom" label="Chercher un nom" className="h-11 border-line-soft" />

        {rows.length ? (
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[20px] bg-surface p-0 shadow-[0_1px_2px_rgba(18,22,43,0.06),0_6px_18px_rgba(18,22,43,0.06)]">
            {rows.map((p) => {
              const pay = payLine(e, p)
              return (
                <li key={p.id} className="flex items-center gap-2.5 border-t border-line-soft py-[9px] pr-3 pl-3.5 first:border-0">
                  <Avatar person={p} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[15px] font-bold">
                      {p.first_name} {p.last_name}
                    </span>
                    <span className={`text-[12px] font-semibold ${pay.tone}`}>{pay.text}</span>
                  </span>
                  {e.member_price_cents > 0 && !p.payment ? (
                    <button
                      type="button"
                      disabled={cash.isPending}
                      onClick={() =>
                        cash.mutate(
                          { event: e.id, member: p.id },
                          { onSuccess: () => toast(`${euros(e.member_price_cents)} encaissés, notés au journal.`), onError: (err) => toast(errorMessage(err), 'error') },
                        )
                      }
                      className="h-[34px] shrink-0 rounded-[10px] bg-safran-pale px-3 text-[13px] font-extrabold text-[#4A3A00] disabled:opacity-60"
                    >
                      Encaisser
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-pressed={p.present}
                    aria-label={`Présent : ${p.first_name} ${p.last_name}`}
                    disabled={checkIn.isPending}
                    onClick={() => checkIn.mutate({ event: e.id, member: p.id, present: !p.present }, { onError: (err) => toast(errorMessage(err), 'error') })}
                    className={`grid size-[34px] shrink-0 place-items-center rounded-[10px] ${p.present ? 'bg-gn-vert text-white' : 'border-2 border-[#C9CDDC] bg-surface text-transparent'}`}
                  >
                    <Check className="size-[18px]" strokeWidth={3} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rounded-[20px] bg-surface">
            <EmptyState title={query ? 'Personne à ce nom' : 'Personne d’inscrit'} />
          </div>
        )}
      </div>

      <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] flex flex-col gap-1.5 bg-page px-4 pt-2.5 pb-3 lg:bottom-0">
        <Button variant="outline" size="md" icon={<UserPlus className="size-[18px]" />} onClick={() => setWalkIn(true)}>
          Ajouter une présence sans inscription
        </Button>
        <span className="text-center text-[12px] text-muted">Seul le bureau voit les présences et les paiements.</span>
      </div>
      <WalkInDialog e={e} open={walkIn} onClose={() => setWalkIn(false)} />
    </div>
  )
}
