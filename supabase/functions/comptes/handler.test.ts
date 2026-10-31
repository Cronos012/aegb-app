import { describe, expect, it } from 'vitest'
import { createHandler, purge, type Deps } from './handler.ts'

const AWA = '11111111-1111-4111-8111-111111111111'
const BAKARY = '22222222-2222-4222-8222-222222222222'
const POST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function fakeDeps(failUser?: string) {
  const files: Record<string, string[]> = {
    [`profils/${AWA}`]: ['avatar-1.webp', 'cover-1.webp'],
    [`publications/${AWA}/${POST}`]: ['0.webp', '1.webp'],
    [`profils/${BAKARY}`]: [],
  }
  const log: string[] = []
  const deps: Deps = {
    rpc: async (name, args) => {
      log.push(`${name} ${JSON.stringify(args ?? {})}`)
      if (name === 'accounts_to_purge') {
        return [
          { id: AWA, name: 'Awa Diallo', post_folders: [POST] },
          { id: BAKARY, name: 'Bakary Bah', post_folders: [] },
        ]
      }
      return null
    },
    listFiles: async (bucket, folder) => files[`${bucket}/${folder}`] ?? [],
    removeFiles: async (bucket, paths) => {
      log.push(`remove ${bucket} ${paths.join(',')}`)
    },
    deleteUser: async (id) => {
      if (id === failUser) throw new Error('refusé')
      log.push(`delete ${id}`)
    },
  }
  return { deps, log }
}

describe('effacer les comptes fermés depuis 30 jours', () => {
  it('retire les photos, efface le compte, puis le note au journal', async () => {
    const { deps, log } = fakeDeps()
    expect(await purge(deps)).toEqual({ purged: 2, failed: [] })
    expect(log).toEqual([
      'accounts_to_purge {}',
      `remove profils ${AWA}/avatar-1.webp,${AWA}/cover-1.webp`,
      `remove publications ${AWA}/${POST}/0.webp,${AWA}/${POST}/1.webp`,
      `delete ${AWA}`,
      `account_purged {"p_id":"${AWA}","p_name":"Awa Diallo"}`,
      `delete ${BAKARY}`,
      `account_purged {"p_id":"${BAKARY}","p_name":"Bakary Bah"}`,
    ])
  })

  it("un échec n'arrête pas les autres, et n'est pas noté au journal", async () => {
    const { deps, log } = fakeDeps(AWA)
    expect(await purge(deps)).toEqual({ purged: 1, failed: [AWA] })
    expect(log.filter((l) => l.startsWith('account_purged'))).toEqual([`account_purged {"p_id":"${BAKARY}","p_name":"Bakary Bah"}`])
  })

  it('répond seulement aux appels de la base', async () => {
    const { deps } = fakeDeps()
    expect((await createHandler(deps)(new Request('https://f.test/comptes'))).status).toBe(405)
    const res = await createHandler(deps)(new Request('https://f.test/comptes', { method: 'POST' }))
    expect(await res.json()).toEqual({ purged: 2, failed: [] })
  })
})
