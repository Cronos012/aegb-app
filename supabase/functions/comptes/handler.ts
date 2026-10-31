// La fonction serveur « comptes » : chaque nuit, la base l'appelle s'il y a
// des comptes fermés depuis 30 jours. Elle retire leurs photos (profil,
// couverture, publications), efface le compte, puis le note au journal.
// Le reste suit tout seul dans la base : le profil, les publications, les
// commentaires et les réactions partent avec le compte ; les messages
// restent sous « Ancien membre », les paiements restent au journal financier.
// Un appel de trop ne fait rien : seuls les comptes arrivés au bout des
// 30 jours sont effacés.

export interface Purge {
  id: string
  name: string
  post_folders: string[]
}

export interface Deps {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>
  /** Les fichiers d'un dossier (sans les sous-dossiers). */
  listFiles: (bucket: string, folder: string) => Promise<string[]>
  removeFiles: (bucket: string, paths: string[]) => Promise<void>
  deleteUser: (id: string) => Promise<void>
}

/** Les dossiers d'un compte : ses photos, et un dossier par publication. */
export function foldersOf(account: Purge): { bucket: string; folder: string }[] {
  return [
    { bucket: 'profils', folder: account.id },
    ...account.post_folders.map((post) => ({ bucket: 'publications', folder: `${account.id}/${post}` })),
  ]
}

export async function purge(deps: Deps): Promise<{ purged: number; failed: string[] }> {
  const accounts = ((await deps.rpc('accounts_to_purge')) ?? []) as Purge[]
  let purged = 0
  const failed: string[] = []
  for (const account of accounts) {
    try {
      for (const { bucket, folder } of foldersOf(account)) {
        const files = await deps.listFiles(bucket, folder)
        if (files.length) await deps.removeFiles(bucket, files.map((f) => `${folder}/${f}`))
      }
      await deps.deleteUser(account.id)
      await deps.rpc('account_purged', { p_id: account.id, p_name: account.name })
      purged++
    } catch {
      // Il sera repris la nuit suivante.
      failed.push(account.id)
    }
  }
  return { purged, failed }
}

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response('Méthode non prise en charge.', { status: 405 })
    try {
      return Response.json(await purge(deps))
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }
}
