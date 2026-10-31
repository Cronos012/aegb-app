import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Download, Folder, Globe, Lock, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Upload, Users, Vote } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { CATEGORY_ICONS, DocIcon } from '../../components/documents/DocParts'
import { ActionSheet, SheetAction } from '../../components/feed/Dialogs'
import { EmptyState, ErrorNote, Note, PageLoader } from '../../components/Feedback'
import { inputClass, SearchField, TextField } from '../../components/Field'
import { Pill, type Tone } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { ACCEPTED, discardUpload, docKind, downloadDocument, MAX_DOCUMENT_BYTES, sizeLabel, uploadDocument, useDocumentActions, useLibrary, VISIBILITY, type Category, type Doc, type Visibility } from '../../lib/documents'
import { errorMessage } from '../../lib/errors'
import { shortDate } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'
import { can, useMe } from '../../lib/queries'
import { filterDocs } from '../member/Documents'
import { BureauPage, Card } from './BureauPage'

/** L'offre gratuite de Supabase : 1 Go pour toute l'appli. */
const STORAGE_LIMIT = 1024 ** 3
const AG_CATEGORY = '6a0f5d2e-0001-4a6e-9b1a-0000000000a2'

const VIS_PILLS: Record<Visibility, { tone: Tone; icon: typeof Globe }> = {
  public: { tone: 'ok', icon: Globe },
  tous: { tone: 'brand', icon: Users },
  bureau: { tone: 'safran', icon: Lock },
}

function VisPill({ v }: { v: Visibility }) {
  const { tone, icon: Icon } = VIS_PILLS[v]
  return (
    <Pill tone={tone} icon={<Icon className="size-3" />}>
      {VISIBILITY[v].label}
    </Pill>
  )
}

/* ----------------------------------------------------------------------------
   Ajouter un document, ou une nouvelle version
---------------------------------------------------------------------------- */

type Editing = { mode: 'new' } | { mode: 'version' | 'edit'; doc: Doc }

function DocumentDialog({ editing, categories, onClose }: { editing: Editing | null; categories: Category[]; onClose: () => void }) {
  const { save } = useDocumentActions()
  const toast = useToast()
  const doc = editing && editing.mode !== 'new' ? editing.doc : null
  // Le dialogue est remonté à chaque ouverture (voir sa clé) : il repart des valeurs du document choisi.
  const [id] = useState(() => doc?.id ?? crypto.randomUUID())
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState(doc?.title ?? '')
  const [category, setCategory] = useState(() => doc?.category_id ?? categories.find((c) => c.id !== AG_CATEGORY)?.id ?? '')
  const [visibility, setVisibility] = useState<Visibility>(doc?.visibility ?? 'tous')
  const [announce, setAnnounce] = useState(editing?.mode !== 'edit')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const open = !!editing

  const needsFile = !editing || editing.mode !== 'edit'
  const tooBig = !!file && file.size > MAX_DOCUMENT_BYTES

  function choose(f: File | undefined) {
    if (!f) return
    setFile(f)
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/^\S/, (c) => c.toUpperCase()))
  }

  async function submit() {
    if (needsFile && !file) return setError('Choisis le fichier à envoyer.')
    if (title.trim().length < 2) return setError('Donne un titre au document.')
    if (!category) return setError('Choisis une catégorie.')
    setError(null)
    setBusy(true)
    let uploaded: string | null = null
    try {
      const sent = file ? await uploadDocument(id, file) : null
      uploaded = sent?.path ?? null
      await save.mutateAsync({ id, category, title: title.trim(), visibility, file: sent, announce: announce && visibility !== 'bureau' && editing?.mode !== 'edit' })
      toast(editing?.mode === 'version' ? 'Nouvelle version en ligne.' : editing?.mode === 'edit' ? 'Document modifié.' : 'Document ajouté.')
      onClose()
    } catch (e) {
      if (uploaded) await discardUpload(uploaded)
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const titleText = editing?.mode === 'version' ? 'Nouvelle version' : editing?.mode === 'edit' ? 'Modifier le document' : 'Ajouter un document'
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={titleText}
      footer={
        <>
          <Button variant="outline" size="md" className="flex-1 lg:flex-none" onClick={onClose}>
            Annuler
          </Button>
          <span className="hidden flex-1 lg:block" />
          <Button size="md" className="flex-1 lg:flex-none" busy={busy} disabled={tooBig} icon={<Upload className="size-[18px]" />} onClick={submit}>
            {editing?.mode === 'version' ? 'Envoyer la version' : editing?.mode === 'edit' ? 'Enregistrer' : 'Ajouter le document'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {needsFile ? (
          <div className={`flex items-center gap-3.5 rounded-[14px] border-[1.5px] border-dashed px-4 py-3.5 ${tooBig ? 'border-danger bg-danger-soft' : 'border-[#C9CDDC] bg-[#F8F9FC]'}`}>
            {file ? <DocIcon kind={docKind({ mime: file.type || 'application/pdf', file_name: file.name })} width={36} height={44} /> : <Upload className="size-8 text-muted" />}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[14px] font-bold">{file ? file.name : 'Aucun fichier choisi'}</span>
              <span className={`text-[12px] ${tooBig ? 'font-bold text-danger' : 'text-muted'}`}>
                {file ? `${sizeLabel(file.size)} · ` : ''}
                {tooBig ? 'trop lourd : 50 Mo au plus par fichier' : file ? 'prêt à envoyer · 50 Mo au plus' : 'PDF, Word, tableur, présentation ou image, 50 Mo au plus'}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>
              {file ? 'Changer de fichier' : 'Choisir un fichier'}
            </Button>
            <input ref={input} type="file" accept={ACCEPTED} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => (choose(e.target.files?.[0]), (e.target.value = ''))} />
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <TextField label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Règlement intérieur" />
          <div className="flex flex-col gap-[7px]">
            <label htmlFor="doc-categorie" className="text-sm font-bold">
              Catégorie
            </label>
            <select id="doc-categorie" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} disabled={!!doc?.assembly_id}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {editing?.mode === 'version' && doc ? (
          <div className="flex flex-col gap-1.5 rounded-[14px] bg-select px-3.5 py-3">
            <span className="flex items-center gap-2 text-[14px] font-extrabold text-leppi">
              <RefreshCw className="size-[17px]" /> Nouvelle version de « {doc.title} »
            </span>
            <span className="text-[12px] leading-[1.45] text-ink">
              Les membres verront cette version. L’ancienne{doc.file ? ` (${shortDate(doc.file.created_at)})` : ''} reste visible par le bureau seulement.
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold">Qui peut le voir</span>
          <div role="radiogroup" aria-label="Qui peut le voir" className="grid gap-2.5 lg:grid-cols-3">
            {(['tous', 'bureau', 'public'] as Visibility[]).map((v) => {
              const Icon = VIS_PILLS[v].icon
              const on = visibility === v
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setVisibility(v)}
                  className={`flex flex-col gap-1.5 rounded-[14px] px-3.5 py-3 text-left ${on ? 'border-2 border-leppi bg-[#F1F3FB]' : 'border-[1.5px] border-line bg-surface'}`}
                >
                  <span className="flex items-center gap-2 text-[14px] font-extrabold">
                    <Icon className="size-[17px]" /> {VISIBILITY[v].label}
                  </span>
                  <span className="text-[12px] leading-[1.4] text-muted">{VISIBILITY[v].detail}</span>
                </button>
              )
            })}
          </div>
        </div>

        {editing?.mode === 'edit' ? null : visibility === 'bureau' ? (
          <span className="text-[13px] text-muted">Un document du bureau n’est jamais annoncé dans le fil.</span>
        ) : (
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="mt-1 size-[18px] accent-[var(--color-leppi)]" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[14px] font-bold">Annoncer dans le fil</span>
              <span className="text-[12px] leading-[1.4] text-muted">Une annonce du bureau dit qu’un {editing?.mode === 'version' ? 'document a une nouvelle version' : 'nouveau document est disponible'}, avec le lien.</span>
            </span>
          </label>
        )}

        <ErrorNote error={error ? (typeof error === 'string' ? error : errorMessage(error)) : null} />
      </div>
    </Dialog>
  )
}

/* ----------------------------------------------------------------------------
   Catégories
---------------------------------------------------------------------------- */

function CategoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { saveCategory } = useDocumentActions()
  const toast = useToast()
  const [name, setName] = useState('')
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nouvelle catégorie"
      footer={
        <Button
          size="md"
          className="flex-1"
          busy={saveCategory.isPending}
          disabled={name.trim().length < 2}
          onClick={() =>
            saveCategory.mutate(
              { id: null, name: name.trim() },
              {
                onSuccess: () => {
                  toast('Catégorie ajoutée.')
                  setName('')
                  onClose()
                },
              },
            )
          }
        >
          Ajouter
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <TextField label="Nom" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Partenaires" />
        <ErrorNote error={saveCategory.error} />
      </div>
    </Dialog>
  )
}

/* ----------------------------------------------------------------------------
   La page
---------------------------------------------------------------------------- */

export default function DocumentsBureau() {
  const q = useLibrary()
  const me = useMe().data!
  const desktop = useIsDesktop()
  const toast = useToast()
  const { remove, removeCategory } = useDocumentActions()
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<Doc | null>(null)
  const [deleting, setDeleting] = useState<Doc | null>(null)
  const [newCategory, setNewCategory] = useState(false)
  const edit = can(me, 'documents')

  if (q.isPending) return <PageLoader />
  const lib = q.data
  const docs = lib?.documents ?? []
  const shown = filterDocs(docs, category, query)
  const count = (id: string) => docs.filter((d) => d.category_id === id).length
  const used = lib?.storage_used ?? 0
  const docBytes = docs.reduce((sum, d) => sum + (d.versions ?? []).reduce((s, v) => s + v.size_bytes, 0), 0)
  const left = STORAGE_LIMIT - used
  const current = lib?.categories.find((c) => c.id === category)

  const add = edit ? (
    <Button variant="accent" size="md" icon={<Upload className="size-[18px]" />} onClick={() => setEditing({ mode: 'new' })}>
      Ajouter un document
    </Button>
  ) : null

  const nav = (
    <Card className="flex flex-col gap-2.5 px-3.5 py-[18px]">
      <h2 className="titre m-0 px-1 text-[18px]">Catégories</h2>
      <nav aria-label="Catégories de documents" className="flex flex-col gap-0.5">
        {[{ id: null as string | null, name: 'Tous les documents', icon: 'folder' as const, n: docs.length }, ...(lib?.categories ?? []).map((c) => ({ id: c.id as string | null, name: c.name, icon: c.icon, n: count(c.id) }))].map((c) => {
          const Icon = c.icon === 'folder' ? Folder : CATEGORY_ICONS[c.icon]
          const on = c.id === category
          return (
            <button key={c.id ?? 'tout'} type="button" onClick={() => setCategory(c.id)} aria-current={on || undefined} className={`flex h-[42px] items-center gap-2.5 rounded-xl px-3 text-left text-[14px] ${on ? 'bg-select font-extrabold text-leppi' : 'font-semibold text-ink hover:bg-surface-2'}`}>
              <Icon className="size-[18px]" strokeWidth={2.1} />
              <span className="flex-1">{c.name}</span>
              <span className={`text-[12px] font-extrabold ${on ? 'text-leppi' : 'text-muted'}`}>{c.n}</span>
            </button>
          )
        })}
        {edit ? (
          <button type="button" onClick={() => setNewCategory(true)} className="flex h-[42px] items-center gap-2.5 rounded-xl px-3 text-[14px] font-bold text-leppi hover:bg-surface-2">
            <Plus className="size-[18px]" strokeWidth={2.2} /> Nouvelle catégorie
          </button>
        ) : null}
        {edit && current && current.id !== AG_CATEGORY && !count(current.id) ? (
          <button
            type="button"
            onClick={() => removeCategory.mutate(current.id, { onSuccess: () => (setCategory(null), toast('Catégorie supprimée.')), onError: (e) => toast(errorMessage(e), 'error') })}
            className="flex h-[38px] items-center gap-2.5 rounded-xl px-3 text-[13px] font-bold text-danger hover:bg-danger-soft"
          >
            <Trash2 className="size-4" /> Supprimer « {current.name} »
          </button>
        ) : null}
      </nav>
      <div className="flex flex-col gap-2 rounded-[14px] bg-[#F5F6FB] p-3.5">
        <span className="flex justify-between text-[13px]">
          <span className="font-extrabold">Espace utilisé</span>
          <span className="text-muted">
            {sizeLabel(used)} sur 1 Go
          </span>
        </span>
        <span className="relative h-2 rounded-full bg-[#E8EAF2]" aria-hidden="true">
          <span className={`absolute inset-y-0 left-0 rounded-full ${left < 200 * 1024 ** 2 ? 'bg-danger' : 'bg-leppi'}`} style={{ width: `${Math.min(100, (100 * used) / STORAGE_LIMIT)}%` }} />
        </span>
        <span className="text-[12px] leading-[1.4] text-muted">Pour toute l’appli : photos du fil, messages vocaux et documents (dont {sizeLabel(docBytes)} de documents).</span>
      </div>
      {left < 200 * 1024 ** 2 ? <Note tone="warn">Il reste moins de 200 Mo. Retire les anciennes versions inutiles, ou passe à l’offre payante de Supabase.</Note> : null}
    </Card>
  )

  const rowActions = (d: Doc) =>
    edit ? (
      <button type="button" onClick={() => setMenu(d)} aria-label={`Actions sur ${d.title}`} className="grid size-[34px] place-items-center rounded-[10px] text-muted hover:bg-surface-2 hover:text-ink">
        <MoreHorizontal className="size-5" />
      </button>
    ) : (
      <button type="button" onClick={() => downloadDocument(d).catch(() => toast('Le téléchargement n’a pas pu commencer.', 'error'))} aria-label={`Télécharger ${d.title}`} className="grid size-[34px] place-items-center rounded-[10px] text-leppi hover:bg-surface-2">
        <Download className="size-[18px]" />
      </button>
    )

  const versions = (d: Doc) => ((d.versions?.length ?? 0) > 1 ? <Pill>{d.versions!.length} versions</Pill> : null)
  const meta = (d: Doc) => (d.file ? sizeLabel(d.file.size_bytes) : d.assembly_id ? 'fabriqué à l’ouverture' : 'sans fichier')

  const table = (
    <Card className="pt-4 pb-2.5">
      {desktop ? (
        <div className="grid grid-cols-[minmax(0,1fr)_170px_120px_36px] gap-3.5 px-[18px] pb-2 text-[12px] font-extrabold tracking-[0.8px] text-muted uppercase">
          <span>Document</span>
          <span>Qui le voit</span>
          <span>Mis à jour</span>
          <span />
        </div>
      ) : null}
      {shown.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {shown.map((d) => (
            <li key={d.id} className={`items-center gap-3.5 border-t border-line-soft px-[18px] py-2 first:border-0 ${desktop ? 'grid grid-cols-[minmax(0,1fr)_170px_120px_36px]' : 'flex'}`}>
              <Link to={`/app/documents/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3 text-ink no-underline hover:opacity-85">
                <DocIcon kind={docKind(d.file)} width={30} height={38} />
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="flex items-center gap-2 text-[14px] font-bold">
                    <span className="truncate">{d.title}</span>
                    {versions(d)}
                  </span>
                  <span className="truncate text-[12px] text-muted">
                    {d.category} · {meta(d)}
                    {desktop ? '' : ` · ${VISIBILITY[d.visibility].label.toLowerCase()}`}
                  </span>
                </span>
              </Link>
              {desktop ? (
                <>
                  <span>
                    <VisPill v={d.visibility} />
                  </span>
                  <span className="text-[13px] text-muted">{shortDate(d.updated_at)}</span>
                </>
              ) : null}
              {rowActions(d)}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={query ? 'Aucun document ne correspond' : 'Aucun document pour l’instant'}>
          {query ? 'Essaie un autre mot.' : 'Ajoute les statuts, le règlement ou un guide : les membres les retrouvent dans l’onglet Documents.'}
        </EmptyState>
      )}
      {!category || category === AG_CATEGORY ? (
        <div className="mx-[18px] mt-2 mb-1 flex items-center gap-2.5 rounded-xl bg-safran-pale px-3.5 py-2.5 text-[13px] text-[#163F93]">
          <Vote className="size-[17px] shrink-0" />
          <span>Le procès-verbal de chaque AG arrive ici tout seul, à la publication des résultats.</span>
        </div>
      ) : null}
    </Card>
  )

  return (
    <BureauPage
      title="Documents"
      subtitle="Statuts, procès-verbaux, guides et bilans. Les membres les retrouvent dans l’onglet Documents."
      actions={desktop ? add : null}
      controls={(onDark) => <SearchField value={query} onChange={setQuery} placeholder="Chercher un document" label="Chercher un document" className={onDark ? 'border-0' : 'max-w-[360px]'} />}
    >
      <ErrorNote error={q.error} />
      {!desktop && add ? <div className="flex">{add}</div> : null}
      {desktop ? (
        <div className="grid grid-cols-[280px_minmax(0,1fr)] items-start gap-[18px]">
          {nav}
          {table}
        </div>
      ) : (
        <>
          {table}
          {nav}
        </>
      )}

      <DocumentDialog
        key={editing ? (editing.mode === 'new' ? 'new' : `${editing.mode}:${editing.doc.id}`) : 'ferme'}
        editing={editing}
        categories={lib?.categories ?? []}
        onClose={() => setEditing(null)}
      />
      <CategoryDialog open={newCategory} onClose={() => setNewCategory(false)} />

      <ActionSheet open={!!menu} onClose={() => setMenu(null)} title={menu?.title ?? 'Document'}>
        {menu ? (
          <>
            {!menu.assembly_id || menu.file ? (
              <SheetAction icon={<RefreshCw className="size-5" />} onClick={() => (setEditing({ mode: 'version', doc: menu }), setMenu(null))}>
                Nouvelle version
              </SheetAction>
            ) : null}
            <SheetAction icon={<Pencil className="size-5" />} onClick={() => (setEditing({ mode: 'edit', doc: menu }), setMenu(null))}>
              Modifier le titre, la catégorie ou qui le voit
            </SheetAction>
            <SheetAction icon={<Download className="size-5" />} onClick={() => (downloadDocument(menu).catch(() => toast('Le téléchargement n’a pas pu commencer.', 'error')), setMenu(null))}>
              Télécharger
            </SheetAction>
            <SheetAction icon={<Trash2 className="size-5" />} danger onClick={() => (setDeleting(menu), setMenu(null))}>
              Supprimer
            </SheetAction>
          </>
        ) : null}
      </ActionSheet>

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Supprimer ce document ?"
        description={deleting ? `« ${deleting.title} » et ${deleting.versions && deleting.versions.length > 1 ? `ses ${deleting.versions.length} versions` : 'son fichier'} disparaissent pour tout le monde.` : undefined}
        footer={
          <>
            <Button variant="outline" size="md" className="flex-1" onClick={() => setDeleting(null)}>
              Garder
            </Button>
            <Button
              variant="danger"
              size="md"
              className="flex-1"
              busy={remove.isPending}
              icon={<Trash2 className="size-[18px]" />}
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => (setDeleting(null), toast('Document supprimé.')),
                  onError: (e) => toast(errorMessage(e), 'error'),
                })
              }
            >
              Supprimer
            </Button>
          </>
        }
      >
        <ErrorNote error={remove.error} />
      </Dialog>
    </BureauPage>
  )
}
