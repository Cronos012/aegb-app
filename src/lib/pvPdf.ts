import { candidacyMap, dayYear, hour, percent, plainDay, seatResults, type Assembly, type Question } from './elections'
import { longDate } from './format'

/* ----------------------------------------------------------------------------
   Le procès-verbal des votes (article 21) : un PDF A4 avec l'ordre du jour,
   les inscrits, les votants, le quorum et chaque résultat, puis la place des
   signatures. Après un quorum manqué, le procès-verbal de carence.
---------------------------------------------------------------------------- */

const OUTCOMES: Record<string, string> = {
  adoptee: 'Adoptée',
  rejetee: 'Rejetée',
  pourvu: 'Poste pourvu',
  vacant: 'Poste vacant',
  egalite: 'Égalité',
}

/** Les polices de base du PDF ne connaissent pas les espaces fines de l'affichage en français. */
function plain(text: string): string {
  return text.replace(/[  ]/g, ' ').replace(/[−]/g, '-').replace(/[«»]/g, '"')
}

function quorumWords(a: Assembly, round: number): string {
  if (round === 2) return 'sans quorum (second tour)'
  if (a.convocation === 2) return a.kind === 'ordinaire' ? 'sans quorum (seconde AG, article 13)' : 'un tiers des inscrits (seconde AG, article 14)'
  return a.kind === 'ordinaire' ? 'un tiers des inscrits (article 13)' : 'la moitié des inscrits (article 14)'
}

export function pvFileName(a: Assembly): string {
  return `proces-verbal-ag-${a.held_at.slice(0, 10)}.pdf`
}

export async function pvPdf(a: Assembly): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const H = 297
  const M = 18
  const indigo: [number, number, number] = [26, 35, 82]
  const ink: [number, number, number] = [18, 22, 43]
  const muted: [number, number, number] = [90, 96, 117]
  const line: [number, number, number] = [227, 230, 240]
  const first = a.ballots.find((b) => b.round === 1) ?? null
  const carence = a.status === 'carence'
  const names = candidacyMap(a)
  const title = carence ? 'Procès-verbal de carence' : 'Procès-verbal des votes'
  let y = 0

  doc.setProperties({ title: `${title}, AG du ${dayYear(a.held_at)}`, author: "Le bureau de l'AEGB", subject: title })

  const band = () => {
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
    doc.setFontSize(22)
    doc.text('AEGB', M, 16)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(plain('Association des Étudiants Guinéens de Brest'), M, 23.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(plain(title), W - M, 16, { align: 'right' })
    y = 44
  }
  const room = (h: number) => {
    if (y + h > H - 18) {
      doc.addPage()
      band()
    }
  }
  const heading = (text: string) => {
    room(16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...indigo)
    doc.text(plain(text), M, y)
    y += 3
    doc.setDrawColor(...line)
    doc.line(M, y, W - M, y)
    y += 7
  }
  const row = (label: string, value: string, bold = false) => {
    room(8)
    doc.setFontSize(10.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...muted)
    doc.text(plain(label), M, y)
    doc.setTextColor(...ink)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(plain(value), W - M, y, { align: 'right', maxWidth: 110 })
    y += 7
  }
  const para = (text: string, size = 10.5, color = ink) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(plain(text), W - 2 * M)
    room(lines.length * size * 0.45 + 2)
    doc.text(lines, M, y)
    y += lines.length * size * 0.45 + 2
  }

  band()
  doc.setTextColor(...ink)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.text(plain(`${a.convocation === 2 ? 'Seconde assemblée générale' : 'Assemblée générale'} ${a.kind}`), M, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11.5)
  doc.setTextColor(...muted)
  doc.text(plain(`${dayYear(a.held_at)}, ${hour(a.held_at)}, ${a.place}`), M, y)
  y += 11

  heading('Convocation et vote')
  if (a.convened_at) row('Convocation envoyée', `le ${longDate(a.convened_at)}, à ${a.convened_count ?? '?'} membres (article 12)`)
  row('Vote dans l’appli', `de ${hour(a.vote_opens_at)} à ${hour(a.vote_closes_at)}, en salle ou à distance`)
  if (first) {
    row('Inscrits sur la liste électorale', `${first.electors} (étudiants actifs à jour, articles 7 et 32)`)
    row('Votants', `${first.voters} (${percent(first.voters, first.electors)} %)`, true)
    row('Quorum', first.quorum ? `${first.quorum} votants, ${quorumWords(a, 1)}` : quorumWords(a, 1))
    row('Résultat du quorum', first.quorum === 0 || first.voters >= first.quorum ? 'atteint' : 'non atteint', true)
  }
  if (a.first) {
    para(`Cette seconde assemblée fait suite à celle du ${dayYear(a.first.held_at)}, qui n’avait pas atteint le quorum (${a.first.voters ?? 0} votants sur ${a.first.electors ?? 0}).`, 10, muted)
  }
  y += 3

  heading('Ordre du jour')
  for (const i of a.items) {
    para(`${i.position}. ${i.title}${i.kind === 'discussion' ? ' (sans vote)' : ''}${i.detail ? `, ${i.detail}` : ''}`)
  }
  y += 3

  if (carence) {
    heading('Constat')
    para(
      `Le quorum n’est pas atteint : ${first?.voters ?? 0} votants sur ${first?.electors ?? 0}, il en fallait ${first?.quorum ?? 0}. Le vote ne compte pas : les bulletins ont été détruits à la fermeture, sans être lus. Le bureau convoque une seconde assemblée générale entre 7 et 21 jours plus tard, avec le même ordre du jour (article 13).`,
    )
  } else {
    const resolutions = first?.questions.filter((q) => q.kind === 'resolution') ?? []
    if (resolutions.length) {
      heading('Résolutions')
      for (const q of resolutions) resolutionBlock(q)
      para(a.kind === 'extraordinaire' ? 'Adoptée avec les deux tiers des suffrages exprimés (article 14).' : 'Adoptée avec plus de « pour » que de « contre » ; les abstentions ne comptent pas dans les suffrages exprimés (article 13).', 9, muted)
      y += 3
    }
    const seats = seatResults(a)
    if (seats.length) {
      heading(`Élection du bureau ${a.mandate_year}`)
      for (const s of seats) seatBlock(s.label, s.question, s.firstRound, s.round)
      para('Pourcentages des suffrages exprimés, sans les votes blancs (article 13).', 9, muted)
      para(a.mandate_start ? `Prise de poste le ${plainDay(a.mandate_start)} (article 16).` : 'Élection partielle : prise de poste dès la passation, jusqu’au 31 décembre (article 25).', 9, muted)
    }
  }

  // Signatures (article 21).
  room(48)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...ink)
  doc.text(plain(`Fait à Brest, le ${longDate(a.published_at ?? first?.closed_at ?? a.held_at)}`), M, y)
  y += 10
  const half = (W - 2 * M - 10) / 2
  doc.setFont('helvetica', 'bold')
  doc.text(plain('Pour la présidence'), M, y)
  doc.text(plain('Pour le secrétariat général'), M + half + 10, y)
  y += 5
  doc.setDrawColor(...line)
  doc.roundedRect(M, y, half, 26, 3, 3, 'S')
  doc.roundedRect(M + half + 10, y, half, 26, 3, 3, 'S')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...muted)
  doc.text(plain('Nom et signature'), M + 3, y + 23)
  doc.text(plain('Nom et signature'), M + half + 13, y + 23)

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...muted)
    doc.text(plain(`Page ${p} sur ${pages}. Vote secret : l’appli ne garde que la liste des votants et les totaux, jamais un bulletin.`), W / 2, H - 9, { align: 'center' })
  }
  return doc.output('blob')

  function resolutionBlock(q: Question) {
    const r = q.result
    if (!r) return
    const pour = r.counts.pour ?? 0
    const contre = r.counts.contre ?? 0
    const abst = r.counts.abstention ?? 0
    room(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...ink)
    doc.text(plain(q.title), M, y, { maxWidth: 120 })
    doc.text(plain(OUTCOMES[r.outcome]), W - M, y, { align: 'right' })
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...muted)
    doc.text(plain(`${pour} pour, ${contre} contre, ${abst} abstention${abst > 1 ? 's' : ''} · ${r.expressed} suffrages exprimés · ${percent(pour, r.expressed)} % de pour`), M, y)
    y += 8
  }

  function seatBlock(label: string, q: Question | null, firstRound: Question | null, round: number) {
    room(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...ink)
    doc.text(plain(label), M, y)
    if (!q || !q.result) {
      doc.setFont('helvetica', 'normal')
      doc.text(plain('Aucun candidat : poste vacant'), W - M, y, { align: 'right' })
      y += 8
      return
    }
    const r = q.result
    const winner = r.winner ? names.get(r.winner) : null
    const verdict =
      r.outcome === 'pourvu' && winner
        ? `Titulaire ${a.mandate_year} : ${winner.member.first_name} ${winner.member.last_name}`
        : r.outcome === 'egalite'
          ? 'Égalité persistante : le règlement intérieur tranche'
          : 'Poste vacant'
    doc.text(plain(verdict), W - M, y, { align: 'right', maxWidth: 110 })
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...muted)
    if (round === 2 && firstRound?.result) {
      doc.text(plain(`Premier tour : ${scoreLine(firstRound)}`), M, y, { maxWidth: W - 2 * M })
      y += 5
      doc.text(plain(`Second tour : ${scoreLine(q)}`), M, y, { maxWidth: W - 2 * M })
    } else {
      doc.text(plain(scoreLine(q)), M, y, { maxWidth: W - 2 * M })
    }
    y += 8
  }

  function scoreLine(q: Question): string {
    const r = q.result
    if (!r) return ''
    if (q.candidates.length === 1) {
      const pour = r.counts.pour ?? 0
      return `${pour} pour (${percent(pour, r.expressed)} %), ${r.counts.contre ?? 0} contre, ${r.counts.blanc ?? 0} blanc${(r.counts.blanc ?? 0) > 1 ? 's' : ''}`
    }
    const parts = q.candidates.map((id) => {
      const c = names.get(id)
      const n = r.counts[id] ?? 0
      return `${c ? `${c.member.first_name} ${c.member.last_name}` : 'Candidat'} ${n} voix (${percent(n, r.expressed)} %)`
    })
    return `${parts.join(', ')}, ${r.counts.blanc ?? 0} blanc${(r.counts.blanc ?? 0) > 1 ? 's' : ''}`
  }
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadPv(a: Assembly) {
  save(await pvPdf(a), pvFileName(a))
}

