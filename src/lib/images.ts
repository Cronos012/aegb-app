/**
 * Réduit une photo avant l'envoi : l'offre gratuite de Supabase a peu de
 * stockage, et une photo de téléphone pèse souvent 4 Mo.
 */
export async function shrinkImage(file: File, maxSide: number, quality = 0.85): Promise<Blob> {
  return (await prepareImage(file, maxSide, quality)).blob
}

/** La photo réduite, avec ses dimensions : le fil réserve sa place avant qu'elle arrive. */
export async function prepareImage(file: File, maxSide: number, quality = 0.85): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
  if (blob && blob.type === 'image/webp') return { blob, width, height }
  // Safari ancien : pas de WebP en sortie, on passe en JPEG.
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!jpeg) throw new Error("Impossible de préparer l'image")
  return { blob: jpeg, width, height }
}
