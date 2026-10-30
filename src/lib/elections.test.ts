import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

const { choiceLabel, dayYear, hour, isoToParis, kindLabel, parisToIso, percent, plainDay, remaining, seatResults, votesFor } = await import('./elections')
type Assembly = import('./elections').Assembly
type Candidacy = import('./elections').Candidacy
type Question = import('./elections').Question

const person = (first: string, last: string) => ({ id: first, first_name: first, last_name: last, avatar_path: null, formation: null, school: null, member_type: 'etudiant' as const })
const cand = (id: string, first: string, last: string): Candidacy => ({ id, role: 'president', member: person(first, last), statement: '', status: 'validee', created_at: '', reason: null, outgoing: false })
const question = (over: Partial<Question>): Question => ({ id: 'q', position: 1, kind: 'poste', item_id: null, role: 'president', title: 'Présidence', detail: null, candidates: [], result: null, ...over })

describe('heures et dates de l’AG, heure de Paris', () => {
  it('écrit les heures à la française', () => {
    expect(hour('2026-12-12T13:00:00Z')).toBe('14 h')
    expect(hour('2026-12-05T22:59:00Z')).toBe('23 h 59')
    expect(hour('2026-06-12T13:05:00Z')).toBe('15 h 05')
  })

  it('écrit les jours, avec « 1er »', () => {
    expect(dayYear('2026-12-12T13:00:00Z')).toBe('samedi 12 décembre 2026')
    expect(plainDay('2027-01-01')).toBe('1er janvier 2027')
  })

  it('passe d’un champ de formulaire à un instant, hiver comme été', () => {
    expect(parisToIso('2026-12-12T14:00')).toBe('2026-12-12T13:00:00.000Z')
    expect(parisToIso('2027-06-12T14:00')).toBe('2027-06-12T12:00:00.000Z')
    expect(isoToParis('2026-12-12T13:00:00.000Z')).toBe('2026-12-12T14:00')
    expect(isoToParis(parisToIso('2027-03-28T09:30'))).toBe('2027-03-28T09:30')
  })

  it('compte le temps qui reste', () => {
    const now = Date.parse('2026-12-12T14:00:00Z')
    expect(remaining('2026-12-12T15:12:00Z', now)).toBe('1 h 12')
    expect(remaining('2026-12-12T14:09:30Z', now)).toBe('10 min')
    expect(remaining('2026-12-21T14:00:00Z', now)).toBe('9 jours')
  })
})

describe('libellés du vote', () => {
  it('nomme l’AG', () => {
    expect(kindLabel({ kind: 'ordinaire', convocation: 1 })).toBe('AG ordinaire')
    expect(kindLabel({ kind: 'extraordinaire', convocation: 2 })).toBe('Seconde AG extraordinaire')
  })

  it('calcule les pourcentages sans diviser par zéro', () => {
    expect(percent(53, 96)).toBe(55)
    expect(percent(0, 0)).toBe(0)
  })

  it('écrit le choix du bulletin', () => {
    const names = new Map([['c1', cand('c1', 'Alpha', 'Diallo')], ['c2', cand('c2', 'Mamadou', 'Barry')]])
    const res = question({ kind: 'resolution', role: null })
    expect(choiceLabel(res, 'abstention', names)).toBe('Abstention')
    expect(choiceLabel(question({ candidates: ['c1', 'c2'] }), 'c2', names)).toBe('Mamadou Barry')
    expect(choiceLabel(question({ candidates: ['c1'] }), 'pour', names)).toBe('Pour · Alpha Diallo')
    expect(choiceLabel(question({ candidates: ['c1'] }), 'blanc', names)).toBe('Vote blanc')
  })
})

describe('résultats par poste', () => {
  it('garde le second tour quand il a eu lieu', () => {
    const r1 = question({ id: 'q1', candidates: ['c1', 'c2', 'c3'], result: { counts: { c1: 10, c2: 10, c3: 2 }, expressed: 22, outcome: 'egalite', winner: null, tied: ['c1', 'c2'] } })
    const r2 = question({ id: 'q2', candidates: ['c1', 'c2'], result: { counts: { c1: 12, c2: 9 }, expressed: 21, outcome: 'pourvu', winner: 'c1', tied: [] } })
    const a = {
      seats: [{ role: 'president', label: 'Présidence', candidates: [] }],
      ballots: [{ round: 1, questions: [r1] }, { round: 2, questions: [r2] }],
    } as unknown as Assembly
    const [s] = seatResults(a)
    expect(s.round).toBe(2)
    expect(s.question?.id).toBe('q2')
    expect(s.firstRound?.id).toBe('q1')
    expect(votesFor(r2, 'c1')).toBe(12)
  })

  it('compte les « pour » d’une candidature seule', () => {
    const q = question({ candidates: ['c1'], result: { counts: { pour: 30, contre: 4, blanc: 3 }, expressed: 34, outcome: 'pourvu', winner: 'c1', tied: [] } })
    expect(votesFor(q, 'c1')).toBe(30)
  })
})
