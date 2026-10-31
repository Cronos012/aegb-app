import { useState } from 'react'
import { useParams } from 'react-router'
import { Download, Share2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { TopBar } from '../../components/dues/DuesParts'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { Logo } from '../../components/Logo'
import { useToast } from '../../components/Toast'
import { useDuesSettings, useReceipt, type Receipt } from '../../lib/dues'
import { errorMessage } from '../../lib/errors'
import { longDate } from '../../lib/format'
import { downloadReceipt, receiptLines, shareReceipt } from '../../lib/receiptPdf'

/** La quittance telle qu'elle sera imprimée. */
export function ReceiptPaper({ receipt, address, rna }: { receipt: Receipt; address?: string | null; rna?: string | null }) {
  const l = receiptLines(receipt)
  const footer = [address, rna ? `RNA ${rna}` : null].filter(Boolean).join(' · ')
  return (
    <article className="relative overflow-hidden rounded-[12px] border border-line-soft bg-white text-[#12162B] shadow-[0_6px_24px_rgba(18,22,43,0.08)]">
      <header className="bg-tisse flex items-center gap-3 px-5 py-4 text-white">
        <Logo size={36} />
        <div className="min-w-0 flex-1">
          <p className="titre m-0 text-lg leading-tight">AEGB</p>
          <p className="m-0 truncate text-[11px] text-white/80">Association des Étudiants Guinéens de Brest</p>
        </div>
        <span className="text-xs font-bold">N° {receipt.number}</span>
      </header>
      <div className="barre-tricolore h-1" aria-hidden="true" />
      <div className="flex flex-col gap-3 px-5 py-5">
        <h2 className="titre m-0 text-[20px]">{l.title}</h2>
        <p className="m-0 text-[13px] leading-[1.45] text-[#5A6075]">{l.from}</p>
        <dl className="m-0 flex flex-col">
          {l.rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 border-t border-[#E3E6F0] py-2 text-[13px]">
              <dt className="text-[#5A6075]">{label}</dt>
              <dd className="m-0 text-right font-bold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-baseline justify-between rounded-[14px] bg-[#F5F6FB] px-4 py-3">
          <span className="text-[13px] text-[#5A6075]">Montant reçu</span>
          <span className="titre text-[24px]">{l.amount}</span>
        </div>
        <p className="m-0 text-[12px] leading-[1.5]">{l.certify}</p>
        <p className="m-0 text-[12px]">{l.place}</p>
        <p className="m-0 text-[13px] font-bold">{l.signature}</p>
        {footer ? <p className="m-0 border-t border-[#E3E6F0] pt-3 text-center text-[11px] text-[#5A6075]">{footer}</p> : null}
      </div>
      {receipt.cancelled_at ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
          <span className="rotate-[-18deg] rounded-xl border-4 border-[#B3122A] px-4 py-1 text-[32px] font-extrabold tracking-wider text-[#B3122A] opacity-80">ANNULÉE</span>
        </div>
      ) : null}
    </article>
  )
}

export function Quittance() {
  const { numero } = useParams()
  const receipt = useReceipt(numero)
  const settings = useDuesSettings()
  const toast = useToast()
  const [busy, setBusy] = useState<'pdf' | 'partage' | null>(null)

  async function run(kind: 'pdf' | 'partage') {
    if (!receipt.data) return
    setBusy(kind)
    try {
      if (kind === 'pdf') await downloadReceipt(receipt.data, settings.data)
      else if ((await shareReceipt(receipt.data, settings.data)) === 'telecharge') toast('La quittance est téléchargée.')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(null)
    }
  }

  if (receipt.isPending) return <PageLoader />
  const r = receipt.data

  return (
    <div className="flex flex-1 flex-col bg-page lg:mx-10 lg:my-8 lg:max-w-[560px]">
      <TopBar
        title={r ? `Quittance n° ${r.number}` : 'Quittance'}
        subtitle={r ? (r.cancelled_at ? `Annulée le ${longDate(r.cancelled_at)}` : 'PDF · 1 page') : undefined}
        fallback="/app/cotisation/historique"
        right={
          r ? (
            <button type="button" onClick={() => run('partage')} aria-label="Partager" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-surface-2">
              <Share2 className="size-5" />
            </button>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),20px)] lg:px-0">
        <ErrorNote error={receipt.error} />
        {!r && !receipt.error ? <EmptyState title="Quittance introuvable">Elle n'existe pas, ou tu n'as pas le droit de la voir.</EmptyState> : null}
        {r ? (
          <>
            <ReceiptPaper receipt={r} address={settings.data?.org_address} rna={settings.data?.org_rna} />
            <div className="mt-auto grid grid-cols-2 gap-2.5">
              <Button onClick={() => run('pdf')} busy={busy === 'pdf'} icon={<Download className="size-5" />}>
                Télécharger
              </Button>
              <Button variant="outline" onClick={() => run('partage')} busy={busy === 'partage'} icon={<Share2 className="size-5" />}>
                Partager
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
