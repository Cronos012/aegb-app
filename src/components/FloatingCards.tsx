import { Logo } from './Logo'

/** Deux cartes penchées qui montrent l'esprit de l'appli : le bot qui accueille, et une info du bureau. */
export function FloatingCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative w-full ${compact ? 'h-[230px] max-w-[330px]' : 'h-[260px] max-w-[380px]'}`} aria-hidden="true">
      <div className="absolute top-0 right-0 left-[12%] rotate-[4deg] rounded-[18px] border border-white/15 bg-[#2A3470] px-4 py-3.5 text-white shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-safran text-[11px] font-extrabold text-nuit">BOT</span>
          <div>
            <p className="m-0 text-xs text-white/70">Assistant AEGB</p>
            <p className="m-0 mt-0.5 text-[14px] leading-[1.35] font-semibold">Bienvenue ! Je t'explique comment ça marche ici.</p>
          </div>
        </div>
      </div>
      <div className="absolute top-[38%] right-[8%] left-0 -rotate-[3deg] rounded-[18px] bg-white px-4 py-3.5 text-[#12162B] shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="bg-anneau rounded-full p-[2px]">
            <Logo size={30} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[14px] font-bold">Bureau AEGB</p>
            <p className="m-0 text-xs text-[#5A6075]">il y a 2 h</p>
          </div>
          <span className="rounded-full bg-[#FFF3C4] px-2 py-0.5 text-[11px] font-bold text-[#6B4A00]">Info du bureau</span>
        </div>
        <p className="m-0 mt-2.5 text-[14px] leading-[1.4]">Les annonces du bureau sont épinglées en haut du fil. Réagis et commente !</p>
        <div className="mt-2.5 flex items-center gap-2 text-xs text-[#5A6075]">
          <span className="flex">
            <span className="grid size-5 place-items-center rounded-full bg-[#E0245E] text-[10px]">❤️</span>
            <span className="-ml-1 grid size-5 place-items-center rounded-full bg-[#1877F2] text-[10px]">👍</span>
          </span>
          Réactions et commentaires
        </div>
      </div>
    </div>
  )
}
