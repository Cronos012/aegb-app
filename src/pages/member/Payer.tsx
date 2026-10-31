import { Navigate } from 'react-router'
import { TopBar } from '../../components/dues/DuesParts'
import { PayPanel } from '../../components/dues/PayPanel'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { useMyDues } from '../../lib/dues'
import { useIsDesktop } from '../../lib/media'

/** Sur téléphone, le choix des mois et le paiement ont leur écran. Sur ordinateur, ils sont dans « Ma cotisation ». */
export function Payer() {
  const dues = useMyDues()
  const desktop = useIsDesktop()
  if (desktop) return <Navigate to="/app/cotisation" replace />
  if (dues.isPending) return <PageLoader />
  const s = dues.data
  return (
    <div className="flex flex-1 flex-col bg-surface">
      <TopBar title="Payer ma cotisation" fallback="/app/cotisation" />
      <div className="flex flex-1 flex-col px-5 pt-[18px]">
        {!s ? <ErrorNote error={dues.error ?? 'Ta cotisation est introuvable.'} /> : null}
        {s && (!s.paying || s.status === 'pas_encore') ? <ErrorNote error={s.paying ? 'Les cotisations ne sont pas encore ouvertes.' : "Ta cotisation n'est pas due."} /> : null}
        {s && s.paying && s.status !== 'pas_encore' ? <PayPanel state={s} footerClass="sticky bottom-0 -mx-5 mt-auto border-t border-line-soft bg-surface px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]" /> : null}
      </div>
    </div>
  )
}
