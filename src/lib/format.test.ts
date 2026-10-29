import { describe, expect, it } from 'vitest'
import { fullName, initials, longDate, shortDate, time } from './format'

describe('affichage', () => {
  it('écrit les noms et les initiales', () => {
    expect(fullName({ first_name: 'Aïssatou', last_name: 'Diallo' })).toBe('Aïssatou Diallo')
    expect(initials({ first_name: 'aïssatou', last_name: 'diallo' })).toBe('AD')
    expect(initials({ first_name: ' ', last_name: '' })).toBe('?')
  })

  it("donne les dates à l'heure de Paris", () => {
    // 23 h 30 UTC le 28 octobre, c'est déjà le 29 à Paris (heure d'hiver : UTC+1).
    const d = '2026-10-28T23:30:00Z'
    expect(shortDate(d)).toBe('29 oct.')
    expect(longDate(d)).toBe('29 octobre 2026')
    expect(time(d)).toBe('00 h 30')
  })
})
