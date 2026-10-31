import { useEffect } from 'react'
import { Check } from 'lucide-react'
import { signOut } from '../../auth/session'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { Logo } from '../../components/Logo'
import { dateTime, TYPE_LABELS } from '../../lib/format'
import { useMe, type Me } from '../../lib/queries'

type Step = { title: string; detail: string; state: 'done' | 'current' | 'todo' }

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3.5">
          <div className="flex flex-col items-center">
            {s.state === 'done' ? (
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gn-vert text-white">
                <Check className="size-4" strokeWidth={3} />
              </span>
            ) : s.state === 'current' ? (
              <span className="grid size-7 shrink-0 place-items-center rounded-full border-[3px] border-safran bg-safran-pale">
                <span className="size-2.5 rounded-full bg-safran" />
              </span>
            ) : (
              <span className="size-7 shrink-0 rounded-full border-2 border-line" />
            )}
            {i < steps.length - 1 ? <span className={`my-1 w-0.5 flex-1 ${s.state === 'done' ? 'bg-gn-vert' : 'bg-line'}`} /> : null}
          </div>
          <div className="pb-6">
            <p className={`m-0 text-[15px] font-bold ${s.state === 'todo' ? 'text-muted' : ''}`}>{s.title}</p>
            <p className="m-0 mt-0.5 text-[13px] leading-[1.4] text-muted">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Tant que le bureau n'a pas validé, le membre ne voit que cet écran. */
export function Attente({ me }: { me: Me }) {
  const { refetch } = useMe()
  const p = me.profile

  // La réponse du bureau s'affiche d'elle-même : on revérifie régulièrement.
  useEffect(() => {
    const t = setInterval(() => refetch(), 30_000)
    return () => clearInterval(t)
  }, [refetch])

  const steps: Step[] = [
    { title: 'Compte créé', detail: dateTime(p.created_at), state: 'done' },
    {
      title: 'Email confirmé',
      detail: p.email_confirmed_at ? dateTime(p.email_confirmed_at) : 'Clique sur le lien reçu par email.',
      state: p.email_confirmed_at ? 'done' : 'current',
    },
    {
      title: 'Validation par le bureau',
      detail: 'En cours. La réponse du bureau s’affichera ici.',
      state: p.email_confirmed_at ? 'current' : 'todo',
    },
    { title: 'Bienvenue dans la communauté', detail: 'Tu pourras compléter ton profil.', state: 'todo' },
  ]

  return (
    <div className="flex min-h-app justify-center bg-page lg:items-center lg:py-10">
      <div className="flex w-full max-w-[480px] flex-col overflow-hidden bg-surface lg:rounded-[12px] lg:shadow-sm">
        <header className="bg-tisse px-5 pt-[max(env(safe-area-inset-top),20px)] pb-12 text-white">
          <Logo size={34} />
          <h1 className="titre mt-5 mb-0 text-[30px]">Demande envoyée !</h1>
          <p className="mt-1.5 mb-0 text-[15px] text-white/85">Le bureau vérifie que tu fais partie de l'AEGB.</p>
        </header>
        <div className="relative -mt-6 flex flex-1 flex-col rounded-t-[12px] bg-surface px-5 pt-6 pb-[max(env(safe-area-inset-bottom),24px)]">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-3">
            <Avatar person={p} size={44} />
            <div className="min-w-0">
              <p className="m-0 truncate text-[15px] font-bold">
                {p.first_name} {p.last_name}
              </p>
              <p className="m-0 truncate text-[13px] text-muted">
                {TYPE_LABELS[p.member_type]} · {me.contact?.email}
              </p>
            </div>
          </div>
          <div className="mt-6">
            <Timeline steps={steps} />
          </div>
          <div className="mt-auto flex flex-col gap-4 pt-6">
            <p className="m-0 text-center text-[13px] leading-[1.45] text-muted">Tu peux fermer l'appli : la réponse s'affichera ici à ta prochaine visite.</p>
            <Button variant="outline" onClick={signOut}>
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
