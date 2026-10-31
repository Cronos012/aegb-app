import { useState } from 'react'
import { Check, KeyRound } from 'lucide-react'
import { Avatar } from '../Avatar'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { useToast } from '../Toast'
import { dayMonth, plainDay, usePendingHandovers, useElectionActions, type PendingHandover } from '../../lib/elections'
import { errorMessage } from '../../lib/errors'

/** Dans « Postes et droits » : les postes gagnés à l'AG, à confirmer avant la prise de poste (article 16). */
export function Passation({ enabled, editable }: { enabled: boolean; editable: boolean }) {
  const list = usePendingHandovers(enabled).data ?? []
  const groups = new Map<string, PendingHandover[]>()
  for (const h of list) groups.set(h.assembly, [...(groups.get(h.assembly) ?? []), h])
  return (
    <>
      {[...groups.entries()].map(([id, items]) => (
        <Group key={id} id={id} items={items} editable={editable} />
      ))}
    </>
  )
}

function Group({ id, items, editable }: { id: string; items: PendingHandover[]; editable: boolean }) {
  const toast = useToast()
  const { confirmHandover } = useElectionActions()
  const [open, setOpen] = useState(false)
  const first = items[0]
  const confirmed = items.every((h) => h.confirmed_at)
  const when = first.effective_on
  return (
    <section className="flex flex-col gap-3 rounded-[12px] bg-ok-soft/70 p-4 lg:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="flex items-center gap-2 text-[16px] text-ok">
            <KeyRound className="size-5" /> Passation de l’AG du {dayMonth(first.held_at)}
          </strong>
          <span className="text-sm text-ink/80">
            {confirmed
              ? `Confirmée par ${!first.confirmed_by_name || first.confirmed_by_name === 'Le bureau' ? 'le bureau' : first.confirmed_by_name} : les titulaires prennent leur poste le ${plainDay(when)}.`
              : `À confirmer : les titulaires prennent leur poste le ${plainDay(when)}, ou dès la confirmation si cette date est passée (article 16).`}
          </span>
        </div>
        {!confirmed && editable ? (
          <Button size="md" icon={<Check className="size-[18px]" />} onClick={() => setOpen(true)}>
            Confirmer la passation
          </Button>
        ) : null}
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 lg:grid-cols-3">
        {items.map((h) => (
          <li key={h.role} className="flex items-center gap-3 rounded-[16px] bg-surface px-3 py-2.5">
            <Avatar person={h.member} size={36} />
            <span className="flex min-w-0 flex-col">
              <strong className="truncate text-[15px] leading-tight">
                {h.member.first_name} {h.member.last_name}
              </strong>
              <span className="truncate text-[13px] text-muted">{h.label}</span>
            </span>
          </li>
        ))}
      </ul>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Confirmer la passation ?"
        description={`${items.length} poste${items.length > 1 ? 's' : ''} change${items.length > 1 ? 'nt' : ''} de titulaire le ${plainDay(when)}. Chacun reçoit alors les accès de son poste, et les sortants perdent les leurs.`}
      >
        <div className="flex flex-col gap-3 pb-2">
          <Button
            icon={<Check className="size-5" />}
            busy={confirmHandover.isPending}
            onClick={() =>
              confirmHandover.mutate(id, {
                onSuccess: () => {
                  setOpen(false)
                  toast('Passation confirmée')
                },
                onError: (e) => toast(errorMessage(e), 'error'),
              })
            }
          >
            Confirmer la passation
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Pas encore
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
