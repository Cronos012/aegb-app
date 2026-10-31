import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ClipboardList, Inbox, MessageSquare, Send, SendHorizontal } from 'lucide-react'
import { Avatar } from '../../components/Avatar'
import { Button, ButtonLink } from '../../components/Button'
import { EmptyState, ErrorNote, Note, PageLoader, Spinner } from '../../components/Feedback'
import { SearchField, TextArea } from '../../components/Field'
import { Logo } from '../../components/Logo'
import { useToast } from '../../components/Toast'
import { Toggle } from '../../components/Toggle'
import { OfficialBadge } from '../../components/feed/PostCard'
import { Thread } from '../../components/messages/Thread'
import { errorMessage } from '../../lib/errors'
import { dateTime, frenchSpaces, longDate, TYPE_LABELS } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { fillWelcome, listDate, useAegbInbox, useAegbSettings, useConversationInfo, WELCOME_ACTIONS, type InboxRow } from '../../lib/messages'
import { can, useMe } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import { BureauPage, Card, Chips } from './BureauPage'

type Tab = 'boite' | 'bienvenue'
type Filter = 'repondre' | 'toutes'

function plain(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/* ----------------------------------------------------------------------------
   Boîte de réception
---------------------------------------------------------------------------- */

function InboxLine({ r, active }: { r: InboxRow; active: boolean }) {
  return (
    <li>
      <Link
        to={`/bureau/aegb/${r.id}`}
        aria-current={active ? 'page' : undefined}
        className={`flex items-start gap-3 rounded-2xl px-3 py-3 text-ink no-underline ${active ? 'bg-select' : 'hover:bg-surface-2'}`}
      >
        <Avatar person={{ id: r.member_id, first_name: r.first_name, last_name: r.last_name, avatar_path: r.avatar_path }} size={44} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-bold">
              {r.first_name} {r.last_name}
            </span>
            <span className={`shrink-0 text-[12px] ${r.last_from_member ? 'font-bold text-ink' : 'text-muted'}`}>{listDate(r.last_at)}</span>
          </span>
          <span className={`block truncate text-[14px] ${r.last_from_member ? 'font-semibold' : 'text-muted'}`}>{r.last_from_member ? r.last_preview : `AEGB : ${r.last_preview}`}</span>
          {r.last_from_member ? (
            <span className="mt-1 inline-flex h-5 items-center rounded-full bg-safran-pale px-2 text-[11px] font-bold text-[#163F93]">À répondre</span>
          ) : r.replied_by_name ? (
            <span className="block truncate text-[12px] text-muted">Répondu par {r.replied_by_name}</span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

function InboxList({ selected }: { selected: string | undefined }) {
  const inbox = useAegbInbox()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('repondre')
  const rows = inbox.data ?? []
  const waiting = rows.filter((r) => r.last_from_member).length
  const words = plain(query).split(/\s+/).filter(Boolean)
  const shown = rows.filter((r) => (filter === 'toutes' || r.last_from_member) && words.every((w) => plain(`${r.first_name} ${r.last_name}`).includes(w)))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SearchField value={query} onChange={setQuery} placeholder="Rechercher un membre" label="Rechercher un membre" className="border-0 bg-surface-2" />
      <Chips
        label="Afficher"
        options={[
          { value: 'repondre', label: 'À répondre', count: waiting },
          { value: 'toutes', label: 'Toutes', count: rows.length },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <ErrorNote error={inbox.error} />
      {inbox.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : shown.length ? (
        <ul className="-mx-2 m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0">
          {shown.map((r) => (
            <InboxLine key={r.id} r={r} active={r.id === selected} />
          ))}
        </ul>
      ) : (
        <EmptyState title={filter === 'repondre' && rows.length ? 'Tout le monde a sa réponse' : 'Aucun message pour le moment'} icon={<Inbox className="size-6" />}>
          {filter === 'repondre' && rows.length ? 'Les nouveaux messages des membres arrivent ici.' : 'Quand un membre écrit à AEGB, sa conversation arrive ici.'}
        </EmptyState>
      )}
    </div>
  )
}

/** Une conversation d'un membre avec AEGB, vue par le bureau. */
function AegbConversation({ id, back }: { id: string; back: boolean }) {
  const me = useMe().data!
  const navigate = useNavigate()
  const info = useConversationInfo(id)
  const c = info.data
  const o = c?.other

  if (info.isPending) return <PageLoader />
  // Sa propre conversation avec AEGB : on ne se répond pas à soi-même.
  if (c && !c.as_aegb) {
    return (
      <div className="grid flex-1 place-items-center px-6">
        <EmptyState title="C’est ta conversation avec AEGB" icon={<MessageSquare className="size-6" />}>
          Un autre membre du bureau te répondra au nom de l’AEGB. Tu la retrouves dans{' '}
          <Link to={`/app/messages/${c.id}`} className="font-bold">
            Messages
          </Link>
          .
        </EmptyState>
      </div>
    )
  }
  if (!c || !o) {
    return (
      <div className="grid flex-1 place-items-center">
        <EmptyState title="Cette conversation n’est plus disponible" icon={<MessageSquare className="size-6" />} />
        <ErrorNote error={info.error} className="mx-6" />
      </div>
    )
  }

  const line = `${TYPE_LABELS[o.member_type]}${o.city ? ` à ${o.city}` : ''}${o.validated_at ? ` · membre depuis le ${longDate(o.validated_at)}` : ''}`
  const fiche = can(me, 'membres', 'lecture') ? `/bureau/membres/${o.id}` : `/app/membres/${o.id}`

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-2 pt-[env(safe-area-inset-top)] lg:px-5 lg:py-3.5 lg:pt-3.5">
        {back ? (
          <button type="button" onClick={() => navigate('/bureau/aegb')} aria-label="Retour à la boîte" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-surface-2">
            <ChevronLeft className="size-6" strokeWidth={2.2} />
          </button>
        ) : null}
        <Avatar person={o} size={44} />
        <span className="min-w-0 flex-1 py-2.5 lg:py-0">
          <span className="block truncate text-[16px] font-bold">
            {o.first_name} {o.last_name}
          </span>
          <span className="block truncate text-[13px] text-muted">{line}</span>
        </span>
        <ButtonLink to={fiche} variant="outline" size="md" icon={<ClipboardList className="size-5" />} className="mr-2 lg:mr-0" aria-label="Voir la fiche">
          <span className="hidden lg:inline">Voir la fiche</span>
        </ButtonLink>
      </header>
      <Thread key={id} id={id} info={c} readOnly={!can(me, 'bienvenue')} />
    </>
  )
}

/* ----------------------------------------------------------------------------
   Message de bienvenue
---------------------------------------------------------------------------- */

const TOKENS = [
  { token: '{Prénom}', label: 'Prénom' },
  { token: '{Ville}', label: 'Ville' },
  { token: '{Type}', label: 'Type de membre' },
]

function Preview({ text, actions, name }: { text: string; actions: string[]; name: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const buttons = actions.map((v) => WELCOME_ACTIONS.find((a) => a.value === v)).filter((a) => !!a)
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12px] font-extrabold tracking-wide text-muted uppercase">Aperçu pour {name}</p>
      <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[12px] border-[9px] border-nuit bg-page shadow-xl" aria-label="Aperçu du message de bienvenue">
        <div className="bg-tisse flex items-center gap-3 px-4 py-3 text-white">
          <span className="bg-anneau inline-flex rounded-full p-[2px]">
            <Logo size={34} />
          </span>
          <span>
            <span className="block text-[15px] font-bold">AEGB</span>
            <span className="block text-[12px] font-bold text-ciel">Compte officiel</span>
          </span>
        </div>
        <div className="flex min-h-[340px] flex-col items-start gap-1.5 px-3 py-4">
          <span className="mb-1 self-center rounded-full bg-line-soft px-3 py-1 text-[11px] font-bold text-muted">Aujourd’hui</span>
          {paragraphs.length ? (
            paragraphs.map((p, i) => (
              <div key={i} className="max-w-[92%] rounded-[16px] rounded-bl-[6px] bg-surface px-3 py-2 text-[14px] leading-[1.45] whitespace-pre-line shadow-[0_1px_1px_rgba(18,22,43,0.06)]">
                {frenchSpaces(p)}
              </div>
            ))
          ) : (
            <p className="m-0 self-center text-[13px] text-muted">Le message est vide.</p>
          )}
          {buttons.map((b) => (
            <span key={b.value} className="flex h-10 w-full max-w-[280px] items-center justify-center rounded-[12px] border-[1.5px] border-primary bg-surface text-[14px] font-bold">
              {b.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-line-soft bg-surface px-3 py-2.5">
          <span className="flex h-10 flex-1 items-center rounded-full bg-surface-2 px-4 text-[13px] text-muted">Écrire au bureau</span>
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-ink">
            <SendHorizontal className="size-4" />
          </span>
        </div>
      </div>
    </div>
  )
}

function Welcome() {
  const me = useMe().data!
  const writes = can(me, 'bienvenue')
  const toast = useToast()
  const queryClient = useQueryClient()
  const settings = useAegbSettings()
  const area = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState<string | null>(null)
  const [actions, setActions] = useState<string[] | null>(null)
  const [announce, setAnnounce] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [error, setError] = useState<unknown>(null)

  if (settings.isPending) return <PageLoader />
  const s = settings.data
  if (!s) return <ErrorNote error={settings.error ?? 'Les réglages ne sont pas lisibles.'} />

  const value = text ?? s.welcome_text
  const picked = actions ?? s.welcome_actions
  const announceOn = announce ?? s.announce_arrival
  const dirty = text !== null || actions !== null || announce !== null
  const p = me.profile
  const filled = fillWelcome(value, { first_name: p.first_name, city: p.city, type: TYPE_LABELS[p.member_type] })

  function insert(token: string) {
    const el = area.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    setText(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  async function save(quiet = false): Promise<boolean> {
    setBusy('save')
    setError(null)
    const { error } = await supabase.rpc('save_welcome', { p_text: value, p_actions: picked, p_announce: announceOn })
    setBusy(null)
    if (error) {
      setError(error)
      return false
    }
    await queryClient.invalidateQueries({ queryKey: ['bureau', 'aegb', 'reglages'] })
    setText(null)
    setActions(null)
    setAnnounce(null)
    if (!quiet) toast('Message de bienvenue enregistré.')
    return true
  }

  async function test() {
    if (dirty && !(await save(true))) return
    setBusy('test')
    const { error } = await supabase.rpc('send_welcome_test')
    setBusy(null)
    if (error) return toast(errorMessage(error), 'error')
    queryClient.invalidateQueries({ queryKey: ['messages'] })
    toast(dirty ? 'Enregistré, et le test est parti dans ta conversation avec AEGB.' : 'Le test est parti dans ta conversation avec AEGB.')
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
      <Card className="flex flex-col gap-5 p-4 lg:p-6">
        {!writes ? <Note>Ton poste peut consulter ce message, pas le modifier.</Note> : null}
        <div className="flex flex-col gap-2">
          <TextArea ref={area} label="Le message" value={value} onChange={(e) => setText(e.target.value)} maxLength={2000} counter rows={8} disabled={!writes} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">Insérer :</span>
            {TOKENS.map((t) => (
              <button key={t.token} type="button" onClick={() => insert(t.token)} disabled={!writes} className="h-9 rounded-full border border-line bg-surface px-3.5 text-[13px] font-bold hover:bg-surface-2 disabled:opacity-50">
                {t.label}
              </button>
            ))}
          </div>
          <p className="m-0 text-[12px] text-muted">Laisse une ligne vide entre deux paragraphes : chacun devient une bulle.</p>
        </div>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-bold">Boutons sous le message</legend>
          {WELCOME_ACTIONS.map((a) => {
            const on = picked.includes(a.value)
            return (
              <label key={a.value} className={`flex items-center gap-3 rounded-2xl border border-line-soft px-4 py-3 ${writes ? 'cursor-pointer hover:bg-surface-2' : 'opacity-60'}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!writes}
                  onChange={(e) => setActions(e.target.checked ? [...picked, a.value] : picked.filter((v) => v !== a.value))}
                  className="peer sr-only"
                />
                <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 peer-focus-visible:ring-[3px] peer-focus-visible:ring-safran/60 ${on ? 'border-primary bg-primary text-primary-ink' : 'border-line'}`} aria-hidden="true">
                  {on ? <Check className="size-4" strokeWidth={3} /> : null}
                </span>
                <span className="flex-1 text-[15px] font-bold">{a.label}</span>
                <span className="text-[13px] text-muted">{a.detail}</span>
              </label>
            )
          })}
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3 opacity-70">
            <span className="size-6 shrink-0 rounded-md border-2 border-line" aria-hidden="true" />
            <span className="flex-1 text-[15px] font-bold">Payer ma cotisation</span>
            <span className="text-[13px] text-muted">arrive avec la cotisation</span>
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm font-bold">Quand un compte est validé</p>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-2 px-4 py-3.5">
            <span>
              <span className="block text-[15px] font-bold">Ajouter au grand groupe AEGB</span>
              <span className="block text-[13px] text-muted">Tous les membres validés y sont</span>
            </span>
            <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[12px] font-bold text-ok">Automatique</span>
          </div>
          <Toggle
            checked={announceOn}
            onChange={setAnnounce}
            disabled={!writes}
            title="Annoncer l’arrivée dans le grand groupe"
            detail={`« ${p.first_name} ${p.last_name} vient de rejoindre l’AEGB. Souhaitez-lui la bienvenue ! »`}
          />
        </div>

        <ErrorNote error={error} />
        {s.updated_at ? (
          <p className="m-0 text-[12px] text-muted">
            Modifié le {dateTime(s.updated_at)}
            {s.updated_by_name ? ` par ${s.updated_by_name}` : ''}.
          </p>
        ) : null}
        {writes ? (
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button variant="outline" size="md" icon={<Send className="size-5" />} onClick={test} busy={busy === 'test'} disabled={!!busy || !value.trim()}>
              M’envoyer un test
            </Button>
            <Button size="md" icon={<Check className="size-5" />} onClick={() => save()} busy={busy === 'save'} disabled={!!busy || !dirty || !value.trim()} className="sm:ml-auto">
              Enregistrer
            </Button>
          </div>
        ) : null}
      </Card>

      <Preview text={filled} actions={picked} name={p.first_name} />
    </div>
  )
}

/* ----------------------------------------------------------------------------
   La page
---------------------------------------------------------------------------- */

export default function CompteAegb() {
  const { id } = useParams()
  const desktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  const inbox = useAegbInbox()
  const tab: Tab = params.get('onglet') === 'bienvenue' ? 'bienvenue' : 'boite'
  const waiting = inbox.data?.filter((r) => r.last_from_member).length ?? 0

  // Sur téléphone, une conversation prend tout l'écran.
  if (!desktop && id) {
    return (
      <div className="flex h-app flex-col bg-page">
        <AegbConversation id={id} back />
      </div>
    )
  }

  return (
    <BureauPage
      title="Compte officiel AEGB"
      kicker={
        <span className="mb-1 inline-flex">
          <OfficialBadge />
        </span>
      }
      subtitle={tab === 'boite' ? 'Les membres écrivent ici au bureau. Tes réponses partent signées AEGB.' : 'Le message de bienvenue part en privé, du compte AEGB, dès qu’un compte est validé.'}
      controls={(onDark) => (
        <Chips
          label="Onglet"
          options={[
            { value: 'boite', label: 'Boîte de réception', count: waiting || undefined },
            { value: 'bienvenue', label: 'Message de bienvenue' },
          ]}
          value={tab}
          onChange={(v) => setParams(v === 'bienvenue' ? { onglet: 'bienvenue' } : {}, { replace: true })}
          onDark={onDark}
        />
      )}
    >
      {tab === 'bienvenue' ? (
        <Welcome />
      ) : desktop ? (
        <div className="grid h-[calc(100dvh/var(--zoom,1)-236px)] min-h-[520px] grid-cols-[360px_minmax(0,1fr)] gap-6">
          <Card className="flex min-h-0 flex-col p-4">
            <InboxList selected={id} />
          </Card>
          <Card className="flex min-h-0 flex-col overflow-hidden">
            {id ? (
              <AegbConversation id={id} back={false} />
            ) : (
              <div className="grid flex-1 place-items-center">
                <EmptyState title="Choisis un membre" icon={<MessageSquare className="size-6" />}>
                  Sa conversation avec AEGB s’ouvre ici. Ta réponse part signée AEGB.
                </EmptyState>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <Card className="flex flex-col p-4">
          <InboxList selected={undefined} />
        </Card>
      )}
    </BureauPage>
  )
}
