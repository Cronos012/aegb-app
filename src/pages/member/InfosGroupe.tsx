import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, ChevronLeft, LogOut, MessageSquare, MoreHorizontal, Pencil, Star, User, UserMinus, UserPlus, Users } from 'lucide-react'
import { useSession } from '../../auth/session'
import { Avatar } from '../../components/Avatar'
import { Button, ButtonLink } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { SearchField, TextField } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { ActionSheet, ConfirmDialog, SheetAction } from '../../components/feed/Dialogs'
import { ConversationAvatar } from '../../components/messages/ConversationAvatar'
import { MemberPicker } from '../../components/messages/MemberPicker'
import { errorMessage } from '../../lib/errors'
import { useDirectory } from '../../lib/feed'
import { prepareImage } from '../../lib/images'
import { groupFaces, openPrivate, refreshMessages, useConversationInfo, type ConversationInfo, type GroupMember } from '../../lib/messages'
import { removeFiles } from '../../lib/photos'
import { supabase } from '../../lib/supabase'

const SHOWN = 8

/** Le nom et la photo, pour qui gère le groupe. */
function EditDialog({ info, open, onClose }: { info: ConversationInfo; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const uid = useSession().session?.user.id
  const [name, setName] = useState(info.title)
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const input = useRef<HTMLInputElement>(null)

  function close() {
    if (photo) URL.revokeObjectURL(photo.preview)
    setPhoto(null)
    setError(null)
    setName(info.title)
    onClose()
  }

  async function pick(file: File) {
    try {
      const { blob } = await prepareImage(file, 640, 0.85)
      if (photo) URL.revokeObjectURL(photo.preview)
      setPhoto({ blob, preview: URL.createObjectURL(blob) })
    } catch {
      toast("Cette photo ne s'ouvre pas. Choisis une photo JPEG ou PNG.", 'error')
    }
  }

  async function save() {
    setBusy(true)
    setError(null)
    let path: string | null = null
    try {
      if (photo) {
        path = `${info.id}/groupe-${Math.random().toString(36).slice(2, 10)}.${photo.blob.type === 'image/webp' ? 'webp' : 'jpg'}`
        const { error } = await supabase.storage.from('messages').upload(path, photo.blob, { contentType: photo.blob.type, upsert: false })
        if (error) throw error
      }
      const args: { p_conversation: string; p_title: string; p_photo?: string } = { p_conversation: info.id, p_title: name.trim() }
      if (path) args.p_photo = path
      const { data: old, error } = await supabase.rpc('update_group', args)
      if (error) throw error
      if (old) await removeFiles('messages', [old]).catch(() => undefined)
      await refreshMessages(queryClient, info.id)
      toast('Groupe modifié.')
      close()
    } catch (e) {
      if (path) await removeFiles('messages', [path]).catch(() => undefined)
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Nom et photo"
      footer={
        <Button onClick={save} busy={busy} disabled={!name.trim()} className="w-full">
          Enregistrer
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-3 pb-4">
        {photo ? <img src={photo.preview} alt="" className="size-24 rounded-full object-cover" /> : <ConversationAvatar kind="groupe" title={info.title} photoPath={info.photo_path} faces={groupFaces(info, uid)} size={96} />}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) pick(file)
          }}
        />
        <Button variant="outline" size="sm" icon={<Camera className="size-4" />} onClick={() => input.current?.click()}>
          {info.photo_path || photo ? 'Changer la photo' : 'Ajouter une photo'}
        </Button>
      </div>
      <TextField label="Nom du groupe" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      <ErrorNote error={error} className="mt-3" />
    </Dialog>
  )
}

/** Ajouter des membres : seulement ceux qui n'y sont pas déjà. */
function AddDialog({ info, open, onClose }: { info: ConversationInfo; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const directory = useDirectory()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const inside = new Set(info.members.map((m) => m.id))
  const members = directory.data?.filter((m) => !inside.has(m.id))

  function close() {
    setPicked(new Set())
    setQuery('')
    setError(null)
    onClose()
  }

  async function add() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('add_group_members', { p_conversation: info.id, p_members: [...picked] })
    setBusy(false)
    if (error) return setError(error)
    await refreshMessages(queryClient, info.id)
    toast(picked.size > 1 ? `${picked.size} membres ajoutés.` : 'Membre ajouté.')
    close()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Ajouter des membres"
      footer={
        <Button onClick={add} busy={busy} disabled={!picked.size} className="w-full">
          {picked.size ? `Ajouter · ${picked.size}` : 'Choisis des membres'}
        </Button>
      }
    >
      <SearchField value={query} onChange={setQuery} placeholder="Rechercher un membre" label="Rechercher un membre" />
      <div className="-mx-5 mt-2 lg:-mx-6">
        <MemberPicker
          members={members}
          query={query}
          selected={picked}
          onPick={(m) =>
            setPicked((s) => {
              const next = new Set(s)
              if (next.has(m.id)) next.delete(m.id)
              else next.add(m.id)
              return next
            })
          }
        />
      </div>
      <ErrorNote error={error} className="mt-3" />
    </Dialog>
  )
}

function MemberLine({ m, me, onMenu }: { m: GroupMember; me: boolean; onMenu: (m: GroupMember) => void }) {
  return (
    <li className="flex items-center gap-3.5 py-2.5">
      <Link to={`/app/membres/${m.id}`} className="shrink-0" tabIndex={-1} aria-hidden="true">
        <Avatar person={m} size={44} />
      </Link>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[16px] font-bold">{me ? 'Toi' : `${m.first_name} ${m.last_name}`}</span>
          {m.is_manager ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-safran-pale px-2 text-[12px] font-bold text-[#6B4A00]">
              <Star className="size-3" /> Gère le groupe
            </span>
          ) : null}
        </span>
        {m.city ? <span className="block truncate text-[13px] text-muted">{m.city}</span> : null}
      </span>
      {!me ? (
        <button type="button" onClick={() => onMenu(m)} aria-label={`Options pour ${m.first_name}`} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2">
          <MoreHorizontal className="size-5" />
        </button>
      ) : null}
    </li>
  )
}

export function InfosGroupe() {
  const { id } = useParams()
  const uid = useSession().session?.user.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const info = useConversationInfo(id)
  const [all, setAll] = useState(false)
  const [edit, setEdit] = useState(false)
  const [add, setAdd] = useState(false)
  const [menu, setMenu] = useState<GroupMember | null>(null)
  const [remove, setRemove] = useState<GroupMember | null>(null)
  const [leave, setLeave] = useState(false)

  const header = (
    <header className="flex h-[calc(64px+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-line-soft bg-surface px-2 pt-[env(safe-area-inset-top)] lg:h-[76px] lg:px-6">
      <button type="button" onClick={() => navigate(`/app/messages/${id}`)} aria-label="Retour à la conversation" className="grid size-11 place-items-center rounded-xl hover:bg-surface-2">
        <ChevronLeft className="size-6" strokeWidth={2.2} />
      </button>
      <h1 className="titre m-0 text-[22px]">Infos du groupe</h1>
    </header>
  )

  if (info.isPending) {
    return (
      <div className="flex h-dvh flex-col bg-page lg:h-full">
        {header}
        <PageLoader />
      </div>
    )
  }

  const c = info.data
  if (!c || !id || (c.kind !== 'groupe' && c.kind !== 'grand_groupe')) {
    return (
      <div className="flex h-dvh flex-col bg-page lg:h-full">
        {header}
        <EmptyState title="Ce groupe n’est plus disponible" icon={<Users className="size-6" />}>
          Tu as peut-être quitté ce groupe.
        </EmptyState>
        <ErrorNote error={info.error} className="mx-6" />
      </div>
    )
  }

  async function run(action: () => PromiseLike<{ error: unknown }>, done: string) {
    const { error } = await action()
    if (error) throw error
    await refreshMessages(queryClient, id)
    toast(done)
  }

  async function write(member: string) {
    try {
      navigate(`/app/messages/${await openPrivate(member)}`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  if (c.kind === 'grand_groupe') {
    return (
      <div className="flex h-dvh flex-col bg-page lg:h-full">
        {header}
        <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto px-5 py-8 text-center">
          <ConversationAvatar kind="grand_groupe" title={c.title} size={112} />
          <h2 className="titre m-0 text-[26px]">{c.title}</h2>
          <p className="m-0 text-[14px] text-muted">{c.members_count} membres</p>
          <Note className="max-w-md text-left">Chaque membre validé entre dans le grand groupe. On ne peut pas le quitter : c’est le lieu de toute l’association.</Note>
          <ButtonLink to="/app/membres" variant="outline" size="md" icon={<Users className="size-5" />}>
            Voir l’annuaire
          </ButtonLink>
        </div>
      </div>
    )
  }

  const meRow = c.members.find((m) => m.id === uid)
  const others = c.members.filter((m) => m.id !== uid)
  const otherManagers = others.filter((m) => m.is_manager)
  const shown = all ? c.members : c.members.slice(0, SHOWN)
  // Si le dernier à gérer part, le plus ancien membre prend la suite.
  const heir = [...others].sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.id.localeCompare(b.id))[0]
  const leaveHint = !meRow?.is_manager
    ? 'Tu ne recevras plus les messages du groupe.'
    : otherManagers.length
      ? `Si tu pars, ${otherManagers[0].first_name} continue de gérer le groupe.`
      : heir
        ? `Si tu pars, ${heir.first_name} gérera le groupe.`
        : 'Tu es la dernière personne du groupe : il restera vide.'

  return (
    <div className="flex h-dvh flex-col bg-page lg:h-full">
      {header}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section className="flex flex-col items-center gap-2 bg-surface px-5 pt-6 pb-5 text-center">
          <ConversationAvatar kind="groupe" title={c.title} photoPath={c.photo_path} faces={groupFaces(c, uid)} size={112} />
          <h2 className="titre m-0 mt-2 text-[26px] leading-tight">{c.title}</h2>
          <p className="m-0 text-[14px] text-muted">
            Groupe · {c.members_count} membre{c.members_count > 1 ? 's' : ''}
            {c.created_by_name ? ` · créé par ${c.created_by_name}` : ''}
          </p>
          {c.manager ? (
            <div className="mt-3 grid w-full max-w-md grid-cols-2 gap-3">
              <button type="button" onClick={() => setAdd(true)} className="flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] border-line bg-surface py-3.5 text-[14px] font-bold hover:bg-surface-2">
                <UserPlus className="size-5" /> Ajouter des membres
              </button>
              <button type="button" onClick={() => setEdit(true)} className="flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] border-line bg-surface py-3.5 text-[14px] font-bold hover:bg-surface-2">
                <Pencil className="size-5" /> Nom et photo
              </button>
            </div>
          ) : null}
        </section>

        <section className="mt-2 bg-surface px-5 pt-4 pb-3">
          <h3 className="m-0 text-[12px] font-extrabold tracking-wide text-muted uppercase">
            {c.members_count} membre{c.members_count > 1 ? 's' : ''}
          </h3>
          <ul className="m-0 mt-1 flex list-none flex-col p-0">
            {shown.map((m) => (
              <MemberLine key={m.id} m={m} me={m.id === uid} onMenu={setMenu} />
            ))}
          </ul>
          {!all && c.members.length > SHOWN ? (
            <button type="button" onClick={() => setAll(true)} className="py-2 text-[14px] font-bold text-link">
              Voir les {c.members.length - SHOWN} autres
            </button>
          ) : null}
        </section>

        {c.member ? (
          <section className="flex flex-col items-center gap-2 px-5 pt-5 pb-[max(env(safe-area-inset-bottom),24px)]">
            <Button variant="danger-outline" size="md" icon={<LogOut className="size-5" />} onClick={() => setLeave(true)} className="w-full max-w-md">
              Quitter le groupe
            </Button>
            <p className="m-0 text-center text-[13px] text-muted">{leaveHint}</p>
          </section>
        ) : null}
      </div>

      <ActionSheet open={!!menu} onClose={() => setMenu(null)} title={menu ? `${menu.first_name} ${menu.last_name}` : ''}>
        {menu ? (
          <>
            <SheetAction icon={<User className="size-5" />} onClick={() => navigate(`/app/membres/${menu.id}`)}>
              Voir le profil
            </SheetAction>
            <SheetAction
              icon={<MessageSquare className="size-5" />}
              onClick={() => {
                setMenu(null)
                write(menu.id)
              }}
            >
              Écrire en privé
            </SheetAction>
            {c.manager ? (
              <>
                <SheetAction
                  icon={<Star className="size-5" />}
                  hint={menu.is_manager ? 'Ne gère plus le groupe' : 'Peut ajouter, retirer, renommer'}
                  onClick={() => {
                    const m = menu
                    setMenu(null)
                    run(
                      () => supabase.rpc('set_group_manager', { p_conversation: id, p_member: m.id, p_manager: !m.is_manager }),
                      m.is_manager ? `${m.first_name} ne gère plus le groupe.` : `${m.first_name} gère aussi le groupe.`,
                    ).catch((e) => toast(errorMessage(e), 'error'))
                  }}
                >
                  {menu.is_manager ? 'Lui retirer la gestion' : 'Lui confier la gestion'}
                </SheetAction>
                <SheetAction
                  icon={<UserMinus className="size-5" />}
                  danger
                  onClick={() => {
                    setRemove(menu)
                    setMenu(null)
                  }}
                >
                  Retirer du groupe
                </SheetAction>
              </>
            ) : null}
          </>
        ) : null}
      </ActionSheet>

      <ConfirmDialog
        open={!!remove}
        title={`Retirer ${remove?.first_name ?? ''} ?`}
        description="Cette personne ne verra plus les messages du groupe. Le groupe verra qu’elle a été retirée."
        confirm="Retirer"
        onClose={() => setRemove(null)}
        onConfirm={() => run(() => supabase.rpc('remove_group_member', { p_conversation: id, p_member: remove!.id }), `${remove!.first_name} ne fait plus partie du groupe.`)}
      />
      <ConfirmDialog
        open={leave}
        title="Quitter le groupe ?"
        description={leaveHint}
        confirm="Quitter"
        onClose={() => setLeave(false)}
        onConfirm={async () => {
          const { error } = await supabase.rpc('leave_group', { p_conversation: id })
          if (error) throw error
          // On quitte l'écran d'abord : sinon il redemande les infos d'un groupe qui n'est plus le nôtre.
          navigate('/app/messages', { replace: true })
          queryClient.removeQueries({ queryKey: ['messages', 'fil', id] })
          queryClient.removeQueries({ queryKey: ['messages', 'infos', id] })
          queryClient.invalidateQueries({ queryKey: ['messages', 'liste'] })
          toast('Tu as quitté le groupe.')
        }}
      />
      <EditDialog key={`${c.title}-${c.photo_path}`} info={c} open={edit} onClose={() => setEdit(false)} />
      <AddDialog info={c} open={add} onClose={() => setAdd(false)} />
    </div>
  )
}
