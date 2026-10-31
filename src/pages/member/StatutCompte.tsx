import { Ban, CircleX } from 'lucide-react'
import { signOut } from '../../auth/session'
import { Button } from '../../components/Button'
import { longDate } from '../../lib/format'
import type { Me } from '../../lib/queries'

/** Compte refusé ou suspendu : on garde le motif et on dit quoi faire ensuite. */
export function StatutCompte({ me }: { me: Me }) {
  const p = me.profile
  const refused = p.status === 'refuse'
  const reason = refused ? p.refusal_reason : p.suspension_reason
  const date = refused ? p.refused_at : p.suspended_at

  return (
    <div className="flex min-h-app justify-center bg-page lg:items-center lg:py-10">
      <div className="flex w-full max-w-[480px] flex-col bg-surface px-5 pt-[max(env(safe-area-inset-top),40px)] pb-[max(env(safe-area-inset-bottom),24px)] lg:rounded-[12px] lg:px-10 lg:py-10 lg:shadow-sm">
        <span className="grid size-[60px] place-items-center rounded-2xl bg-danger-soft text-danger">
          {refused ? <CircleX className="size-7" /> : <Ban className="size-7" />}
        </span>
        <h1 className="titre mt-6 mb-0 text-[30px] leading-tight">{refused ? "Ta demande n'a pas été acceptée" : 'Ton compte est suspendu'}</h1>
        <p className="mt-3 mb-0 text-[16px] leading-[1.5] text-muted">
          {refused
            ? "Le bureau n'a pas pu confirmer que tu fais partie de l'AEGB."
            : "Le bureau a suspendu ton accès à l'appli. Tes informations sont conservées."}
        </p>
        {reason ? (
          <div className="mt-6 rounded-2xl bg-surface-2 px-4 py-3.5">
            <p className="m-0 text-[13px] font-bold text-muted">Motif{date ? `, le ${longDate(date)}` : ''}</p>
            <p className="m-0 mt-1 text-[15px] leading-[1.45]">{reason}</p>
          </div>
        ) : null}
        <p className="mt-6 mb-0 text-[15px] leading-[1.5]">
          {refused
            ? "Si c'est une erreur, parle à un membre du bureau de l'AEGB : il pourra revoir ta demande."
            : "Pour en parler ou demander la réactivation, contacte un membre du bureau de l'AEGB."}
        </p>
        <div className="mt-auto pt-10">
          <Button variant="outline" onClick={signOut} className="w-full">
            Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  )
}
