import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Briefcase, Check, Trash2, X } from 'lucide-react'
import { useSession } from '../../auth/session'
import { Button } from '../../components/Button'
import { ErrorNote } from '../../components/Feedback'
import { PasswordField } from '../../components/Field'
import { SettingsHeader } from '../../components/settings/Parts'
import { errorMessage } from '../../lib/errors'
import { longDate } from '../../lib/format'
import { useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'

const GONE = ['Ton profil et ta photo', 'Tes publications, commentaires et réactions', 'Tes appareils et tes notifications']
const KEPT = ['Tes messages déjà envoyés, signés « Ancien membre »', 'Tes paiements au journal de l’asso, sans tes coordonnées', 'Tes votes, qui restent secrets']

function List({ title, items, gone }: { title: string; items: string[]; gone: boolean }) {
  return (
    <section className="rounded-[22px] bg-surface px-4 py-4 shadow-[0_4px_14px_rgba(18,24,61,0.06)]">
      <h2 className={`m-0 text-[13px] font-extrabold tracking-[0.06em] uppercase ${gone ? 'text-danger' : 'text-ink/80'}`}>{title}</h2>
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {items.map((i) => (
          <li key={i} className="flex items-start gap-3 text-[15px] leading-[1.45]">
            {gone ? <X className="mt-0.5 size-[18px] shrink-0 text-danger" strokeWidth={2.4} /> : <Check className="mt-0.5 size-[18px] shrink-0 text-ok" strokeWidth={2.4} />}
            {i}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Supprimer mon compte : fermé tout de suite, effacé 30 jours plus tard. Se reconnecter avant annule tout. */
export function SupprimerCompte() {
  const me = useMe().data!
  const email = useSession().session?.user.email ?? ''
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const purgeOn = longDate(new Date(Date.now() + 30 * 86_400_000))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!password) return setError('Entre ton mot de passe.')
    setBusy(true)
    setError(null)
    // Le mot de passe d'abord : personne d'autre ne ferme le compte sur un téléphone oublié ouvert.
    const check = await supabase.auth.signInWithPassword({ email, password })
    if (check.error) {
      setBusy(false)
      return setError(check.error.code === 'invalid_credentials' ? 'Ce n’est pas le bon mot de passe.' : errorMessage(check.error))
    }
    const { data, error } = await supabase.rpc('request_account_deletion')
    if (error) {
      setBusy(false)
      return setError(errorMessage(error))
    }
    const on = (data as { purge_on: string }).purge_on
    navigate('/compte-ferme', { replace: true, state: { purgeOn: on } })
    await supabase.auth.signOut()
  }

  return (
    <div className="flex flex-1 flex-col bg-page lg:bg-transparent">
      <SettingsHeader title="Supprimer mon compte" />
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 px-4 pt-5 pb-8 lg:max-w-[620px] lg:p-0">
        <div className="flex items-center gap-4">
          <span className="grid size-[60px] shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
            <Trash2 className="size-7" />
          </span>
          <div>
            <h2 className="titre m-0 text-[24px]">Avant de partir</h2>
            <p className="m-0 text-[15px] leading-[1.45] text-muted">Ton compte est fermé tout de suite, puis effacé dans 30 jours. Si tu te reconnectes avant, tout revient.</p>
          </div>
        </div>
        <List title="Ce qui est effacé" items={GONE} gone />
        <List title="Ce qui reste" items={KEPT} gone={false} />

        {me.role ? (
          <div className="flex items-start gap-3 rounded-[22px] bg-safran-pale px-4 py-4 text-[15px] leading-[1.5] text-[#3D2A00]">
            <Briefcase className="mt-0.5 size-5 shrink-0" />
            <span>
              Tu as le poste <strong>{me.role.label}</strong> au bureau. Quitte d’abord ton poste : la présidence nomme une autre personne, puis tu pourras supprimer ton compte.
            </span>
          </div>
        ) : (
          <>
            <PasswordField label="Ton mot de passe" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-[1.45]">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-[22px] shrink-0 accent-[#B3122A]" />
              <span>
                J’ai compris : mon compte sera effacé le <strong>{purgeOn}</strong>.
              </span>
            </label>
          </>
        )}
        <ErrorNote error={error} />
        <Button type="submit" variant="danger" busy={busy} disabled={!!me.role || !understood || !password}>
          Supprimer mon compte
        </Button>
      </form>
    </div>
  )
}
