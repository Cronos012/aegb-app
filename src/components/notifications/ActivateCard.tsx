import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Bell, Share } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../Button'
import { useToast } from '../Toast'
import { errorMessage } from '../../lib/errors'
import { isStandalone, platform } from '../../lib/pwa'
import { enablePush, usePushStatus } from '../../lib/push'

const LATER_KEY = 'aegb.carteNotifications'
const DAY = 86_400_000

type Memory = { later?: number; refused?: number; reshown?: boolean; done?: boolean }

function read(): Memory {
  try {
    return JSON.parse(localStorage.getItem(LATER_KEY) ?? '{}') as Memory
  } catch {
    return {}
  }
}

function write(m: Memory) {
  try {
    localStorage.setItem(LATER_KEY, JSON.stringify(m))
  } catch {
    // Navigation privée : la carte reviendra à la prochaine visite.
  }
}

/** Comment réactiver les notifications après un refus, selon l'appareil. */
export function unblockSteps(): string {
  const p = platform()
  if (p === 'iphone') return 'Ouvre Réglages, puis Notifications, puis AEGB, et active « Autoriser les notifications ».'
  if (p === 'android' && isStandalone()) return 'Ouvre les réglages du téléphone, puis Applications, puis AEGB, puis Notifications.'
  if (p === 'android') return 'Touche le cadenas à gauche de l’adresse, puis Autorisations, et autorise les notifications.'
  return 'Clique sur le cadenas à gauche de l’adresse, puis autorise les notifications pour ce site.'
}

/**
 * La carte du fil qui explique à quoi servent les notifications. Le
 * téléphone pose sa question seulement après « Activer ». Après un refus,
 * elle revient une seule fois, une semaine plus tard.
 */
export function ActivateCard({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const s = usePushStatus()
  const [memory, setMemory] = useState(read)
  const [busy, setBusy] = useState(false)

  const remember = (m: Memory) => {
    const next = { ...memory, ...m }
    write(next)
    setMemory(next)
  }
  const denied = s.permission === 'denied'

  // Refusé avant la carte (dans les réglages du navigateur) : elle attend une semaine.
  useEffect(() => {
    if (denied && !memory.refused) {
      const next = { ...read(), refused: Date.now() }
      write(next)
      setMemory(next)
    }
  }, [denied, memory.refused])

  if (s.support === 'non' || s.subscribed === null || s.subscribed || memory.done) return null
  if (memory.later && Date.now() - memory.later < 3 * DAY) return null
  if (denied && (memory.reshown || !memory.refused || Date.now() - memory.refused < 7 * DAY)) return null

  async function activate() {
    setBusy(true)
    try {
      const result = await enablePush()
      if (result === 'ok') {
        remember({ done: true })
        toast('Les notifications sont activées sur cet appareil.')
        queryClient.invalidateQueries({ queryKey: ['reglages'] })
      } else if (result === 'refuse') {
        remember({ refused: Date.now(), reshown: denied })
      } else if (result === 'installer') {
        navigate('/app/reglages/installer')
      }
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="carte-notif" className={`bg-tisse rounded-[26px] p-[18px] text-white shadow-[0_12px_30px_rgba(18,24,61,0.18)] lg:p-6 ${className}`}>
      <div className="flex items-center gap-4">
        <span className="grid size-[52px] shrink-0 place-items-center rounded-full bg-safran text-nuit">
          <Bell className="size-6" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <h2 id="carte-notif" className="titre m-0 text-[22px] leading-tight">
            {denied ? 'Les notifications sont bloquées' : 'Ne rate plus rien'}
          </h2>
          <p className="m-0 text-[14px] text-white/75">{denied ? 'Tu peux les réactiver quand tu veux' : 'Même quand l’appli est fermée'}</p>
        </div>
      </div>
      <p className="mt-3.5 mb-0 text-[15px] leading-[1.5] text-white/90">
        {s.support === 'installer'
          ? 'Sur iPhone, les notifications marchent quand l’appli est sur ton écran d’accueil. Ça prend 20 secondes.'
          : denied
            ? unblockSteps()
            : 'L’appli te prévient pour tes messages, les votes, les rappels d’événements et les annonces du bureau. Tu choisis quoi dans les réglages, et rien ne sonne entre 22 h et 8 h.'}
      </p>
      <div className="mt-4 flex gap-2.5">
        {s.support === 'installer' ? (
          <Button variant="accent" size="md" className="h-12 flex-1" icon={<Share className="size-5" />} onClick={() => navigate('/app/reglages/installer')}>
            Voir comment faire
          </Button>
        ) : denied ? (
          <>
            <Button variant="accent" size="md" className="h-12 flex-1" onClick={() => remember({ reshown: true })}>
              J’ai compris
            </Button>
            <Button variant="light" size="md" className="h-12" busy={busy} onClick={activate}>
              Réessayer
            </Button>
          </>
        ) : (
          <>
            <Button variant="accent" size="md" className="h-12 flex-1" busy={busy} onClick={activate}>
              Activer
            </Button>
            <Button variant="light" size="md" className="h-12 px-6" onClick={() => remember({ later: Date.now() })}>
              Plus tard
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
