import { usePhotoUrl } from '../lib/photos'

/** La photo de couverture d'un profil, ou le motif tissé s'il n'y en a pas. */
export function Cover({ path, className = '' }: { path: string | null; className?: string }) {
  const url = usePhotoUrl(path)
  return url ? <div className={`bg-leppi bg-cover bg-center ${className}`} style={{ backgroundImage: `url(${url})` }} /> : <div className={`bg-tisse ${className}`} />
}
