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

/** La quittance en PDF, une page A4. jsPDF n'est chargé qu'à la demande. */
export async function receiptPdf(r: Receipt, settings: Pick<DuesSettings, 'org_address' | 'org_rna'> | null | undefined): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const lines = receiptLines(r)
  const W = 210
  const H = 297
  const M = 20
  const indigo: [number, number, number] = [26, 35, 82]
  const muted: [number, number, number] = [90, 96, 117]

  doc.setProperties({ title: `Quittance n° ${r.number}`, author: "Le bureau de l'AEGB", subject: lines.title })

  // Bandeau indigo et barre aux couleurs du drapeau.
  doc.setFillColor(...indigo)
  doc.rect(0, 0, W, 38, 'F')
  const third = W / 3
  doc.setFillColor(206, 17, 38)
  doc.rect(0, 38, third, 2, 'F')
  doc.setFillColor(252, 209, 22)
  doc.rect(third, 38, third, 2, 'F')
  doc.setFillColor(0, 148, 96)
  doc.rect(third * 2, 38, third, 2, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.text('AEGB', M, 19)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(plain('Association des Étudiants Guinéens de Brest'), M, 28)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(plain(`N° ${r.number}`), W - M, 19, { align: 'right' })

  let y = 60
  doc.setTextColor(18, 22, 43)
  doc.setFontSize(22)
  doc.text(plain(lines.title), M, y)
  y += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(...muted)
  doc.text(doc.splitTextToSize(plain(lines.from), W - 2 * M), M, y)
  y += 14

  doc.setDrawColor(227, 230, 240)
  for (const [label, value] of lines.rows) {
    doc.line(M, y - 6, W - M, y - 6)
    doc.setTextColor(...muted)
    doc.setFont('helvetica', 'normal')
    doc.text(plain(label), M, y)
    doc.setTextColor(18, 22, 43)
    doc.setFont('helvetica', 'bold')
    doc.text(plain(value), W - M, y, { align: 'right', maxWidth: 110 })
    y += 12
  }

  // Le montant reçu, en évidence.
  doc.setFillColor(245, 246, 251)
  doc.roundedRect(M, y - 3, W - 2 * M, 20, 4, 4, 'F')
  doc.setTextColor(...muted)
  doc.setFont('helvetica', 'normal')
  doc.text(plain('Montant reçu'), M + 7, y + 8.5)
  doc.setTextColor(18, 22, 43)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(plain(lines.amount), W - M - 7, y + 9.5, { align: 'right' })
  y += 32

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(18, 22, 43)
  doc.text(doc.splitTextToSize(plain(lines.certify), W - 2 * M), M, y)
  y += 18
  doc.text(plain(lines.place), M, y)
  y += 9
  doc.setFont('helvetica', 'bold')
  doc.text(plain(lines.signature), M, y)

  if (r.cancelled_at) {
    doc.setTextColor(179, 18, 42)
    doc.setFontSize(44)
    doc.text(plain('ANNULÉE'), W / 2, 175, { align: 'center', angle: 18 })
    doc.setFontSize(11)
    doc.text(plain(`Paiement annulé le ${longDate(r.cancelled_at)}`), W / 2, 190, { align: 'center' })
  }

  const footer = [settings?.org_address, settings?.org_rna ? `RNA ${settings.org_rna}` : null].filter(Boolean).join(' · ')
  if (footer) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...muted)
    doc.text(plain(footer), W / 2, H - 14, { align: 'center' })
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
