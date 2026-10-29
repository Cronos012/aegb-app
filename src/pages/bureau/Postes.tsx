import { useMemo, useState } from 'react'
import { Check, Eye, EyeOff, Info, TriangleAlert, UserPlus } from 'lucide-react'
import { Avatar, EmptyAvatar } from '../../components/Avatar'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNote, PageLoader } from '../../components/Feedback'
import { SearchField } from '../../components/Field'
import { useToast } from '../../components/Toast'
import { errorMessage } from '../../lib/errors'
import { orNull } from '../../lib/feed'
import { fullName, TYPE_LABELS } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { can, useAction, useActiveMembers, useMe, useRoles, useScreensAndPermissions, type AccessLevel, type RoleWithHolder } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { BureauPage, Card } from './BureauPage'

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Liste des membres validés avec recherche, pour choisir un titulaire. */
function MemberPicker({ roles, except, hide, selected, onSelect }: { roles: RoleWithHolder[]; except: string; hide?: string; selected: string | null; onSelect: (id: string) => void }) {
  const members = useActiveMembers()
  const [query, setQuery] = useState('')
  const taken = new Map(roles.filter((r) => r.holder && r.code !== except).map((r) => [r.holder!.id, r.label]))
  const q = normalize(query.trim())
  const list = (members.data ?? []).filter((m) => m.id !== hide && (!q || normalize(`${m.first_name} ${m.last_name}`).includes(q)))

  return (
    <div className="flex flex-col gap-3">
      <SearchField value={query} onChange={setQuery} placeholder="Rechercher un membre" />
      {members.isPending ? <PageLoader /> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0" role="radiogroup" aria-label="Membres validés">
        {list.map((m) => {
          const other = taken.get(m.id)
          const active = selected === m.id
          return (
            <li key={m.id}>
              <label
                className={`flex items-center gap-3 rounded-2xl border-[1.5px] px-3.5 py-2.5 ${other ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'} ${active ? 'border-primary bg-select' : 'border-line-soft'}`}
              >
                <Avatar person={m} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{fullName(m)}</span>
                  <span className="block truncate text-[13px] text-muted">{other ? `Déjà au poste ${other}` : TYPE_LABELS[m.member_type]}</span>
                </span>
                <input type="radio" name="titulaire" checked={active} disabled={!!other} onChange={() => onSelect(m.id)} className="size-5 accent-[#1A2352]" />
              </label>
            </li>
          )
        })}
      </ul>
      {!list.length && members.data ? <p className="m-0 text-sm text-muted">Aucun membre validé ne correspond.</p> : null}
    </div>
  )
}

/** Choisir le titulaire d'un poste. */
function AttribuerPoste({ role, roles, onClose }: { role: RoleWithHolder; roles: RoleWithHolder[]; onClose: () => void }) {
  const toast = useToast()
  const members = useActiveMembers()
  const rights = useScreensAndPermissions().data
  const [selected, setSelected] = useState<string | null>(role.holder?.id ?? null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const assign = useAction((memberId: string) => supabase.rpc('assign_role', { p_role: role.code, p_member: memberId }), [['postes'], ['bureau'], ['me']])
  const clear = useAction(() => supabase.rpc('clear_role', { p_role: role.code }), [['postes'], ['bureau'], ['me']])

  const opens = rights?.permissions
    .filter((p) => p.role_code === role.code)
    .map((p) => rights.screens.find((s) => s.code === p.screen_code))
    .filter(Boolean)
    .sort((a, b) => a!.sort_order - b!.sort_order)
    .map((s) => s!.label)

  const chosen = members.data?.find((m) => m.id === selected)

  async function save() {
    if (!selected) return
    setError(null)
    try {
      await assign.mutateAsync(selected)
      toast(`${chosen ? fullName(chosen) : 'Le membre'} occupe le poste ${role.label}.`)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function remove() {
    setError(null)
    try {
      await clear.mutateAsync(undefined)
      toast(`Le poste ${role.label} est libre.`)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const unchanged = selected === (role.holder?.id ?? null)

  return (
    <Dialog
      open
      onClose={onClose}
      title={role.label}
      description={opens?.length ? `Choisis un membre validé. Cette personne aura accès à : ${opens.join(', ')}.` : 'Choisis un membre validé.'}
      footer={
        confirmRemove ? (
          <>
            <Button variant="outline" size="md" className="flex-1" onClick={() => setConfirmRemove(false)}>
              Annuler
            </Button>
            <Button variant="danger" size="md" className="flex-1" busy={clear.isPending} onClick={remove}>
              Retirer {role.holder?.first_name}
            </Button>
          </>
        ) : (
          <div className="flex w-full flex-col gap-2">
            <Button className="w-full" disabled={!selected || unchanged} busy={assign.isPending} onClick={save}>
              {chosen && !unchanged ? `Nommer ${fullName(chosen)}` : 'Choisis un membre'}
            </Button>
            {role.holder ? (
              <Button variant="ghost" size="md" className="w-full text-danger" onClick={() => setConfirmRemove(true)}>
                Retirer {fullName(role.holder)} de ce poste
              </Button>
            ) : null}
          </div>
        )
      }
    >
      {confirmRemove ? (
        <p className="m-0 text-[15px] leading-[1.5]">
          {role.holder ? fullName(role.holder) : 'Le titulaire'} n'aura plus accès aux écrans du poste {role.label}. Le changement est noté dans le journal.
        </p>
      ) : (
        <MemberPicker roles={roles} except={role.code} selected={selected} onSelect={setSelected} />
      )}
      <ErrorNote error={error} className="mt-3" />
    </Dialog>
  )
}

/** Le titulaire du poste d'admin numérique le passe à son successeur. */
function TransmettrePoste({ role, roles, myId, onClose }: { role: RoleWithHolder; roles: RoleWithHolder[]; myId: string; onClose: () => void }) {
  const toast = useToast()
  const members = useActiveMembers()
  const [selected, setSelected] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const transfer = useAction((memberId: string) => supabase.rpc('transfer_guarantor', { p_member: memberId }), [['postes'], ['bureau'], ['me']])
  const chosen = members.data?.find((m) => m.id === selected)

  async function save() {
    if (!selected) return
    setError(null)
    try {
      await transfer.mutateAsync(selected)
      toast(`Ton poste est maintenant à ${chosen ? fullName(chosen) : 'ton successeur'}.`)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={confirming ? 'Transmettre ton poste ?' : 'Transmettre ton poste'}
      description={confirming ? undefined : 'Choisis ton successeur. Il reçoit tout de suite les mêmes droits que toi.'}
      footer={
        confirming ? (
          <>
            <Button variant="outline" size="md" className="flex-1" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button variant="danger" size="md" className="flex-1" busy={transfer.isPending} onClick={save}>
              Transmettre
            </Button>
          </>
        ) : (
          <Button className="w-full" disabled={!selected} onClick={() => setConfirming(true)}>
            {chosen ? `Continuer avec ${fullName(chosen)}` : 'Choisis un membre'}
          </Button>
        )
      }
    >
      {confirming && chosen ? (
        <p className="m-0 text-[15px] leading-[1.5]">
          <strong>{fullName(chosen)}</strong> devient {role.label} et reçoit tous tes droits. Toi, tu redeviens un membre sans poste, et seul ton successeur pourra te rendre ce poste.
        </p>
      ) : (
        <MemberPicker roles={roles} except={role.code} hide={myId} selected={selected} onSelect={setSelected} />
      )}
      <ErrorNote error={error} className="mt-3" />
    </Dialog>
  )
}

const NEXT: Record<'aucun' | AccessLevel, AccessLevel | null> = { aucun: 'lecture', lecture: 'complet', complet: null }

function Cell({ level, editable, busy, onClick, label }: { level: AccessLevel | null; editable: boolean; busy: boolean; onClick: () => void; label: string }) {
  const mark = level === 'complet' ? (
    <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-ink">
      <Check className="size-4" strokeWidth={3} />
    </span>
  ) : level === 'lecture' ? (
    <span className="grid size-7 place-items-center rounded-full border-2 border-primary text-ink">
      <Eye className="size-3.5" />
    </span>
  ) : (
    <span className="size-7 rounded-full border-2 border-line" />
  )
  if (!editable) return <span className="inline-grid" aria-label={label}>{mark}</span>
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-label={`${label}. Changer`} className="inline-grid rounded-full p-1 hover:bg-surface-2 disabled:opacity-50">
      {mark}
    </button>
  )
}

export default function Postes() {
  const me = useMe().data!
  const desktop = useIsDesktop()
  const toast = useToast()
  const roles = useRoles()
  const rights = useScreensAndPermissions()
  const [editing, setEditing] = useState<RoleWithHolder | null>(null)
  const [handing, setHanding] = useState<RoleWithHolder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const editable = can(me, 'postes')
  // Le poste d'admin numérique n'a rien de particulier aux yeux des autres :
  // seul son titulaire voit ses droits et peut le transmettre.
  const mine = (r: RoleWithHolder) => me.guarantor && r.code === me.role?.code
  const setLevel = useAction((v: { role: string; screen: string; level: AccessLevel | null }) => supabase.rpc('set_role_permission', { p_role: v.role, p_screen: v.screen, p_level: orNull(v.level) }), [['postes'], ['me']])

  const levels = useMemo(() => new Map(rights.data?.permissions.map((p) => [`${p.role_code}:${p.screen_code}`, p.level])), [rights.data])

  if (roles.isPending || rights.isPending) return <PageLoader />
  const list = roles.data ?? []
  const vacant = list.filter((r) => !r.holder)

  async function cycle(role: RoleWithHolder, screen: { code: string; label: string }) {
    const current = levels.get(`${role.code}:${screen.code}`) ?? 'aucun'
    const next = NEXT[current]
    setError(null)
    try {
      await setLevel.mutateAsync({ role: role.code, screen: screen.code, level: next })
      toast(`${role.label} · ${screen.label} : ${next === 'complet' ? 'accès complet' : next === 'lecture' ? 'voit sans modifier' : "plus d'accès"}.`)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const vacantNote = vacant.length ? (
    <div className="flex items-start gap-2.5 rounded-[18px] bg-warn-soft px-4 py-3 text-[14px]">
      <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-warn" />
      <p className="m-0">
        <strong>
          {vacant.length} poste{vacant.length > 1 ? 's' : ''} à attribuer :
        </strong>{' '}
        {vacant.map((r) => r.label).join(', ')}. Tant qu'un poste est vide, la présidence et la vice-présidence s'occupent de ses écrans.
      </p>
    </div>
  ) : null

  return (
    <BureauPage
      title={desktop ? 'Postes et droits' : 'Postes du bureau'}
      subtitle={desktop ? `Qui voit quoi dans les coulisses.${editable ? ' Clique sur une case pour changer un droit.' : ''}` : 'Chaque poste ouvre ses propres écrans du bureau.'}
      actions={
        editable && vacant.length ? (
          <Button size="md" icon={<UserPlus className="size-4" />} onClick={() => setEditing(vacant[0])}>
            Attribuer un poste
          </Button>
        ) : null
      }
    >
      <ErrorNote error={error ?? roles.error ?? rights.error} />
      {desktop ? vacantNote : null}

      {!desktop ? (
        <Card className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-line-soft p-0">
            {list.map((r) => (
              <li key={r.code} className="flex items-center gap-3 px-4 py-3">
                {r.holder ? <Avatar person={r.holder} size={42} /> : <EmptyAvatar size={42} />}
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[15px] font-bold">{r.label}</p>
                  <p className={`m-0 truncate text-[14px] ${r.holder ? '' : 'text-muted italic'}`}>{r.holder ? fullName(r.holder) : 'Non attribué'}</p>
                  <p className="m-0 truncate text-[12px] text-muted">{r.description}</p>
                </div>
                {mine(r) ? (
                  <Button size="sm" variant="outline" onClick={() => setHanding(r)} className="rounded-full">
                    Transmettre
                  </Button>
                ) : editable ? (
                  <Button size="sm" variant={r.holder ? 'outline' : 'primary'} onClick={() => setEditing(r)} className="rounded-full">
                    {r.holder ? 'Changer' : 'Attribuer'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line-soft">
                <th className="px-5 py-4 text-left align-bottom text-[12px] font-bold tracking-wide text-muted uppercase">Écran</th>
                {list.map((r) => (
                  <th key={r.code} className="w-[110px] px-2 py-4 align-bottom">
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => (mine(r) ? setHanding(r) : setEditing(r))}
                      className="mx-auto flex flex-col items-center gap-1.5 rounded-xl px-1 py-1 enabled:hover:bg-surface-2 disabled:cursor-default"
                      title={editable ? (mine(r) ? 'Transmettre ton poste' : 'Changer le titulaire') : undefined}
                    >
                      {r.holder ? <Avatar person={r.holder} size={30} /> : <EmptyAvatar size={30} />}
                      <span className="text-[13px] leading-tight font-bold text-ink">{r.label}</span>
                      <span className={`text-[12px] leading-tight font-normal ${r.holder ? 'text-muted' : 'font-semibold text-[#A67000]'}`}>{r.holder ? fullName(r.holder) : 'À attribuer'}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rights.data!.screens.map((s) => (
                <tr key={s.code} className="border-b border-line-soft last:border-0">
                  <td className="px-5 py-2.5">
                    <p className="m-0 font-bold">{s.label}</p>
                    <p className="m-0 text-[12px] text-muted">{s.description}</p>
                  </td>
                  {list.map((r) => {
                    const level = mine(r) ? 'complet' : (levels.get(`${r.code}:${s.code}`) ?? null)
                    const text = level === 'complet' ? 'Accès complet' : level === 'lecture' ? 'Voit sans modifier' : "Pas d'accès"
                    return (
                      <td key={r.code} className="px-2 py-2.5 text-center">
                        <Cell
                          level={level}
                          editable={editable && !mine(r)}
                          busy={setLevel.isPending}
                          label={`${r.label}, ${s.label} : ${text}`}
                          onClick={() => cycle(r, s)}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line-soft px-5 py-3.5 text-[13px] text-muted">
            <span className="flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-ink">
                <Check className="size-3" strokeWidth={3} />
              </span>
              Accès complet
            </span>
            <span className="flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-full border-2 border-primary">
                <Eye className="size-2.5" />
              </span>
              Voit sans modifier
            </span>
            <span className="flex items-center gap-2">
              <span className="size-5 rounded-full border-2 border-line" /> Pas d'accès
            </span>
            <span className="ml-auto">Un membre sans poste ne voit pas le mode bureau.</span>
          </div>
        </Card>
      )}

      {!desktop ? vacantNote : null}
      <p className="m-0 flex items-start gap-2 px-2 text-[13px] text-muted">
        <Info className="mt-px size-4 shrink-0" /> Une personne occupe au plus un poste, et chaque changement est noté dans le journal.
      </p>
      {me.guarantor ? (
        <p className="m-0 flex items-start gap-2 px-2 text-[13px] text-muted">
          <EyeOff className="mt-px size-4 shrink-0" /> Ton poste a accès à tout et toi seul peux le transmettre. Les autres membres du bureau ne voient pas ces droits.
        </p>
      ) : null}

      {editing ? <AttribuerPoste role={editing} roles={list} onClose={() => setEditing(null)} /> : null}
      {handing ? <TransmettrePoste role={handing} roles={list} myId={me.profile.id} onClose={() => setHanding(null)} /> : null}
    </BureauPage>
  )
}
