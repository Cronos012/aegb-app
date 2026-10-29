import { eurosExact, frenchDay, METHOD_LABELS, monthsLabel, type DuesSettings, type Receipt } from './dues'
import { longDate } from './format'

const TYPES: Record<Receipt['member_type'], string> = {
  etudiant: 'membre étudiant',
  alumni: 'membre alumni',
  sympathisant: 'membre sympathisant',
  honneur: "membre d'honneur",
}

/** Les lignes de la quittance, communes à l'écran et au PDF. */
export function receiptLines(r: Receipt) {
  const n = r.months.length
  return {
    title: 'Quittance de cotisation',
    from: `Reçue de ${r.member_name}, ${TYPES[r.member_type]} de l'AEGB.`,
    rows: [
      ['Période', monthsLabel(r.months)],
      ['Détail', `${n} mois × ${eurosExact(r.monthly_cents)}`],
      ['Moyen de paiement', r.method === 'carte' ? 'Carte bancaire, via HelloAsso' : METHOD_LABELS[r.method]],
      ['Payé le', frenchDay(r.paid_on)],
      ...(r.reference ? [[r.method === 'carte' ? 'Référence HelloAsso' : 'Référence', r.reference]] : []),
    ] as [string, string][],
    amount: eurosExact(r.amount_cents),
    certify: "L'AEGB certifie avoir reçu cette somme au titre de la cotisation de son membre pour la période indiquée.",
    place: `À Brest, le ${longDate(r.issued_at)}`,
    signature: "Le bureau de l'AEGB",
  }
}

/** Les polices de base du PDF ne connaissent pas les espaces fines de l'affichage en français. */
function plain(text: string): string {
  return text.replace(/[  ]/g, ' ').replace(/[−]/g, '-')
}

export function receiptFileName(r: Receipt): string {
  return `quittance-aegb-${r.number}.pdf`
}

/** La quittance en PDF, une page A5. jsPDF n'est chargé qu'à la demande. */
export async function receiptPdf(r: Receipt, settings: Pick<DuesSettings, 'org_address' | 'org_rna'> | null | undefined): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const lines = receiptLines(r)
  const W = 148
  const M = 14
  const indigo: [number, number, number] = [26, 35, 82]
  const muted: [number, number, number] = [90, 96, 117]

  doc.setProperties({ title: `Quittance n° ${r.number}`, author: "Le bureau de l'AEGB", subject: lines.title })

  // Bandeau indigo et barre aux couleurs du drapeau.
  doc.setFillColor(...indigo)
  doc.rect(0, 0, W, 30, 'F')
  const third = W / 3
  doc.setFillColor(206, 17, 38)
  doc.rect(0, 30, third, 1.6, 'F')
  doc.setFillColor(252, 209, 22)
  doc.rect(third, 30, third, 1.6, 'F')
  doc.setFillColor(0, 148, 96)
  doc.rect(third * 2, 30, third, 1.6, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('AEGB', M, 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(plain('Association des Étudiants Guinéens de Brest'), M, 22)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(plain(`N° ${r.number}`), W - M, 15, { align: 'right' })

  let y = 46
  doc.setTextColor(18, 22, 43)
  doc.setFontSize(17)
  doc.text(plain(lines.title), M, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...muted)
  doc.text(doc.splitTextToSize(plain(lines.from), W - 2 * M), M, y)
  y += 10

  doc.setDrawColor(227, 230, 240)
  for (const [label, value] of lines.rows) {
    doc.line(M, y - 4.5, W - M, y - 4.5)
    doc.setTextColor(...muted)
    doc.setFont('helvetica', 'normal')
    doc.text(plain(label), M, y)
    doc.setTextColor(18, 22, 43)
    doc.setFont('helvetica', 'bold')
    doc.text(plain(value), W - M, y, { align: 'right', maxWidth: 80 })
    y += 9
  }

  // Le montant reçu, en évidence.
  doc.setFillColor(245, 246, 251)
  doc.roundedRect(M, y - 3, W - 2 * M, 16, 3, 3, 'F')
  doc.setTextColor(...muted)
  doc.setFont('helvetica', 'normal')
  doc.text(plain('Montant reçu'), M + 5, y + 6.5)
  doc.setTextColor(18, 22, 43)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(plain(lines.amount), W - M - 5, y + 7, { align: 'right' })
  y += 24

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(18, 22, 43)
  doc.text(doc.splitTextToSize(plain(lines.certify), W - 2 * M), M, y)
  y += 14
  doc.text(plain(lines.place), M, y)
  y += 7
  doc.setFont('helvetica', 'bold')
  doc.text(plain(lines.signature), M, y)

  if (r.cancelled_at) {
    doc.setTextColor(179, 18, 42)
    doc.setFontSize(30)
    doc.text(plain('ANNULÉE'), W / 2, 125, { align: 'center', angle: 18 })
    doc.setFontSize(9)
    doc.text(plain(`Paiement annulé le ${longDate(r.cancelled_at)}`), W / 2, 136, { align: 'center' })
  }

  const footer = [settings?.org_address, settings?.org_rna ? `RNA ${settings.org_rna}` : null].filter(Boolean).join(' · ')
  if (footer) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...muted)
    doc.text(plain(footer), W / 2, 200, { align: 'center' })
  }

  return doc.output('blob')
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadReceipt(r: Receipt, settings: Pick<DuesSettings, 'org_address' | 'org_rna'> | null | undefined) {
  save(await receiptPdf(r, settings), receiptFileName(r))
}

/** Partage le PDF avec le menu du téléphone ; sinon, le télécharge. */
export async function shareReceipt(r: Receipt, settings: Pick<DuesSettings, 'org_address' | 'org_rna'> | null | undefined): Promise<'partage' | 'telecharge'> {
  const blob = await receiptPdf(r, settings)
  const file = new File([blob], receiptFileName(r), { type: 'application/pdf' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Quittance n° ${r.number}` })
      return 'partage'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'partage'
    }
  }
  save(blob, receiptFileName(r))
  return 'telecharge'
}
