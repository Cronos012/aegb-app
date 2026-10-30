type MaybeError = { message?: string; code?: string; status?: number; name?: string } | null | undefined

/** Traduit une erreur Supabase ou réseau en phrase claire pour le membre. */
export function errorMessage(error: unknown): string {
  const e = error as MaybeError
  const message = e?.message ?? ''
  const code = e?.code ?? ''

  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Pas de connexion internet. Vérifie ton réseau et réessaie."
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'Email ou mot de passe incorrect.'
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return "Ton adresse email n'est pas encore confirmée. Clique sur le lien reçu par email."
  }
  if (code === 'over_email_send_rate_limit' || e?.status === 429 || /rate limit/i.test(message)) {
    return 'Trop de demandes en peu de temps. Attends quelques minutes et réessaie.'
  }
  if (code === 'weak_password' || /password should/i.test(message)) {
    return 'Ce mot de passe est trop faible. Choisis-en un plus long.'
  }
  if (code === 'same_password') {
    return "C'est déjà ton mot de passe actuel. Choisis-en un nouveau."
  }
  if (code === 'email_address_invalid' || /email address .* is invalid/i.test(message)) {
    return "Cette adresse email n'est pas valide."
  }
  if (/jwt expired|refresh token/i.test(message)) {
    return 'Ta session a expiré. Reconnecte-toi.'
  }
  // Les fonctions de la base renvoient déjà des messages en français.
  if (['22023', '42501', 'P0002', 'P0001'].includes(code) && message) {
    return message
  }
  // Un second bulletin : la base le dit en français.
  if (code === '23505' && message && !/duplicate key/i.test(message)) {
    return message
  }
  return 'Quelque chose a coincé. Réessaie dans un instant.'
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}
