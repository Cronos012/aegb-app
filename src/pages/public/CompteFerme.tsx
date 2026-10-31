import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, DoorOpen } from 'lucide-react'
import { signOut } from '../../auth/session'
import { Button, ButtonLink } from '../../components/Button'
import { ErrorNote } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { longDate } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Me } from '../../lib/queries'

function Frame({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-app items-center justify-center bg-page px-6 py-10">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-4 text-center">
        <span className="grid size-[72px] place-items-center rounded-full bg-select text-ink">{icon}</span>
        <h1 className="titre m-0 text-[28px] leading-tight">{title}</h1>
        {children}
      </div>
    </div>
  )
}

/** Juste après « Supprimer mon compte » : la personne est déjà déconnectée. */
export function CompteFerme() {
  const state = useLocation().state as { purgeOn?: string } | null
  return (
    <Frame icon={<Check className="size-8" strokeWidth={2.4} />} title="Ton compte est fermé">
      <p className="m-0 text-[16px] leading-[1.55] text-ink/85">
        {state?.purgeOn ? (
          <>
            Il sera effacé le <strong>{longDate(state.purgeOn)}</strong>.
          </>
        ) : (
          'Il sera effacé dans 30 jours.'
        )}{' '}
        Tu as changé d’avis ? Reconnecte-toi avant cette date, et tout revient comme avant.
      </p>
      <p className="m-0 text-[14px] text-muted">Merci pour ton passage à l’AEGB.</p>
      <ButtonLink to="/" variant="outline" className="mt-2 w-full">
        Retour à l’accueil
      </ButtonLink>
    </Frame>
  )
}

/**
 * Un compte fermé, encore connecté sur un autre appareil : il peut le
 * rouvrir, ou se déconnecter.
 */
export function CompteFermeGate({ me }: { me: Me }) {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const on = new Date(new Date(me.profile.deletion_requested_at!).getTime() + 30 * 86_400_000)

  async function reopen() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('cancel_account_deletion')
    setBusy(false)
    if (error) return setError(error)
    await queryClient.invalidateQueries({ queryKey: ['me'] })
    toast('Ton compte est rouvert. Content de te revoir !')
    navigate('/app/fil', { replace: true })
  }

  return (
    <Frame icon={<DoorOpen className="size-8" />} title="Ton compte est fermé">
      <p className="m-0 text-[16px] leading-[1.55] text-ink/85">
        Il sera effacé le <strong>{longDate(on)}</strong>. Tu peux encore le rouvrir : ton profil, tes publications et tes messages reviennent tout de suite.
      </p>
      <ErrorNote error={error} className="w-full text-left" />
      <Button busy={busy} onClick={reopen} className="mt-2 w-full">
        Rouvrir mon compte
      </Button>
      <Button variant="ghost" onClick={signOut} className="w-full">
        Se déconnecter
      </Button>
    </Frame>
  )
}
