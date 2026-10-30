import { describe, expect, it } from 'vitest'
import { errorMessage, isEmail } from './errors'

describe('messages d’erreur', () => {
  it('traduit les erreurs de connexion', () => {
    expect(errorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('Email ou mot de passe incorrect.')
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/Pas de connexion internet/)
  })

  it('garde les messages en français de la base', () => {
    expect(errorMessage({ code: '42501', message: "Ton poste ne permet pas de faire ça." })).toBe("Ton poste ne permet pas de faire ça.")
  })

  it('dit quand trop de monde se connecte ou vote en même temps', () => {
    expect(errorMessage({ status: 429, message: 'Request rate limit reached' })).toMatch(/Trop de demandes/)
    expect(errorMessage({ code: '57014', message: 'canceling statement due to statement timeout' })).toMatch(/Beaucoup de monde/)
    expect(errorMessage({ status: 504, message: '' })).toMatch(/Beaucoup de monde/)
  })

  it("n'affiche jamais un message technique inconnu", () => {
    expect(errorMessage({ code: 'XX000', message: 'internal error' })).toBe('Quelque chose a coincé. Réessaie dans un instant.')
  })

  it('reconnaît une adresse email', () => {
    expect(isEmail(' a.b@exemple.fr ')).toBe(true)
    expect(isEmail('a.b@exemple')).toBe(false)
  })
})
