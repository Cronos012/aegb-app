import { useState } from 'react'
import { Laptop, MonitorSmartphone, Smartphone } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { Group, Hint, SettingsHeader, SwitchRow } from '../../components/settings/Parts'
import { useToast } from '../../components/Toast'
import { errorMessage } from '../../lib/errors'
import { relative } from '../../lib/format'
import { useDevices, useRevokeDevice, useSavePrivacy, useSettings, type Device, type Privacy } from '../../lib/notifications'
import { deviceId } from '../../lib/push'

const KIND: Record<Device['platform'], { here: string; name: string; icon: typeof Smartphone }> = {
  android: { here: 'Ce téléphone', name: 'Téléphone', icon: Smartphone },
  iphone: { here: 'Cet iPhone', name: 'iPhone', icon: Smartphone },
  ordinateur: { here: 'Ce PC', name: 'PC', icon: Laptop },
  autre: { here: 'Cet appareil', name: 'Appareil', icon: MonitorSmartphone },
}

function DeviceRow({ d, onRevoke }: { d: Device; onRevoke: (d: Device) => void }) {
  const mine = d.id === deviceId()
  const kind = KIND[d.platform] ?? KIND.autre
  const state = mine ? (d.push ? 'notifications activées' : 'notifications désactivées') : d.push ? 'notifications activées' : `vu ${relative(d.last_seen_at)}`
  return (
    <div className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-select text-ink">
        <kind.icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold">{mine ? kind.here : kind.name}</span>
        <span className="block truncate text-[14px] text-muted">
          {d.label} · {state}
        </span>
      </span>
      {mine ? (
        <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[12px] font-bold text-ok">Ici</span>
      ) : (
        <Button variant="danger-outline" size="sm" className="h-10 px-4" onClick={() => onRevoke(d)}>
          Retirer
        </Button>
      )}
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-[18px] bg-[#E6E8F0] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-12 rounded-[14px] text-[15px] font-bold ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Radio({ checked, title, detail, onSelect }: { checked: boolean; title: string; detail?: string; onSelect: () => void }) {
  return (
    <label className="flex min-h-[60px] cursor-pointer items-center gap-3.5 px-4 py-3">
      <input type="radio" name="qui-peut-ecrire" checked={checked} onChange={onSelect} className="peer sr-only" />
      <span
        className={`grid size-6 shrink-0 place-items-center rounded-full border-2 peer-focus-visible:ring-[3px] peer-focus-visible:ring-safran/60 ${checked ? 'border-leppi' : 'border-line'}`}
        aria-hidden="true"
      >
        {checked ? <span className="size-3 rounded-full bg-leppi" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold">{title}</span>
        {detail ? <span className="block text-[14px] text-muted">{detail}</span> : null}
      </span>
    </label>
  )
}

export function Confidentialite() {
  const toast = useToast()
  const settings = useSettings()
  const devices = useDevices()
  const save = useSavePrivacy()
  const revoke = useRevokeDevice()
  const [removing, setRemoving] = useState<Device | null>(null)

  if (settings.isPending) {
    return (
      <div className="flex flex-1 flex-col bg-page lg:bg-transparent">
        <SettingsHeader title="Confidentialité" />
        <PageLoader />
      </div>
    )
  }

  const p = settings.data?.privacy
  const set = (patch: Partial<Privacy>) => save.mutate(patch, { onError: (e) => toast(errorMessage(e), 'error') })
  // Cet appareil d'abord.
  const list = [...(devices.data ?? [])].sort((a, b) => Number(b.id === deviceId()) - Number(a.id === deviceId()))

  return (
    <div className="flex flex-1 flex-col bg-page lg:bg-transparent">
      <SettingsHeader title="Confidentialité" />
      <ErrorNote error={settings.error} className="mx-4 mt-4 lg:mx-0 lg:mt-0" />
      {p ? (
        <div className="flex flex-col gap-5 px-4 pt-5 pb-8 lg:grid lg:grid-cols-2 lg:items-start lg:p-0">
          <div className="flex flex-col gap-5">
            <Group title="Ta présence" note="C’est réciproque : si tu les caches, tu ne vois plus ceux des autres.">
              <SwitchRow title="« En ligne »" detail="Quand ton appli est ouverte" checked={p.show_online} onChange={(v) => set({ show_online: v })} />
              <SwitchRow title="« Vu »" detail="Quand tu as lu un message privé" checked={p.show_seen} onChange={(v) => set({ show_seen: v })} />
            </Group>
            <section>
              <h2 className="m-0 px-1 pb-2 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">Ton numéro de téléphone</h2>
              <Segmented
                label="Qui voit ton numéro"
                value={p.phone_visibility}
                onChange={(v) => set({ phone_visibility: v })}
                options={[
                  { value: 'bureau', label: 'Bureau seulement' },
                  { value: 'membres', label: 'Tous les membres' },
                ]}
              />
            </section>
          </div>
          <div className="flex flex-col gap-5">
            <Group title="Qui peut t’écrire" note="Le bureau et le compte AEGB peuvent toujours t’écrire.">
              <Radio checked={p.who_can_write === 'tous'} title="Tous les membres" onSelect={() => set({ who_can_write: 'tous' })} />
              <Radio checked={p.who_can_write === 'conversations'} title="Seulement mes conversations" detail="Les personnes avec qui tu as déjà parlé" onSelect={() => set({ who_can_write: 'conversations' })} />
            </Group>
            <Group title="Appareils connectés">
              {list.map((d) => (
                <DeviceRow key={d.id} d={d} onRevoke={setRemoving} />
              ))}
              {devices.isPending ? <PageLoader /> : null}
            </Group>
            {list.length > 1 ? <Hint>Un appareil retiré ne reçoit plus rien, et se déconnecte à sa prochaine ouverture.</Hint> : null}
          </div>
        </div>
      ) : null}

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Retirer cet appareil ?"
        description={removing ? `${KIND[removing.platform]?.name ?? 'Appareil'} · ${removing.label}. Il ne recevra plus de notifications, et sera déconnecté à sa prochaine ouverture.` : null}
        footer={
          <>
            <Button variant="outline" size="md" className="flex-1" onClick={() => setRemoving(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              size="md"
              className="flex-1"
              busy={revoke.isPending}
              onClick={() =>
                removing &&
                revoke.mutate(removing.id, {
                  onSuccess: () => {
                    setRemoving(null)
                    toast('L’appareil est retiré.')
                  },
                  onError: (e) => toast(errorMessage(e), 'error'),
                })
              }
            >
              Retirer
            </Button>
          </>
        }
      >
        <p className="m-0 text-[14px] leading-[1.5] text-muted">Pratique pour un téléphone perdu, ou un ordinateur prêté.</p>
      </Dialog>
    </div>
  )
}
