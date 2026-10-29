import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

type SessionState = {
  session: Session | null
  loading: boolean
  /** Vrai quand le membre arrive par le lien « mot de passe oublié ». */
  recovery: boolean
}

const SessionContext = createContext<SessionState>({ session: null, loading: true, recovery: false })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true, recovery: false })
  const queryClient = useQueryClient()

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setState((s) => ({ ...s, session: data.session, loading: false }))
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') queryClient.clear()
      setState((s) => ({
        session,
        loading: false,
        recovery: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : s.recovery,
      }))
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}

export async function signOut() {
  await supabase.auth.signOut()
}
