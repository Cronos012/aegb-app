import { useQueryClient } from '@tanstack/react-query'
import { setBlocked } from '../../lib/messages'
import { useToast } from '../Toast'
import { ConfirmDialog } from '../feed/Dialogs'

/** Bloquer : ses messages privés n'arrivent plus, sans que cette personne le sache. */
export function BlockDialog({ member, onClose }: { member: { id: string; first_name: string } | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const first = member?.first_name ?? ''
  return (
    <ConfirmDialog
      open={!!member}
      title={`Bloquer ${first} ?`}
      description={`Tu ne recevras plus ses messages privés, et cette personne ne le saura pas. Tu peux débloquer à tout moment depuis son profil.`}
      confirm="Bloquer"
      onClose={onClose}
      onConfirm={async () => {
        if (!member) return
        await setBlocked(member.id, true)
        await queryClient.invalidateQueries({ queryKey: ['messages'] })
        toast(`Tu as bloqué ${first}.`)
      }}
    />
  )
}
