import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSession } from '../auth/session'
import { useSettings } from './notifications'
import { supabase } from './supabase'

/**
 * « En ligne » : l'appli est ouverte en ce moment, rien de plus (pas de
 * « vu il y a 3 h »). C'est réciproque : qui cache le sien ne rejoint pas le
 * salon, et ne voit donc personne. Le salon est privé : la base n'y laisse
 * entrer que les membres validés.
 */

type PresenceState = { visible: boolean; online: ReadonlySet<string> }

const EMPTY: ReadonlySet<string> = new Set()
const PresenceContext = createContext<PresenceState>({ visible: false, online: EMPTY })

export function PresenceProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const uid = useSession().session?.user.id
  const show = useSettings(enabled).data?.privacy.show_online === true
  const active = enabled && !!uid && show
  const [online, setOnline] = useState<ReadonlySet<string>>(EMPTY)

  useEffect(() => {
    if (!active || !uid) return
    const channel = supabase.channel('en-ligne', { config: { private: true, presence: { key: uid } } })
    channel.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
    let joined = false
    const track = () => {
      if (!joined) return
      if (document.visibilityState === 'visible') channel.track({ depuis: Date.now() }).catch(() => undefined)
      else channel.untrack().catch(() => undefined)
    }
    channel.subscribe((status) => {
      joined = status === 'SUBSCRIBED'
      track()
    })
    document.addEventListener('visibilitychange', track)
    return () => {
      document.removeEventListener('visibilitychange', track)
      supabase.removeChannel(channel)
      setOnline(EMPTY)
    }
  }, [active, uid])

  return <PresenceContext.Provider value={{ visible: active, online: active ? online : EMPTY }}>{children}</PresenceContext.Provider>
}

/** Vrai si ce membre a l'appli ouverte, et si je montre aussi la mienne. */
export function useOnline(memberId: string | null | undefined): boolean {
  const { online } = useContext(PresenceContext)
  return !!memberId && online.has(memberId)
}

/** Faux si j'ai caché mon « En ligne » : je ne vois plus celui des autres. */
export function usePresenceVisible(): boolean {
  return useContext(PresenceContext).visible
}

/** Le point vert sur la photo. */
export function OnlineDot({ size = 44, className = '' }: { size?: number; className?: string }) {
  const dot = Math.max(10, Math.round(size * 0.28))
  return (
    <span
      className={`absolute right-0 bottom-0 rounded-full bg-[#22C55E] ring-[2.5px] ring-surface ${className}`}
      style={{ width: dot, height: dot }}
      aria-hidden="true"
    />
  )
}
