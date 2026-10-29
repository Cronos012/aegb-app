// Point d'entrée de la fonction serveur « helloasso » chez Supabase (Deno).
// Toute la logique est dans handler.ts.
//
// Secrets à régler (le workflow GitHub « Base Supabase » les pose tout seul
// s'ils sont dans les secrets du dépôt) :
//   HELLOASSO_CLIENT_ID, HELLOASSO_CLIENT_SECRET : identifiants de l'API HelloAsso
//   HELLOASSO_ORG : le nom court de l'association chez HelloAsso (dans l'adresse de sa page)
//   HELLOASSO_ENV : « production » pour les vrais paiements, sinon le bac à sable

import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler, readConfig } from './handler.ts'

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
    config: readConfig((name) => Deno.env.get(name)),
    fetch: (input, init) => fetch(input, init),
    userFromToken: async (token) => {
      const { data, error } = await admin.auth.getUser(token)
      return error || !data.user ? null : data.user.id
    },
    rpc: async (name, args) => {
      const { data, error } = await admin.rpc(name, args)
      if (error) throw new Error(`${name} : ${error.message}`)
      return data
    },
  }),
)
