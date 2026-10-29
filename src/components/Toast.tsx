import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'

type Tone = 'ok' | 'error'

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; key: number; tone: Tone } | null>(null)
  const show = useCallback((text: string, tone: Tone = 'ok') => {
    const key = Date.now()
    setMessage({ text, key, tone })
    setTimeout(() => setMessage((m) => (m?.key === key ? null : m)), 3200)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-50 flex justify-center px-4 lg:bottom-8" role="status">
        {message ? (
          <div key={message.key} className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl bg-nuit px-4 py-3 text-sm font-semibold text-white shadow-xl">
            {message.tone === 'error' ? <CircleAlert className="size-5 shrink-0 text-[#FF8796]" /> : <CircleCheck className="size-5 shrink-0 text-[#5BD69B]" />}
            {message.text}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
