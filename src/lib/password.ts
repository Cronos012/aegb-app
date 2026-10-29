export type PasswordCheck = { label: string; ok: boolean; optional?: boolean }

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: '8 caractères minimum', ok: password.length >= 8 },
    { label: 'Au moins un chiffre', ok: /\d/.test(password) },
    { label: 'Un caractère spécial, pour être encore plus sûr', ok: /[^A-Za-z0-9]/.test(password), optional: true },
  ]
}

export function passwordIsValid(password: string): boolean {
  return passwordChecks(password).every((c) => c.ok || c.optional)
}

/** De 0 à 4, pour la jauge sous le champ. */
export function passwordScore(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (password.length >= 12 || (/[a-z]/.test(password) && /[A-Z]/.test(password))) score++
  return score
}

export function passwordLabel(score: number): string {
  return ['', 'Trop faible', 'Moyen', 'Bon mot de passe', 'Très bon mot de passe'][score]
}
