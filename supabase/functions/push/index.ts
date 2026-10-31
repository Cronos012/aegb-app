// Point d'entrée de la fonction serveur « push » chez Supabase (Deno).
// Toute la logique est dans handler.ts, le chiffrement dans webpush.ts.
//
// Secrets (posés par le workflow GitHub « Base Supabase », une seule fois) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY : les clés d'envoi des notifications.
//   Les changer couperait les notifications de tous les appareils abonnés.
//   VAPID_SUBJECT (facultatif) : l'adresse de l'appli, donnée aux services
//   de notifications des navigateurs.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, readKeys } from './handler.ts'

function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    if (typeof keys.default === 'string') return keys.default
  } catch {
    // Pas de nouvelles clés : on prend l'ancienne clé serveur.
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serverKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})

Deno.serve(
  createHandler({
    keys: readKeys((name) => Deno.env.get(name)),
    subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://cronos012.github.io/aegb-app/',
    fetch: (url, init) => fetch(url, init),
    rpc: async (name, args) => {
      const { data, error } = await admin.rpc(name, args)
      if (error) throw new Error(`${name} : ${error.message}`)
      return data
    },
  }),
)
