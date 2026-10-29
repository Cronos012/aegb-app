import { useState } from 'react'
import { Heart } from 'lucide-react'
import { signOut } from '../../auth/session'
import { Button } from '../../components/Button'
import { ErrorNote } from '../../components/Feedback'
import { RULE_ICONS, RULE_TONES } from '../../lib/charter'
import { useAction } from '../../lib/queries'
import { supabase } from '../../lib/supabase'

type Charter = { version: number; rules: { icon: string; title: string; text: string }[] }

/** Quand le bureau change la charte, chaque membre l'accepte à nouveau. */
export function AccepterCharte({ charter }: { charter: Charter }) {
  const [accepted, setAccepted] = useState(false)
  const accept = useAction((v: number) => supabase.rpc('accept_charter', { p_version: v }), [['me']])

  return (
    <div className="flex min-h-dvh justify-center bg-page lg:items-center lg:py-10">
      <div className="flex w-full max-w-[480px] flex-col overflow-hidden bg-surface lg:rounded-[26px] lg:shadow-sm">
        <header className="bg-tisse px-5 pt-[max(env(safe-area-inset-top),24px)] pb-12 text-white">
          <h1 className="titre m-0 text-[30px]">La charte a changé</h1>
          <p className="mt-1.5 mb-0 text-[15px] text-white/85">Lis la nouvelle version et accepte-la pour continuer.</p>
        </header>
        <div className="relative -mt-6 flex flex-1 flex-col gap-4 rounded-t-[26px] bg-surface px-5 pt-6 pb-[max(env(safe-area-inset-bottom),24px)]">
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {charter.rules.map((rule, i) => {
              const Icon = RULE_ICONS[rule.icon] ?? Heart
              return (
                <li key={rule.title} className="flex items-start gap-3.5">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${RULE_TONES[i % RULE_TONES.length]}`}>
                    <Icon className="size-5" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-bold">{rule.title}</span>
                    <span className="text-[14px] leading-[1.4] text-muted">{rule.text}</span>
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-[15px] font-semibold ${accepted ? 'border-primary bg-select' : 'border-line'}`}>
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="size-5 accent-[#1A2352]" />
              J'ai lu et j'accepte la charte de l'AEGB
            </label>
            <ErrorNote error={accept.error} />
            <Button disabled={!accepted} busy={accept.isPending} onClick={() => accept.mutate(charter.version)}>
              Continuer
            </Button>
            <Button variant="ghost" onClick={signOut}>
              Se déconnecter
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
