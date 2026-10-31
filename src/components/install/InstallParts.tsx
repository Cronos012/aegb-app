import { useState } from 'react'
import { Bell, ChevronLeft, ChevronRight, Copy, Bookmark, Download, House, Smartphone, SquarePlus, Share } from 'lucide-react'
import { Button } from '../Button'
import { Logo } from '../Logo'
import { useToast } from '../Toast'
import { promptInstall } from '../../lib/pwa'

/** Les trois atouts de l'appli installée. */
export function InstallPerks() {
  const perks = [
    { icon: House, text: 'Une icône sur ton écran d’accueil' },
    { icon: Smartphone, text: 'En plein écran, comme une vraie appli' },
    { icon: Bell, text: 'Les notifications, même appli fermée' },
  ]
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {perks.map((p) => (
        <li key={p.text} className="flex items-center gap-3.5 text-[16px]">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-select text-ink">
            <p.icon className="size-5" />
          </span>
          {p.text}
        </li>
      ))}
    </ul>
  )
}

export function AppIcon({ size = 64 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center bg-leppi" style={{ width: size, height: size, borderRadius: size * 0.24 }} aria-hidden="true">
      <span className="bg-anneau inline-flex rounded-full" style={{ padding: Math.round(size * 0.05) }}>
        <Logo size={Math.round(size * 0.72)} />
      </span>
    </span>
  )
}

/** Le bouton « Installer » d'Android et de l'ordinateur, qui ouvre la question du navigateur. */
export function InstallButton({ onDone, className = '' }: { onDone?: (installed: boolean) => void; className?: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      busy={busy}
      icon={<Download className="size-5" />}
      className={className}
      onClick={async () => {
        setBusy(true)
        const ok = await promptInstall().catch(() => false)
        setBusy(false)
        if (ok) toast('AEGB est installée. Ouvre-la depuis cette icône pour activer les notifications.')
        onDone?.(ok)
      }}
    >
      Installer
    </Button>
  )
}

/* ----------------------------------------------------------------------------
   Le guide iPhone, en trois images
---------------------------------------------------------------------------- */

function SafariBar({ highlight }: { highlight: boolean }) {
  return (
    <div className="flex items-center gap-7 rounded-[12px] bg-surface px-7 py-4 text-[#2F6FE4] shadow-[0_8px_22px_rgba(18,24,61,0.12)]">
      <ChevronLeft className="size-6" />
      <ChevronRight className="size-6 text-line" />
      <span className={`grid size-[54px] place-items-center rounded-full ${highlight ? 'bg-safran-pale ring-[3px] ring-safran' : ''}`}>
        <Share className="size-6" />
      </span>
      <Bookmark className="size-6" />
      <Copy className="size-6" />
    </div>
  )
}

function ShareMenu() {
  const row = 'flex items-center justify-between px-4 py-3 text-[16px]'
  return (
    <div className="w-full max-w-[260px] overflow-hidden rounded-[12px] bg-surface p-1.5 shadow-[0_8px_22px_rgba(18,24,61,0.12)]">
      <div className={`${row} border-b border-line-soft`}>
        Copier <Copy className="size-5" />
      </div>
      <div className={`${row} border-b border-line-soft`}>
        Ajouter aux favoris <Bookmark className="size-5" />
      </div>
      <div className={`${row} rounded-[12px] bg-safran-pale font-bold ring-2 ring-safran`}>
        Sur l’écran d’accueil <SquarePlus className="size-5" />
      </div>
    </div>
  )
}

function AddSheet() {
  return (
    <div className="w-full max-w-[300px] rounded-[12px] bg-surface p-4 shadow-[0_8px_22px_rgba(18,24,61,0.12)]">
      <div className="flex items-center justify-between text-[15px]">
        <span className="text-[#2F6FE4]">Annuler</span>
        <span className="font-semibold">Écran d’accueil</span>
        <span className="rounded-lg bg-safran-pale px-2 py-0.5 font-bold text-[#2F6FE4] ring-2 ring-safran">Ajouter</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <AppIcon size={54} />
        <span>
          <span className="block text-[17px] font-bold">AEGB</span>
          <span className="block text-[13px] text-muted">{window.location.host}</span>
        </span>
      </div>
    </div>
  )
}

const STEPS = [
  { title: 'Touche le bouton Partager', text: 'Il est en bas de l’écran, dans la barre de Safari : le carré avec une flèche vers le haut.', image: <SafariBar highlight /> },
  { title: 'Choisis « Sur l’écran d’accueil »', text: 'Fais défiler la liste vers le bas si tu ne le vois pas tout de suite.', image: <ShareMenu /> },
  { title: 'Touche « Ajouter »', text: 'L’icône AEGB arrive sur ton écran d’accueil. Ouvre l’appli depuis cette icône, puis active les notifications.', image: <AddSheet /> },
]

export function IphoneGuide({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  return (
    <div className="flex flex-1 flex-col">
      <div className="grid min-h-[190px] place-items-center rounded-[12px] bg-page px-4 py-6">{s.image}</div>
      <div className="mt-5 flex items-center gap-3">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-safran text-[16px] font-extrabold text-white">{step + 1}</span>
        <h2 className="titre m-0 text-[22px] leading-tight" aria-live="polite">
          {s.title}
        </h2>
      </div>
      <p className="mt-3 mb-0 text-[16px] leading-[1.55] text-ink/85">{s.text}</p>
      <div className="mt-auto flex items-center gap-3 pt-8">
        <span className="flex flex-1 items-center gap-1.5" aria-label={`Étape ${step + 1} sur 3`}>
          {STEPS.map((_, i) => (
            <span key={i} className={`h-2 rounded-full ${i === step ? 'w-6 bg-leppi' : 'w-2 bg-line'}`} />
          ))}
        </span>
        {step > 0 ? (
          <Button variant="outline" size="md" className="h-12 px-6" onClick={() => setStep(step - 1)}>
            Retour
          </Button>
        ) : null}
        <Button size="md" className="h-12 px-6" onClick={() => (step < 2 ? setStep(step + 1) : onDone())}>
          {step < 2 ? 'Suivant' : 'C’est fait'}
        </Button>
      </div>
    </div>
  )
}
