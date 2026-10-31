import { useEffect, type ReactNode } from 'react'
import { signOut } from '../auth/session'
import { AppBanners } from '../components/AppBanners'
import { InstallSheet } from '../components/install/InstallSheet'
import { useToast } from '../components/Toast'
import { useBadge, useNotificationsLive } from '../lib/notifications'
import { PresenceProvider } from '../lib/presence'
import { syncDevice } from '../lib/push'

/**
 * Ce qui tourne tant qu'un membre validé a l'appli ouverte, dans le mode
 * membre comme dans le mode bureau : l'appareil se signale, la cloche et la
 * pastille suivent en direct, « En ligne », et les bandeaux.
 */
export function MemberServices({ children }: { children: ReactNode }) {
  const toast = useToast()
  useNotificationsLive(true)
  useBadge()

  useEffect(() => {
    let alive = true
    let last = 0
    const sync = () => {
      if (Date.now() - last < 5 * 60_000) return
      last = Date.now()
      syncDevice()
        .then((r) => {
          if (alive && r.revoked) {
            toast('Cet appareil a été retiré de ton compte. Reconnecte-toi.', 'error')
            signOut()
          }
        })
        .catch(() => undefined)
    }
    sync()
    // Au retour dans l'appli : un appareil retiré depuis un autre se déconnecte.
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [toast])

  return (
    <PresenceProvider enabled>
      {children}
      <AppBanners />
      <InstallSheet />
    </PresenceProvider>
  )
}
