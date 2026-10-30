import { Link } from 'react-router'
import { ChevronRight, SquareCheckBig } from 'lucide-react'
import { dayMonth, openBallot, useAssemblyAdmin } from '../../lib/elections'

/** Sur le tableau de bord : où en est l'AG, en une ligne. */
export function ElectionsCard() {
  const view = useAssemblyAdmin().data
  if (!view) return null
  const a = view.assembly
  const b = openBallot(a)
  let title = 'Élections'
  let detail = 'Aucune AG prévue : prépare la prochaine ici'
  let badge: number | null = null
  if (a) {
    const when = dayMonth(a.held_at)
    const pending = a.seats.reduce((n, s) => n + s.candidates.filter((c) => c.status === 'deposee').length, 0)
    switch (a.status) {
      case 'brouillon':
        title = `AG du ${when} en préparation`
        detail = 'Brouillon : la convocation n’est pas partie'
        break
      case 'convoquee':
        title = `AG du ${when} convoquée`
        detail = pending ? `${pending} candidature${pending > 1 ? 's' : ''} à vérifier` : 'Candidatures à jour'
        badge = pending || null
        break
      case 'vote':
        title = b?.round === 2 ? 'Second tour en cours' : 'Vote en cours'
        detail = b ? `${b.voters} votant${b.voters > 1 ? 's' : ''} sur ${b.electors}` : ''
        break
      case 'depouillement':
        title = 'Résultats à publier'
        detail = `AG du ${when} : seul le bureau les voit`
        badge = 1
        break
      case 'publiee':
        title = `Résultats de l’AG du ${when}`
        detail = 'Publiés dans le fil et l’onglet Votes'
        break
      case 'carence':
        title = `AG du ${when} : quorum non atteint`
        detail = 'Convoque la seconde AG'
        badge = 1
        break
      default:
        title = `AG du ${when} annulée`
        detail = 'Prépare la prochaine ici'
    }
  }
  return (
    <Link to="/bureau/elections" className="flex items-center gap-3.5 rounded-[22px] bg-surface p-4 text-ink no-underline hover:ring-2 hover:ring-line">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-safran-pale text-[#6B4A00]">
        <SquareCheckBig className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold">{title}</span>
        <span className="block truncate text-[13px] text-muted">{detail}</span>
      </span>
      {badge ? <span className="grid size-8 place-items-center rounded-full bg-safran text-sm font-extrabold text-nuit">{badge}</span> : <ChevronRight className="size-5 text-muted" />}
    </Link>
  )
}
