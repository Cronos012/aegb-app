import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Camera, Lock } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { ErrorNote } from '../../components/Feedback'
import { TextArea, TextField } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { errorMessage } from '../../lib/errors'
import { TYPE_LABELS } from '../../lib/format'
import { shrinkImage } from '../../lib/images'
import { removePhoto, uploadPhoto, usePhotoUrl } from '../../lib/photos'
import { useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'

type Picked = { blob: Blob; preview: string }

function usePicker(maxSide: number) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const blob = await shrinkImage(file, maxSide)
      setPicked({ blob, preview: URL.createObjectURL(blob) })
    } catch {
      setError("Cette image n'a pas pu être ouverte. Essaie une photo en JPEG ou PNG.")
    }
  }
  return { picked, error, input, onChange, open: () => input.current?.click() }
}

export function ModifierProfil() {
  const me = useMe().data!
  const p = me.profile
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    first_name: p.first_name,
    last_name: p.last_name,
    bio: p.bio ?? '',
    city: p.city ?? '',
    school: p.school ?? '',
    formation: p.formation ?? '',
    phone: me.contact?.phone ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const avatar = usePicker(512)
  const cover = usePicker(1600)
  const coverUrl = usePhotoUrl(p.cover_path)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e?: FormEvent) {
    e?.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim()) return setError('Le prénom et le nom sont obligatoires.')
    setBusy(true)
    setError(null)
    try {
      const avatarPath = avatar.picked ? await uploadPhoto(p.id, 'avatar', avatar.picked.blob) : p.avatar_path
      const coverPath = cover.picked ? await uploadPhoto(p.id, 'couverture', cover.picked.blob) : p.cover_path
      const clean = (v: string) => v.trim() || null
      const { error: e1 } = await supabase
        .from('profiles')
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          bio: clean(form.bio),
          city: clean(form.city),
          school: clean(form.school),
          formation: clean(form.formation),
          avatar_path: avatarPath,
          cover_path: coverPath,
        })
        .eq('id', p.id)
      if (e1) throw e1
      if ((me.contact?.phone ?? '') !== form.phone.trim()) {
        const { error: e2 } = await supabase.from('member_contacts').update({ phone: clean(form.phone) }).eq('id', p.id)
        if (e2) throw e2
      }
      if (avatar.picked && p.avatar_path) await removePhoto(p.avatar_path)
      if (cover.picked && p.cover_path) await removePhoto(p.cover_path)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      toast('Profil enregistré.')
      navigate('/app/profil')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const coverStyle = cover.picked ? { backgroundImage: `url(${cover.picked.preview})` } : coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined

  return (
    <form onSubmit={save} noValidate className="flex flex-1 flex-col bg-surface lg:mx-10 lg:my-8 lg:max-w-[760px] lg:overflow-hidden lg:rounded-[26px]">
      <div className="sticky top-0 z-10 flex h-[58px] items-center justify-between gap-2 border-b border-line-soft bg-surface px-4 pt-[env(safe-area-inset-top)]">
        <Link to="/app/profil" className="text-[15px] font-semibold text-ink no-underline">
          Annuler
        </Link>
        <h1 className="m-0 text-[16px] font-bold">Modifier le profil</h1>
        <Button type="submit" size="sm" busy={busy}>
          Enregistrer
        </Button>
      </div>

      <div className={`relative h-[140px] bg-cover bg-center ${coverStyle ? '' : 'bg-tisse'}`} style={coverStyle}>
        <button type="button" onClick={cover.open} className="absolute right-4 bottom-4 flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-bold text-[#12162B] shadow">
          <Camera className="size-4" /> Couverture
        </button>
        <input ref={cover.input} type="file" accept="image/*" className="hidden" onChange={cover.onChange} />
      </div>

      <div className="flex flex-col gap-[18px] px-5 pb-[max(env(safe-area-inset-bottom),40px)] lg:px-8">
        <div className="relative -mt-[52px] w-fit">
          {avatar.picked ? (
            <span className="bg-anneau inline-flex rounded-full p-1">
              <span className="inline-flex rounded-full bg-surface p-1">
                <img src={avatar.picked.preview} alt="" className="size-[100px] rounded-full object-cover" />
              </span>
            </span>
          ) : (
            <Avatar person={p} size={100} ring />
          )}
          <button
            type="button"
            onClick={avatar.open}
            aria-label="Changer la photo de profil"
            className="absolute right-0 bottom-1 grid size-9 place-items-center rounded-full border-[3px] border-surface bg-safran text-nuit"
          >
            <Camera className="size-4" />
          </button>
          <input ref={avatar.input} type="file" accept="image/*" className="hidden" onChange={avatar.onChange} />
        </div>
        <ErrorNote error={avatar.error ?? cover.error} />

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Prénom" value={form.first_name} onChange={set('first_name')} maxLength={60} autoComplete="given-name" />
          <TextField label="Nom" value={form.last_name} onChange={set('last_name')} maxLength={60} autoComplete="family-name" />
        </div>
        <TextArea label="Bio" counter maxLength={160} value={form.bio} onChange={set('bio')} placeholder="Présente-toi en quelques mots" />
        <div className="grid gap-[18px] lg:grid-cols-2">
          <TextField label="Ville" value={form.city} onChange={set('city')} maxLength={60} autoComplete="address-level2" />
          <TextField label="École" value={form.school} onChange={set('school')} maxLength={80} placeholder="UBO, IMT Atlantique, ENIB…" />
        </div>
        <TextField label="Formation" value={form.formation} onChange={set('formation')} maxLength={80} placeholder="Master informatique" />
        <TextField
          label="Téléphone"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={set('phone')}
          maxLength={30}
          autoComplete="tel"
          hint={
            <>
              <Lock className="size-3.5" /> Visible seulement par le bureau.
            </>
          }
        />
        <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
          <div>
            <p className="m-0 text-[13px] text-muted">Type de membre</p>
            <p className="m-0 text-[15px] font-bold">{TYPE_LABELS[p.member_type]}</p>
          </div>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Lock className="size-3.5" /> Changé par le bureau
          </span>
        </div>
        <ErrorNote error={error} />
        <Button type="submit" busy={busy} className="lg:hidden">
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
