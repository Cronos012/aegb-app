import { useSearchParams } from 'react-router'
import { EncaisserForm } from '../../components/dues/EncaisserForm'
import { BureauPage, Card } from './BureauPage'

export default function Encaisser() {
  const [params] = useSearchParams()
  const member = params.get('membre')
  return (
    <BureauPage title="Encaisser un paiement" subtitle="Espèces, virement ou chèque. Les paiements par carte arrivent tout seuls." back="/bureau/cotisations">
      <Card className="p-5 lg:max-w-[640px] lg:p-6">
        <EncaisserForm key={member ?? 'choix'} initialMember={member} />
      </Card>
    </BureauPage>
  )
}
