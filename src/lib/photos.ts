import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/*
  Les photos sont dans des espaces privés : on demande des liens signés, par
  lots, et on les garde en mémoire. Chaque nouvelle photo a un nouveau nom de
  fichier, donc un lien en cache ne montre jamais une ancienne photo.
*/

export type Bucket = 'profils' | 'publications'

const BUCKET: Bucket = 'profils'
const LIFETIME_S = 60 * 60 * 12
const cache = new Map<string, { url: string; expires: number }>()
const waiting = new Map<Bucket, Map<string, ((url: string | null) => void)[]>>()
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  timer = null
  const batches = [...waiting.entries()]
  waiting.clear()
  await Promise.all(
    batches.map(async ([bucket, callbacks]) => {
      const paths = [...callbacks.keys()]
      const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, LIFETIME_S)
      const expires = Date.now() + (LIFETIME_S - 600) * 1000
      for (const path of paths) {
        const url = data?.find((d) => d.path === path)?.signedUrl ?? null
        if (url) cache.set(`${bucket}:${path}`, { url, expires })
        for (const cb of callbacks.get(path) ?? []) cb(url)
      }
    }),
  )
}

function cached(bucket: Bucket, path: string): string | null {
  const hit = cache.get(`${bucket}:${path}`)
  return hit && hit.expires > Date.now() ? hit.url : null
}

function request(bucket: Bucket, path: string): Promise<string | null> {
  const hit = cached(bucket, path)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve) => {
    const callbacks = waiting.get(bucket) ?? new Map<string, ((url: string | null) => void)[]>()
    callbacks.set(path, [...(callbacks.get(path) ?? []), resolve])
    waiting.set(bucket, callbacks)
    timer ??= setTimeout(flush, 20)
  })
}

export function usePhotoUrl(path: string | null | undefined, bucket: Bucket = BUCKET): string | null {
  const [fetched, setFetched] = useState<{ key: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!path || cached(bucket, path)) return
    let alive = true
    request(bucket, path).then((url) => alive && setFetched({ key: `${bucket}:${path}`, url }))
    return () => {
      alive = false
    }
  }, [bucket, path])
  if (!path) return null
  return cached(bucket, path) ?? (fetched?.key === `${bucket}:${path}` ? fetched.url : null)
}

export async function uploadPhoto(userId: string, kind: 'avatar' | 'couverture', blob: Blob): Promise<string> {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${kind}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false })
  if (error) throw error
  return path
}

export async function removePhoto(path: string | null | undefined) {
  if (!path) return
  cache.delete(`${BUCKET}:${path}`)
  await supabase.storage.from(BUCKET).remove([path])
}

/** Retire les fichiers d'une publication supprimée. Un échec laisse un fichier orphelin, sans gêner le membre. */
export async function removeFiles(bucket: Bucket, paths: string[]) {
  if (!paths.length) return
  for (const path of paths) cache.delete(`${bucket}:${path}`)
  await supabase.storage.from(bucket).remove(paths)
}
