import { describe, expect, it } from 'vitest'
import { passwordIsValid, passwordScore } from './password'

describe('mot de passe', () => {
  it('demande 8 caractères et un chiffre', () => {
    expect(passwordIsValid('court1')).toBe(false)
    expect(passwordIsValid('sanschiffre')).toBe(false)
    expect(passwordIsValid('bonjour2026')).toBe(true)
  })

  it("n'exige pas de caractère spécial", () => {
    expect(passwordIsValid('abcdefg1')).toBe(true)
  })

  it('note la solidité de 0 à 4', () => {
    expect(passwordScore('')).toBe(0)
    expect(passwordScore('abc')).toBe(0)
    expect(passwordScore('abcdefg1')).toBe(2)
    expect(passwordScore('Abcdefg1!')).toBe(4)
  })
})
