import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowDown, Bell, ChevronLeft, CircleCheck } from 'lucide-react'
import { Brand } from '../../components/Logo'
import { ButtonLink } from '../../components/Button'
import { Note } from '../../components/Feedback'
import { Hero, Sheet } from '../../components/Hero'
import { AppIcon, InstallButton, InstallPerks, IphoneGuide } from '../../components/install/InstallParts'
import { SettingsHeader } from '../../components/settings/Parts'
import { isStandalone, platform, usePwa, type Platform } from '../../lib/pwa'

/** Sans bouton du navigateur : où trouver « Installer » à la main. */
function manualSteps(p: Platform): string {
  if (p === 'android') return 'Ouvre le menu ⋮ de Chrome, en haut à droite, puis touche « Installer l’appli » ou « Ajouter à l’écran d’accueil ».'
  return 'Dans Chrome ou Edge, clique sur l’icône d’installation à droite de la barre d’adresse, ou ouvre le menu puis « Installer AEGB ». Firefox ne sait pas installer d’appli.'
}

function IphoneInstaller({ back }: { back: string }) {
  const navigate = useNavigate()
  const iphone = /iphone|ipod/i.test(navigator.userAgent)
  return (
    <div className="flex min-h-app flex-col lg:mx-auto lg:min-h-0 lg:w-full lg:max-w-[560px] lg:py-8">
      <Hero back={back} className="lg:rounded-t-[12px]" title="Installer l’appli sur iPhone" subtitle="Pas besoin de l’App Store : 3 gestes dans Safari." />
      <Sheet className="gap-5">
        <div className="flex items-start gap-3 rounded-[12px] bg-[#E4EEFB] px-4 py-3.5 text-[15px] leading-[1.45] text-[#173B6B]">
          <Bell className="mt-0.5 size-5 shrink-0" />
          Sur iPhone, les notifications marchent seulement quand l’appli est sur l’écran d’accueil (iOS 16.4 ou plus récent).
        </div>
        <IphoneGuide onDone={() => navigate(back === '/' ? '/' : '/app/fil')} />
      </Sheet>
      {iphone && !isStandalone() ? (
        <span className="pointer-events-none fixed bottom-1 left-1/2 z-30 -translate-x-1/2 animate-bounce text-ciel" aria-hidden="true">
          <ArrowDown className="size-10" strokeWidth={2.6} />
        </span>
      ) : null}
    </div>
  )
}

/** Hors de l'appli (lien du site public, code QR) : la page a son propre cadre. */
function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-app flex-col bg-page">
      <header className="flex h-[calc(64px+env(safe-area-inset-top))] items-center gap-3 border-b border-line-soft bg-surface px-3 pt-[env(safe-area-inset-top)] lg:px-10">
        <Link to="/" aria-label="Retour au site" className="grid size-11 place-items-center rounded-xl text-ink hover:bg-surface-2">
          <ChevronLeft className="size-6" strokeWidth={2.2} />
        </Link>
        <Brand size={34} className="text-ink" />
      </header>
      <div className="flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-[620px] lg:py-10">{children}</div>
    </div>
  )
}

/**
 * Installer l'appli : le guide sur iPhone, le bouton du navigateur sur
 * Android et sur ordinateur. ?appareil=iphone montre le guide iPhone depuis
 * un autre appareil (le bouton « Guide Safari » du site).
 */
export function Installer({ open = false }: { open?: boolean }) {
  const { canInstall } = usePwa()
  const [params] = useSearchParams()
  const asked = params.get('appareil')
  const device: Platform = asked === 'iphone' || asked === 'android' || asked === 'ordinateur' ? asked : platform()
  const back = open ? '/' : '/app/reglages'
  // Seul Chrome installe une vraie appli sur Android (notifications au nom d'AEGB).
  const ua = navigator.userAgent
  const otherAndroidBrowser =
    device === 'android' && platform() === 'android' && ('brave' in navigator || /firefox|opr\/|edga\//i.test(ua) || !/chrome/i.test(ua))

  if (isStandalone() && !asked) {
    return (
      <div className="flex flex-1 flex-col bg-page lg:bg-transparent">
        <SettingsHeader title="Installer l’appli" />
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center lg:max-w-[560px] lg:rounded-[12px] lg:bg-surface">
          <CircleCheck className="size-12 text-ok" />
          <h2 className="titre m-0 text-[24px]">L’appli est installée</h2>
          <p className="m-0 text-[15px] leading-[1.5] text-muted">Tu l’as ouverte depuis ton écran d’accueil. Les notifications s’activent dans les réglages.</p>
          <ButtonLink to="/app/reglages/notifications" variant="outline" size="md" className="mt-2">
            Réglages des notifications
          </ButtonLink>
        </div>
      </div>
    )
  }

  if (device === 'iphone') return <IphoneInstaller back={back} />

  const body = (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-8 lg:max-w-[620px] lg:p-0">
      <section className="flex flex-col gap-5 rounded-[12px] bg-surface p-5 lg:p-6">
        <div className="flex items-center gap-4">
          <AppIcon size={64} />
          <div>
            <h2 className="titre m-0 text-[24px] leading-tight">Installe l’appli AEGB</h2>
            <p className="m-0 text-[15px] text-muted">{window.location.host} · gratuite</p>
          </div>
        </div>
        <InstallPerks />
        {otherAndroidBrowser ? (
          <Note tone="warn">
            Sur Android, ouvre {window.location.host} dans <strong>Chrome</strong> pour installer l’appli. Depuis un autre navigateur (Brave, Firefox…), elle s’installe comme un simple raccourci : les notifications s’affichent au nom du navigateur et ouvrent une page du navigateur au lieu de l’appli.
          </Note>
        ) : null}
        {canInstall && device === platform() ? <InstallButton className="w-full" /> : <Note>{manualSteps(device)}</Note>}
      </section>
      <Note>
        Sur iPhone, ouvre cette page dans Safari : <Link to="?appareil=iphone">un guide en 3 images</Link> t’explique comment faire.
      </Note>
    </div>
  )

  if (open) return <PublicFrame>{body}</PublicFrame>
  return (
    <div className="flex flex-1 flex-col bg-page lg:bg-transparent">
      <SettingsHeader title="Installer l’appli" />
      {body}
    </div>
  )
}
