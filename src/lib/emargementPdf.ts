import { euros } from './dues'
import { whenLong, type AdminEvent } from './events'
import { TYPE_LABELS } from './format'

/* ----------------------------------------------------------------------------
   La feuille d'émargement d'un événement : un PDF A4 à imprimer, avec les
   inscrits par ordre alphabétique et une colonne pour signer.
---------------------------------------------------------------------------- */

/** Les polices de base du PDF ne connaissent pas les espaces fines de l'affichage en français. */
function plain(text: string): string {
  return text.replace(/[  ]/g, ' ').replace(/[’]/g, "'").replace(/«\s*/g, '"').replace(/\s*»/g, '"')
}

export async function emargementPdf(e: AdminEvent): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const H = 297
  const M = 16
  const indigo: [number, number, number] = [26, 35, 82]
  const ink: [number, number, number] = [18, 22, 43]
  const muted: [number, number, number] = [90, 96, 117]
  const line: [number, number, number] = [210, 214, 228]
  const paying = e.member_price_cents > 0
  const people = e.people
    .filter((p) => p.status === 'inscrit')
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'fr'))
  // Colonnes : numéro, nom, statut, paiement, signature.
  const cols = paying ? [M, M + 9, M + 74, M + 106, M + 136] : [M, M + 9, M + 84, M + 116]
  const rowH = 10
  let y = 0
  let page = 1

  doc.setProperties({ title: `Feuille d'émargement, ${e.title}`, author: "Le bureau de l'AEGB" })

  const band = () => {
    doc.setFillColor(...indigo)
    doc.rect(0, 0, W, 26, 'F')
    const third = W / 3
    doc.setFillColor(206, 17, 38)
    doc.rect(0, 26, third, 1.4, 'F')
    doc.setFillColor(252, 209, 22)
    doc.rect(third, 26, third, 1.4, 'F')
    doc.setFillColor(0, 148, 96)
    doc.rect(third * 2, 26, third, 1.4, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(19)
    doc.text('AEGB', M, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(plain('Association des Étudiants Guinéens de Brest'), M, 20.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(plain("Feuille d'émargement"), W - M, 14, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Page ${page}`, W - M, 20.5, { align: 'right' })
    y = 38
  }

  const head = () => {
    doc.setFillColor(241, 242, 248)
    doc.rect(M, y - 5.5, W - 2 * M, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...muted)
    const labels = paying ? ['N°', 'Nom', 'Statut', 'Paiement', 'Signature'] : ['N°', 'Nom', 'Statut', 'Signature']
    labels.forEach((label, i) => doc.text(label, cols[i] + 1, y))
    y += 9.5
  }

  band()
  doc.setTextColor(...ink)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(plain(e.title), M, y)
  y += 6.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...muted)
  doc.text(plain(`${whenLong(e)} · ${e.online ? 'en ligne' : (e.place ?? '')}`), M, y)
  y += 5.5
  doc.text(plain(`${people.length} inscription${people.length > 1 ? 's' : ''}${paying ? ` · place à ${euros(e.member_price_cents)}` : ''}`), M, y)
  y += 10
  head()

  const status = (p: AdminEvent['people'][number]) => (p.walk_in ? 'Sans inscription' : TYPE_LABELS[p.member_type])
  const payment = (p: AdminEvent['people'][number]) => (p.payment ? (p.payment.method === 'carte' ? 'Appli' : 'Espèces') : 'À régler')

  people.forEach((p, i) => {
    if (y + rowH > H - 16) {
      doc.addPage()
      page += 1
      band()
      head()
    }
    doc.setDrawColor(...line)
    doc.line(M, y + rowH - 6, W - M, y + rowH - 6)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...muted)
    doc.text(String(i + 1), cols[0] + 1, y)
    doc.setTextColor(...ink)
    doc.setFont('helvetica', 'bold')
    doc.text(plain(`${p.last_name.toUpperCase()} ${p.first_name}`).slice(0, 38), cols[1] + 1, y)
    doc.setFont('helvetica', 'normal')
    doc.text(plain(status(p)), cols[2] + 1, y)
    if (paying) doc.text(plain(payment(p)), cols[3] + 1, y)
    y += rowH
  })

  // Quelques lignes vides pour ceux qui viennent sans s'être inscrits.
  for (let k = 0; k < 6; k++) {
    if (y + rowH > H - 16) break
    doc.setDrawColor(...line)
    doc.line(M, y + rowH - 6, W - M, y + rowH - 6)
    y += rowH
  }

  return doc.output('blob')
}

export async function downloadEmargement(e: AdminEvent) {
  const blob = await emargementPdf(e)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `emargement-${e.starts_at.slice(0, 10)}.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
