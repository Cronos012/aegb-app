import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Bell, BellOff, Send, Share } from 'lucide-react'
import { Button } from '../../components/Button'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { unblockSteps } from '../../components/notifications/ActivateCard'
import { Group, SettingsHeader, SwitchRow } from '../../components/settings/Parts'
import { useToast } from '../../components/Toast'
import { errorMessage } from '../../lib/errors'
import { useIsDesktop } from '../../lib/media'
import { useDevices, useSaveNotificationSettings, useSettings, useTestPush, type NotificationSettings } from '../../lib/notifications'
import { deviceLabel, platform } from '../../lib/pwa'
import { deviceId, enablePush, usePushStatus } from '../../lib/push'

function here(): string {
  const p = platform()
  return p === 'android' || p === 'iphone' ? 'ce téléphone' : p === 'ordinateur' ? 'ce PC' : 'cet appareil'
}

/** « Et sur ton PC », « Et sur ton téléphone », « Et sur 2 autres appareils ». */
function elsewhere(devices: { id: string; platform: string; push: boolean }[]): string | null {
  const others = devices.filter((d) => d.push && d.id !== deviceId())
  if (!others.length) return null
  if (others.length > 1) return `Et sur ${others.length} autres appareils`
  const p = others[0].platform
  return p === 'ordinateur' ? 'Et sur ton PC' : p === 'android' || p === 'iphone' ? 'Et sur ton téléphone' : 'Et sur un autre appareil'
}

/** En haut des réglages : l'état de cet appareil, et de quoi l'activer ou l'essayer. */
function DeviceCard() {
  const navigate = useNavigate()
  const toast = useToast()
  const desktop = useIsDesktop()
  const s = usePushStatus()
  const devices = useDevices().data ?? []
  const test = useTestPush()
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!sent) return
    const t = setTimeout(() => setSent(false), 6000)
    return () => clearTimeout(t)
  }, [sent])

  const other = elsewhere(devices)

  if (s.subscribed) {
    const title = desktop ? `Activées sur ce PC (${deviceLabel().split(' · ').reverse().join(', ')})${other === 'Et sur ton téléphone' ? ' et sur ton téléphone' : ''}` : `Activées sur ${here()}`
    return (
      <div className="flex items-center gap-3.5 rounded-[22px] bg-ok-soft px-4 py-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok text-white">
          <Bell className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold text-ok">{title}</span>
          <span className="block text-[14px] text-ok/85">
            {desktop ? 'Les notifications s’affichent en bas à droite de l’écran, même quand l’onglet est fermé.' : (other ?? 'Seulement sur cet appareil')}
          </span>
        </span>
        <Button
          variant="outline"
          size="md"
          className="border-0 text-ok"
          busy={test.isPending}
          icon={desktop && !sent ? <Send className="size-4" /> : undefined}
          disabled={sent}
          onClick={() =>
            test.mutate(undefined, {
              onSuccess: () => setSent(true),
              onError: (e) => toast(errorMessage(e), 'error'),
            })
          }
        >
          {sent ? 'Envoyé' : desktop ? 'Envoyer un essai' : 'Essayer'}
        </Button>
      </div>
    )
  }

  if (s.support === 'installer') {
    return (
      <div className="flex flex-col gap-3 rounded-[22px] bg-safran-pale px-4 py-4 text-[#4A3300]">
        <p className="m-0 text-[15px] leading-[1.45]">
          <strong>Sur iPhone</strong>, les notifications marchent quand l’appli est sur ton écran d’accueil (iOS 16.4 ou plus récent).
        </p>
        <Button variant="accent" size="md" icon={<Share className="size-5" />} onClick={() => navigate('/app/reglages/installer')}>
          Voir comment faire
        </Button>
      </div>
    )
  }

  if (s.support === 'non') {
    return (
      <div className="flex items-start gap-3 rounded-[22px] bg-surface px-4 py-3.5 text-[14px] leading-[1.45] text-muted">
        <BellOff className="mt-0.5 size-5 shrink-0" />
        Ce navigateur ne sait pas recevoir de notifications. Tu les retrouves dans la cloche, en haut du fil.
      </div>
    )
  }

  if (s.permission === 'denied') {
    return (
      <div className="flex items-start gap-3 rounded-[22px] bg-warn-soft px-4 py-3.5 text-[14px] leading-[1.45]">
        <BellOff className="mt-0.5 size-5 shrink-0 text-warn" />
        <span>
          <strong>Bloquées sur {here()}.</strong> {unblockSteps()}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3.5 rounded-[22px] bg-surface px-4 py-3.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-select text-ink">
        <BellOff className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold">Pas activées sur {here()}</span>
        <span className="block text-[14px] text-muted">{other ?? 'Tu les retrouves quand même dans la cloche'}</span>
      </span>
      <Button
        size="md"
        busy={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const r = await enablePush()
            if (r === 'ok') toast('Les notifications sont activées sur cet appareil.')
          } catch (e) {
            toast(errorMessage(e), 'error')
          } finally {
            setBusy(false)
          }
        }}
      >
        Activer
      </Button>
    </div>
  )
}

function TimeChip({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      step={900}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className="h-9 w-[112px] rounded-[10px] bg-surface-2 px-2 text-center text-[16px] font-bold text-ink focus:ring-[3px] focus:ring-safran/45 focus:outline-none"
    />
  )
}

/** Un aperçu des deux façons dont la notification s'affiche sur l'ordinateur. */
function PcPreview({ apercu }: { apercu: boolean }) {
  const card = (body: string, on: boolean) => (
    <div className={`rounded-[14px] bg-[#2A2D3A] px-4 py-3 text-white ${on ? 'ring-2 ring-safran' : 'opacity-70'}`}>
      <p className="m-0 flex items-center gap-1.5 text-[12px] text-white/70">
        <span className="bg-anneau inline-block size-3.5 rounded-full" /> AEGB · appli
      </p>
      <p className="m-0 mt-1.5 text-[14px] font-bold">Fatoumata Bah</p>
      <p className="m-0 text-[14px] text-white/85">{body}</p>
    </div>
  )
  return (
    <section className="rounded-[22px] bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="titre m-0 text-[18px]">Aperçu sur ce PC</h2>
        <span className="text-[13px] text-muted">Selon « Texte sur l’écran verrouillé »</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        {card('Tu viens ce soir ? On part du campus à 18 h 30.', apercu)}
        {card('Nouveau message', !apercu)}
      </div>
    </section>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ReglagesNotifications() {
  const desktop = useIsDesktop()
  const toast = useToast()
  const settings = useSettings()
  const save = useSaveNotificationSettings()

  if (settings.isPending) {
    return (
      <div className="flex flex-1 flex-col bg-page lg:bg-transparent">
        <SettingsHeader title="Notifications" />
        <PageLoader />
      </div>
    )
  }

  const n = settings.data?.notifications
  const poste = settings.data?.poste
  const set = (patch: Partial<NotificationSettings>) => save.mutate(patch, { onError: (e) => toast(errorMessage(e), 'error') })

  const messages = n ? (
    <Group title="Messages">
      <SwitchRow title="Messages privés" checked={n.prives} onChange={(v) => set({ prives: v })} />
      <SwitchRow title="Petits groupes" checked={n.groupes} onChange={(v) => set({ groupes: v })} />
      <SwitchRow title="Grand groupe" detail="Quand on te mentionne ou te répond" checked={n.grand_groupe} onChange={(v) => set({ grand_groupe: v })} />
    </Group>
  ) : null
  const fil = n ? (
    <Group title="Fil">
      <SwitchRow title="Réactions et commentaires" detail="Regroupés, une fois par heure au plus" checked={n.reactions} onChange={(v) => set({ reactions: v })} />
      <SwitchRow title="Annonces du bureau" detail="Toujours reçues" checked locked />
    </Group>
  ) : null
  const asso = n ? (
    <Group title="Vie de l’asso">
      <SwitchRow title="Votes et AG" checked={n.votes} onChange={(v) => set({ votes: v })} />
      <SwitchRow title="Événements" detail="Rappel la veille, changements" checked={n.evenements} onChange={(v) => set({ evenements: v })} />
      <SwitchRow title="Cotisation" detail="Relance et quittance" checked={n.cotisation} onChange={(v) => set({ cotisation: v })} />
    </Group>
  ) : null
  const bureau =
    n && poste ? (
      <Group title={`Bureau · ${poste.role}`}>
        <SwitchRow title="Notifications de mon poste" detail={capitalize(poste.receives.join(', '))} checked={n.poste} onChange={(v) => set({ poste: v })} />
      </Group>
    ) : null
  const calme = n ? (
    <Group title="Calme">
      <SwitchRow title="Heures calmes" checked={n.calme} onChange={(v) => set({ calme: v })}>
        <span className={`mt-1.5 flex flex-wrap items-center gap-2 text-[15px] text-muted ${n.calme ? '' : 'opacity-60'}`}>
          <TimeChip label="Début des heures calmes" value={n.calme_debut} onChange={(v) => set({ calme_debut: v })} />
          à
          <TimeChip label="Fin des heures calmes" value={n.calme_fin} onChange={(v) => set({ calme_fin: v })} />
          rien ne sonne
        </span>
      </SwitchRow>
      <SwitchRow title="Texte sur l’écran verrouillé" detail="Sinon : « Nouveau message »" checked={n.apercu} onChange={(v) => set({ apercu: v })} />
    </Group>
  ) : null

  return (
    <div className="flex flex-1 flex-col bg-page lg:bg-transparent">
      <SettingsHeader title="Notifications" />
      <div className="flex flex-col gap-5 px-4 pt-4 pb-8 lg:p-0">
        <DeviceCard />
        <ErrorNote error={settings.error} />
        {desktop ? (
          <>
            <div className="grid grid-cols-2 items-start gap-x-5 gap-y-5">
              <div className="flex flex-col gap-5">
                {messages}
                {fil}
                {bureau}
              </div>
              <div className="flex flex-col gap-5">
                {asso}
                {calme}
              </div>
            </div>
            {n ? <PcPreview apercu={n.apercu} /> : null}
          </>
        ) : (
          <>
            {messages}
            {fil}
            {asso}
            {bureau}
            {calme}
          </>
        )}
      </div>
    </div>
  )
}
