import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/*
  Les photos sont dans un espace privé : on demande des liens signés, par lots,
  et on les garde en mémoire. Chaque nouvelle photo a un nouveau nom de fichier,
  donc un lien en cache ne montre jamais une ancienne photo.
*/

const BUCKET = 'profils'
const LIFETIME_S = 60 * 60 * 12
const cache = new Map<string, { url: string; expires: number }>()
const waiting = new Map<string, ((url: string | null) => void)[]>()
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  timer = null
  const paths = [...waiting.keys()]
  const callbacks = new Map(waiting)
  waiting.clear()
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, LIFETIME_S)
  const expires = Date.now() + (LIFETIME_S - 600) * 1000
  for (const path of paths) {
    const url = data?.find((d) => d.path === path)?.signedUrl ?? null
    if (url) cache.set(path, { url, expires })
    for (const cb of callbacks.get(path) ?? []) cb(url)
  }
}

function cached(path: string): string | null {
  const hit = cache.get(path)
  return hit && hit.expires > Date.now() ? hit.url : null
}

function request(path: string): Promise<string | null> {
  const hit = cached(path)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve) => {
    waiting.set(path, [...(waiting.get(path) ?? []), resolve])
    timer ??= setTimeout(flush, 20)
  })
}

export function usePhotoUrl(path: string | null | undefined): string | null {
  const [fetched, setFetched] = useState<{ path: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!path || cached(path)) return
    let alive = true
    request(path).then((url) => alive && setFetched({ path, url }))
    return () => {
      alive = false
    }
  }, [path])
  if (!path) return null
  return cached(path) ?? (fetched?.path === path ? fetched.url : null)
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
  cache.delete(path)
  await supabase.storage.from(BUCKET).remove([path])
}
