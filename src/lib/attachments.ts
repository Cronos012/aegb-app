import { useCallback, useEffect, useRef, useState } from 'react'
import type { Json } from './database.types'
import { prepareImage } from './images'
import { supabase } from './supabase'

/*
  Les photos et la vidéo d'une publication. Les photos sont réduites dans le
  téléphone avant l'envoi ; la vidéo part telle quelle, d'où les limites.
*/

export const MAX_PHOTOS = 4
export const MAX_VIDEO_MB = 15
export const MAX_VIDEO_S = 30
const PHOTO_SIDE = 1600
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

export type Attachment = {
  key: string
  kind: 'photo' | 'video'
  blob: Blob
  preview: string
  width: number
  height: number
  /** En secondes, pour une vidéo. */
  duration?: number
}

function videoInfo(url: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })
    video.onerror = () => reject(new Error('video'))
    video.src = url
  })
}

/** Prépare un fichier choisi. Rejette avec une phrase claire si le fichier ne convient pas. */
export async function prepareAttachment(file: File): Promise<Attachment> {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  if (file.type.startsWith('video/')) {
    if (!VIDEO_TYPES.includes(file.type)) throw new Error('Ce format de vidéo ne passe pas. Choisis une vidéo MP4 ou MOV.')
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`Cette vidéo dépasse ${MAX_VIDEO_MB} Mo. Coupe-la ou choisis-en une plus courte.`)
    const preview = URL.createObjectURL(file)
    try {
      const info = await videoInfo(preview)
      if (info.duration > MAX_VIDEO_S + 0.5) throw new Error(`Une vidéo dure ${MAX_VIDEO_S} secondes au plus. Celle-ci fait ${Math.round(info.duration)} secondes.`)
      return { key, kind: 'video', blob: file, preview, width: info.width || 0, height: info.height || 0, duration: info.duration }
    } catch (error) {
      URL.revokeObjectURL(preview)
      if (error instanceof Error && error.message !== 'video') throw error
      throw new Error("Cette vidéo ne s'ouvre pas. Essaie avec une autre.")
    }
  }
  if (!file.type.startsWith('image/')) throw new Error('Choisis une photo ou une vidéo.')
  try {
    const { blob, width, height } = await prepareImage(file, PHOTO_SIDE, 0.82)
    return { key, kind: 'photo', blob, preview: URL.createObjectURL(blob), width, height }
  } catch {
    throw new Error("Cette photo ne s'ouvre pas. Choisis une photo JPEG ou PNG.")
  }
}

/** Ce qu'on peut encore ajouter : 4 photos, ou une seule vidéo. */
export function canAdd(list: Attachment[], file: File): string | null {
  const video = file.type.startsWith('video/')
  if (list.some((a) => a.kind === 'video')) return 'Une vidéo se publie seule. Retire-la pour ajouter autre chose.'
  if (video && list.length) return 'Une vidéo se publie seule, sans photo.'
  if (list.length >= MAX_PHOTOS) return `${MAX_PHOTOS} photos au plus par publication.`
  return null
}

export function releaseAttachments(list: Attachment[]) {
  for (const a of list) URL.revokeObjectURL(a.preview)
}

function extension(blob: Blob): string {
  const map: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }
  return map[blob.type] ?? 'bin'
}

/**
 * Dépose les fichiers dans le dossier de la publication, avant de la créer :
 * la base vérifie qu'ils y sont. En cas d'échec, ce qui est parti est retiré.
 */
export async function uploadAttachments(folder: string, postId: string, list: Attachment[], onProgress?: (done: number) => void): Promise<Json> {
  const uploaded: string[] = []
  try {
    const media = []
    for (const [i, a] of list.entries()) {
      const path = `${folder}/${postId}/${i}-${a.key}.${extension(a.blob)}`
      const { error } = await supabase.storage.from('publications').upload(path, a.blob, { contentType: a.blob.type, upsert: false })
      if (error) throw error
      uploaded.push(path)
      media.push({ kind: a.kind, path, width: a.width || null, height: a.height || null })
      onProgress?.(i + 1)
    }
    return media
  } catch (error) {
    if (uploaded.length) await supabase.storage.from('publications').remove(uploaded)
    throw error
  }
}

export async function discardUploads(media: Json) {
  const paths = (media as { path: string }[]).map((m) => m.path)
  if (paths.length) await supabase.storage.from('publications').remove(paths)
}

/*
  Le fil passe les fichiers choisis à l'écran « Nouvelle publication » : un
  sélecteur de fichiers ne s'ouvre que sur un geste du membre, donc on le
  propose dès le fil et on transmet ce qui a été choisi.
*/
let handoff: File[] | null = null

export function handOffFiles(files: File[]) {
  handoff = files
}

export function takeHandedOffFiles(): File[] | null {
  const files = handoff
  handoff = null
  return files
}

/** Les photos ou la vidéo en cours de préparation pour une publication. */
export function useAttachments() {
  const [list, setList] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(list)

  useEffect(() => {
    latest.current = list
  }, [list])
  useEffect(() => () => releaseAttachments(latest.current), [])

  const add = useCallback(async (files: File[]) => {
    setError(null)
    setBusy(true)
    let current = latest.current
    for (const file of files) {
      const blocked = canAdd(current, file)
      if (blocked) {
        setError(blocked)
        break
      }
      try {
        const a = await prepareAttachment(file)
        current = [...current, a]
        latest.current = current
        setList(current)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ce fichier ne s'ouvre pas.")
      }
    }
    setBusy(false)
  }, [])

  const remove = useCallback((key: string) => {
    const gone = latest.current.find((a) => a.key === key)
    if (gone) releaseAttachments([gone])
    latest.current = latest.current.filter((a) => a.key !== key)
    setList(latest.current)
    setError(null)
  }, [])

  const clear = useCallback(() => {
    releaseAttachments(latest.current)
    latest.current = []
    setList([])
    setError(null)
  }, [])

  return { list, busy, error, add, remove, clear }
}

export type Attachments = ReturnType<typeof useAttachments>
