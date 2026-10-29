import { useParams } from 'react-router'
import { useIsDesktop } from '../../lib/media'
import { FichePanel } from './fiche'
import Membres from './Membres'

/** Sur ordinateur la fiche s'ouvre par-dessus la liste ; sur téléphone c'est une page. */
export default function FicheMembre() {
  const { id } = useParams()
  const desktop = useIsDesktop()
  if (desktop) return <Membres openId={id} />
  return <FichePanel id={id!} />
}
