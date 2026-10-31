import { useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router'
import { Bell, BookOpen, Download, KeyRound, LogOut, Mail, RefreshCw, Shield, Trash2, User, type LucideIcon } from 'lucide-react'
import { signOut, useSession } from '../../auth/session'
import { useToast } from '../../components/Toast'
import { Group, LinkRow, SettingsHeader } from '../../components/settings/Parts'
import { useIsDesktop } from '../../lib/media'
import { BUILD_DATE, applyUpdate, checkForUpdate, isStandalone, usePwa } from '../../lib/pwa'
import { usePushStatus } from '../../lib/push'

const TABS: { to: string; label: string; icon: LucideIcon; danger?: boolean }[] = [
  { to: 'notifications', label: 'Notifications', icon: Bell },
  { to: 'confidentialite', label: 'Confidentialité', icon: Shield },
  { to: 'installer', label: 'Installer l’appli', icon: Download },
  { to: 'compte', label: 'Compte', icon: User },
  { to: 'supprimer', label: 'Supprimer mon compte', icon: Trash2, danger: true },
]

/** « 4 décembre » */
function buildDay() {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date(BUILD_DATE))
}

function deviceWord(): string {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1 ? 'ce téléphone' : 'ce PC'
}

/** Sur ordinateur, les réglages tiennent sur une page : le menu à gauche, l'écran choisi à droite. */
export function ReglagesLayout() {
  const desktop = useIsDesktop()
  if (!desktop) return <Outlet />
  return (
    <div className="flex flex-1 flex-col px-10 py-8">
      <h1 className="titre m-0 text-[34px] leading-tight">Réglages</h1>
      <p className="mt-1 mb-0 text-[15px] text-muted">Ce que l’appli t’envoie, et ce que les autres membres voient de toi.</p>
      <div className="mt-6 grid grid-cols-[250px_minmax(0,1fr)] items-start gap-6">
        <nav aria-label="Réglages" className="flex flex-col gap-1 rounded-[12px] bg-surface p-2.5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `flex h-[46px] items-center gap-3 rounded-[14px] px-4 text-[15px] font-bold no-underline ${isActive ? 'bg-leppi text-white' : t.danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-surface-2'}`
              }
            >
              <t.icon className="size-[18px]" /> {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function VersionRow() {
  const { updateReady } = usePwa()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <LinkRow
      onClick={async () => {
        if (updateReady) return applyUpdate()
        setBusy(true)
        const found = await checkForUpdate()
        setBusy(false)
        if (found) toast('Une nouvelle version arrive : le bandeau « Recharger » va apparaître.')
        else toast('L’appli est à jour.')
      }}
      icon={<RefreshCw className={`size-5 ${busy ? 'animate-spin' : ''}`} />}
      tone="bg-surface-2 text-ink"
      title="Version de l’appli"
      detail={updateReady ? 'Nouvelle version prête : touche pour recharger' : `À jour, version du ${buildDay()}`}
      chevron={false}
    />
  )
}

/** Le menu Réglages sur téléphone. Sur ordinateur, la page s'ouvre sur les notifications. */
export function ReglagesMenu() {
  const desktop = useIsDesktop()
  const push = usePushStatus()
  if (desktop) return <Navigate to="notifications" replace />
  const word = deviceWord()
  const notif =
    push.subscribed ? `Activées sur ${word}` : push.permission === 'denied' ? `Bloquées sur ${word}` : push.support === 'installer' ? 'Installe d’abord l’appli' : `Pas activées sur ${word}`

  return (
    <div className="flex flex-1 flex-col bg-page">
      <SettingsHeader title="Réglages" back="/app/menu" />
      <div className="flex flex-col gap-5 px-4 pt-5 pb-8">
        <Group title="Notifications et vie privée">
          <LinkRow to="notifications" icon={<Bell className="size-5" />} tone="bg-select text-ink" title="Notifications" detail={notif} />
          <LinkRow to="confidentialite" icon={<Shield className="size-5" />} tone="bg-ok-soft text-ok" title="Confidentialité" detail="En ligne, Vu, téléphone, appareils" />
        </Group>
        <Group title="L’appli">
          {isStandalone() ? null : <LinkRow to="installer" icon={<Download className="size-5" />} tone="bg-safran-pale text-[#163F93]" title="Installer l’appli" detail="Sur l’écran d’accueil, en plein écran" />}
          <VersionRow />
        </Group>
        <AccountRows />
      </div>
    </div>
  )
}

function AccountRows({ withDelete = true }: { withDelete?: boolean }) {
  const email = useSession().session?.user.email ?? ''
  return (
    <Group title="Compte">
      <LinkRow icon={<Mail className="size-5" />} tone="bg-[#E2F2F8] text-[#145A75]" title="Email" value={email} chevron={false} />
      <LinkRow to="/nouveau-mot-de-passe" icon={<KeyRound className="size-5" />} tone="bg-[#F1E8FB] text-[#5B2D91]" title="Mot de passe" value="Changer" />
      <LinkRow to="/charte" icon={<BookOpen className="size-5" />} tone="bg-surface-2 text-ink" title="Charte de l’appli" />
      <LinkRow onClick={signOut} icon={<LogOut className="size-5" />} tone="bg-surface-2 text-ink" title="Se déconnecter" chevron={false} />
      {withDelete ? <LinkRow to="/app/reglages/supprimer" icon={<Trash2 className="size-5" />} tone="bg-danger-soft text-danger" title="Supprimer mon compte" danger /> : null}
    </Group>
  )
}

/** « Compte » sur ordinateur. */
export function ReglagesCompte() {
  return (
    <div className="flex flex-1 flex-col bg-page lg:bg-transparent">
      <SettingsHeader title="Compte" />
      <div className="flex flex-col gap-5 px-4 pt-5 pb-8 lg:max-w-[560px] lg:p-0">
        <AccountRows withDelete={false} />
        <Group title="L’appli">
          <VersionRow />
        </Group>
      </div>
    </div>
  )
}
