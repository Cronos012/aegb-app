import { useState } from 'react'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { platform, usePwa } from '../../lib/pwa'
import { AppIcon, InstallButton, InstallPerks } from './InstallParts'

const KEY = 'aegb.feuilleInstaller'
const WEEK = 7 * 86_400_000

function laterAt(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0)
  } catch {
    return 0
  }
}

/** Sur Android, dans Chrome : la proposition d'installer l'appli, une fois par semaine au plus. */
export function InstallSheet() {
  const { canInstall } = usePwa()
  const [closed, setClosed] = useState(() => Date.now() - laterAt() < WEEK)
  const open = canInstall && !closed && platform() === 'android'

  const later = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()))
    } catch {
      // Navigation privée : elle reviendra.
    }
    setClosed(true)
  }

  return (
    <Dialog
      open={open}
      onClose={later}
      title="Installe l’appli AEGB"
      description={`${window.location.host} · gratuite`}
      footer={
        <>
          <InstallButton className="flex-1" onDone={later} />
          <Button variant="outline" onClick={later}>
            Plus tard
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <AppIcon size={64} />
        <InstallPerks />
      </div>
    </Dialog>
  )
}
