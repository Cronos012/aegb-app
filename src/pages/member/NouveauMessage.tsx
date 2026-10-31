import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useSession } from '../../auth/session'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { ErrorNote } from '../../components/Feedback'
import { SearchField, TextField } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { MemberPicker } from '../../components/messages/MemberPicker'
import { errorMessage } from '../../lib/errors'
import { useDirectory, type DirectoryMember } from '../../lib/feed'
import { openPrivate } from '../../lib/messages'
import { supabase } from '../../lib/supabase'

type Tab = 'prive' | 'groupe'

/** Écrire à un membre, ou créer un petit groupe. */
export function NouveauMessage() {
  const uid = useSession().session?.user.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const directory = useDirectory()
  const [tab, setTab] = useState<Tab>('prive')
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<DirectoryMember[]>([])
  const [opening, setOpening] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const members = directory.data?.filter((m) => m.id !== uid)
  const selected = new Set(picked.map((m) => m.id))

  async function write(m: DirectoryMember) {
    setOpening(m.id)
    try {
      const id = await openPrivate(m.id)
      navigate(`/app/messages/${id}`, { replace: true })
    } catch (e) {
      toast(errorMessage(e), 'error')
      setOpening(null)
    }
  }

  function toggle(m: DirectoryMember) {
    setPicked((list) => (list.some((p) => p.id === m.id) ? list.filter((p) => p.id !== m.id) : [...list, m]))
  }

  async function create() {
    setCreating(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_group', { p_title: name.trim(), p_members: picked.map((m) => m.id) })
    setCreating(false)
    if (error) return setError(error)
    await queryClient.invalidateQueries({ queryKey: ['messages', 'liste'] })
    navigate(`/app/messages/${data}`, { replace: true })
  }

  const tabs: [Tab, string][] = [
    ['prive', 'Message privé'],
    ['groupe', 'Groupe'],
  ]

  return (
    <div className="flex h-dvh flex-col bg-surface lg:h-full">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line-soft px-4 pt-[max(env(safe-area-inset-top),14px)] pb-3 lg:px-6 lg:pt-5">
        <h1 className="titre m-0 text-[24px]">Nouveau message</h1>
        <button type="button" onClick={() => navigate('/app/messages')} className="h-10 rounded-xl px-2 text-[15px] font-bold text-muted hover:text-ink">
          Annuler
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-3.5 px-4 pt-4 pb-2 lg:px-6">
          <div role="radiogroup" aria-label="Type de conversation" className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
            {tabs.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={tab === value}
                onClick={() => setTab(value)}
                className={`h-11 rounded-xl text-[15px] font-bold ${tab === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'groupe' ? (
            <>
              <TextField label="Nom du groupe" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Révisions de partiels" />
              {picked.length ? (
                <ul className="m-0 flex list-none gap-3 overflow-x-auto p-0 pt-1 pb-1" aria-label="Membres choisis">
                  {picked.map((m) => (
                    <li key={m.id} className="flex w-16 shrink-0 flex-col items-center gap-1">
                      <span className="relative">
                        <Avatar person={m} size={48} />
                        <button type="button" onClick={() => toggle(m)} aria-label={`Retirer ${m.first_name}`} className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-nuit text-white">
                          <X className="size-3.5" strokeWidth={3} />
                        </button>
                      </span>
                      <span className="w-full truncate text-center text-[12px] font-bold">{m.first_name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}

          <SearchField value={query} onChange={setQuery} placeholder={tab === 'groupe' ? 'Ajouter des membres' : 'Rechercher un membre'} label="Rechercher un membre" />
        </div>

        <MemberPicker members={members} query={query} selected={tab === 'groupe' ? selected : undefined} busy={opening} onPick={tab === 'groupe' ? toggle : write} />
        <ErrorNote error={directory.error} className="mx-4" />
      </div>

      {tab === 'groupe' ? (
        <div className="shrink-0 border-t border-line-soft bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),14px)] lg:px-6">
          <ErrorNote error={error} className="mb-3" />
          <Button onClick={create} busy={creating} disabled={!name.trim() || !picked.length} className="w-full">
            {picked.length ? `Créer le groupe · ${picked.length + 1} personnes` : 'Choisis au moins un membre'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
