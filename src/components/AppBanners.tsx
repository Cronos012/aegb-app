import { RefreshCw, WifiOff } from 'lucide-react'
import { applyUpdate, usePwa } from '../lib/pwa'

/**
 * « Nouvelle version » et « Pas de connexion » : posés au-dessus de la barre
 * du bas (ou du champ de message), sans jamais cacher l'en-tête de l'écran.
 */
export function AppBanners() {
  const { updateReady, online } = usePwa()
  if (!updateReady && online) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 flex flex-col items-center gap-2 px-3 lg:bottom-6 lg:left-[264px]">
      {!online ? (
        <div role="status" className="pointer-events-auto flex w-full max-w-[520px] items-center gap-3 rounded-2xl bg-[#3A4060] px-4 py-3 text-[14px] leading-[1.4] text-white shadow-xl">
          <WifiOff className="size-5 shrink-0" />
          <span>
            <strong>Pas de connexion.</strong> Tu vois les dernières pages chargées.
          </span>
        </div>
      ) : null}
      {updateReady ? (
        <div role="status" className="bg-tisse pointer-events-auto flex w-full max-w-[520px] items-center gap-3 rounded-2xl px-3.5 py-3 text-white shadow-xl">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-safran text-nuit">
            <RefreshCw className="size-5" strokeWidth={2.4} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">Nouvelle version de l’appli</span>
            <span className="block text-[13px] text-white/80">Recharge pour en profiter.</span>
          </span>
          <button type="button" onClick={applyUpdate} className="h-11 shrink-0 rounded-xl bg-safran px-4 text-[15px] font-extrabold text-nuit hover:brightness-105">
            Recharger
          </button>
        </div>
      ) : null}
    </div>
  )
}
