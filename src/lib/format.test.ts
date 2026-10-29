import { describe, expect, it } from 'vitest'
import { frenchSpaces, fullName, initials, longDate, relative, shortDate, time } from './format'

describe('affichage', () => {
  it('écrit les noms et les initiales', () => {
    expect(fullName({ first_name: 'Aïssatou', last_name: 'Diallo' })).toBe('Aïssatou Diallo')
    expect(initials({ first_name: 'aïssatou', last_name: 'diallo' })).toBe('AD')
    expect(initials({ first_name: 'Cronos', last_name: '' })).toBe('CR')
    expect(initials({ first_name: ' ', last_name: '' })).toBe('?')
  })

  it("donne les dates à l'heure de Paris", () => {
    // 23 h 30 UTC le 28 octobre, c'est déjà le 29 à Paris (heure d'hiver : UTC+1).
    const d = '2026-10-28T23:30:00Z'
    expect(shortDate(d)).toBe('29 oct.')
    expect(longDate(d)).toBe('29 octobre 2026')
    expect(time(d)).toBe('00 h 30')
  })

  it('dit depuis quand, puis la date', () => {
    const now = new Date('2026-10-29T15:00:00Z')
    expect(relative('2026-10-29T14:58:00Z', now)).toBe('il y a 2 min')
    expect(relative('2026-10-29T09:00:00Z', now)).toBe('il y a 6 h')
    expect(relative('2026-10-28T09:00:00Z', now)).toBe('hier')
    expect(relative('2026-10-26T09:00:00Z', now)).toBe('il y a 3 jours')
    expect(relative('2026-10-20T09:00:00Z', now)).toBe('20 oct.')
  })

  it('colle la ponctuation haute au mot qui la précède', () => {
    expect(frenchSpaces('Bienvenue dans l’AEGB ! Ça va ? Oui : « super »')).toBe('Bienvenue dans l’AEGB\u00a0! Ça va\u00a0? Oui\u00a0: «\u00a0super\u00a0»')
    expect(frenchSpaces('https://aegb.fr')).toBe('https://aegb.fr')
  })
})
