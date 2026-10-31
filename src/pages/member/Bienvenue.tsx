import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Camera, Check, ChevronRight, Pencil } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { useAction, type Me } from '../../lib/queries'
import { supabase } from '../../lib/supabase'

// Autour de la photo seulement, pour ne jamais passer sur le texte.
const CONFETTI = [
  { left: '10%', top: '18%', color: '#CE1126', rotate: 20 },
  { left: '27%', top: '6%', color: '#FFFFFF', rotate: -30 },
  { left: '74%', top: '12%', color: '#FCD116', rotate: 40 },
  { left: '88%', top: '34%', color: '#009460', rotate: -15 },
  { left: '6%', top: '52%', color: '#009460', rotate: 60 },
  { left: '24%', top: '70%', color: '#FCD116', rotate: -50 },
  { left: '78%', top: '62%', color: '#FCD116', rotate: 10 },
  { left: '92%', top: '78%', color: '#CE1126', rotate: 25 },
]

/** Écran affiché une seule fois, juste après la validation du compte. */
export function Bienvenue({ me }: { me: Me }) {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState<string | null>(null)
  const welcome = useAction(() => supabase.rpc('mark_welcomed'), [['me']])

  async function go(to: string) {
    setLeaving(to)
    await welcome.mutateAsync(undefined).catch(() => undefined)
    navigate(to, { replace: true })
  }

  return (
    <div className="bg-tisse relative flex min-h-dvh justify-center overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[230px] max-w-[480px]" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <span key={i} className="absolute h-3.5 w-2 rounded-[2px]" style={{ left: c.left, top: c.top, background: c.color, transform: `rotate(${c.rotate}deg)` }} />
        ))}
      </div>
      <div className="relative flex w-full max-w-[480px] flex-col px-5 pt-[max(env(safe-area-inset-top),60px)] pb-[max(env(safe-area-inset-bottom),24px)] lg:justify-center">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar person={me.profile} size={120} ring />
            <span className="absolute right-0 bottom-1 grid size-10 place-items-center rounded-full border-4 border-leppi bg-gn-vert">
              <Check className="size-5" strokeWidth={3} />
            </span>
          </div>
          <p className="mt-6 mb-0 text-xs font-extrabold tracking-[0.14em] text-ciel uppercase">Compte validé</p>
          <h1 className="titre mt-2 mb-0 text-[34px] leading-[1.05]">Bienvenue dans la famille, {me.profile.first_name} !</h1>
          <p className="mt-4 mb-0 text-[16px] leading-[1.5] text-white/85">
            Le bureau a validé ton compte. Prends une minute pour compléter ton profil, ça aide les autres à te reconnaître.
          </p>
        </div>
        <div className="mt-auto flex flex-col gap-3 pt-10 lg:mt-0">
          <div className="overflow-hidden rounded-2xl bg-surface text-ink">
            <button type="button" onClick={() => go('/app/profil/modifier')} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <span className="grid size-9 place-items-center rounded-xl bg-safran-pale text-[#163F93]">
                <Camera className="size-[18px]" />
              </span>
              <span className="flex-1 text-[15px] font-semibold">Ajoute une photo de profil</span>
              <ChevronRight className="size-5 text-muted" />
            </button>
            <div className="mx-4 h-px bg-line-soft" />
            <button type="button" onClick={() => go('/app/profil/modifier')} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <span className="grid size-9 place-items-center rounded-xl bg-select text-ink">
                <Pencil className="size-[18px]" />
              </span>
              <span className="flex-1 text-[15px] font-semibold">Présente-toi en quelques mots</span>
              <ChevronRight className="size-5 text-muted" />
            </button>
          </div>
          <Button variant="onblue" busy={leaving === '/app/profil/modifier'} onClick={() => go('/app/profil/modifier')}>
            Compléter mon profil
          </Button>
          <button type="button" onClick={() => go('/app/profil')} className="h-12 text-[15px] font-bold text-white" disabled={!!leaving}>
            Plus tard
          </button>
        </div>
      </div>
    </div>
  )
}
