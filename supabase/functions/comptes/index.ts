// Point d'entrée de la fonction serveur « comptes » chez Supabase (Deno).
// Toute la logique est dans handler.ts. Aucun secret à régler.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler } from './handler.ts'

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
    rpc: async (name, args) => {
      const { data, error } = await admin.rpc(name, args)
      if (error) throw new Error(`${name} : ${error.message}`)
      return data
    },
    listFiles: async (bucket, folder) => {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 })
      if (error) throw new Error(error.message)
      // Un dossier vide n'a qu'un fichier caché ; les sous-dossiers n'ont pas d'identifiant.
      return (data ?? []).filter((f) => f.id).map((f) => f.name)
    },
    removeFiles: async (bucket, paths) => {
      const { error } = await admin.storage.from(bucket).remove(paths)
      if (error) throw new Error(error.message)
    },
    deleteUser: async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw new Error(error.message)
    },
  }),
)
