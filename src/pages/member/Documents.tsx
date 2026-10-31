import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ChevronLeft, Download, FileText, Folder } from 'lucide-react'
import { CATEGORY_ICONS, CATEGORY_TONES, docMeta, DocIcon } from '../../components/documents/DocParts'
import { EmptyState, ErrorNote, PageLoader } from '../../components/Feedback'
import { SearchField } from '../../components/Field'
import { BackLink } from '../../components/Hero'
import { Pill } from '../../components/Pill'
import { useToast } from '../../components/Toast'
import { docKind, downloadDocument, isNew, useLibrary, type Category, type Doc } from '../../lib/documents'
import { shortDate } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filterDocs(docs: Doc[], category: string | null, query: string): Doc[] {
  const q = normalize(query.trim())
  return docs.filter((d) => (!category || d.category_id === category) && (!q || normalize(`${d.title} ${d.category} ${d.file?.file_name ?? ''}`).includes(q)))
}

export function DownloadButton({ d, size = 38 }: { d: Doc; size?: number }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      aria-label={`Télécharger ${d.title}`}
      title="Télécharger"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await downloadDocument(d)
        } catch {
          toast('Le téléchargement n’a pas pu commencer. Réessaie.', 'error')
        } finally {
          setBusy(false)
        }
      }}
      className="grid shrink-0 place-items-center rounded-full bg-surface-2 text-leppi hover:bg-select disabled:opacity-50"
      style={{ width: size, height: size }}
    >
      <Download className="size-[17px]" strokeWidth={2.2} />
    </button>
  )
}

function DocRow({ d, showCategory = true }: { d: Doc; showCategory?: boolean }) {
  return (
    <li className="flex items-center gap-3 border-t border-line-soft px-3.5 py-[11px] first:border-0">
      <Link to={`/app/documents/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3 text-ink no-underline">
        <DocIcon kind={docKind(d.file)} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15px] font-bold">{d.title}</span>
          <span className="truncate text-[13px] text-muted">
            {isNew(d) ? <b className="text-[#163F93]">Nouveau · </b> : null}
            {showCategory ? `${d.category} · ` : `${docMeta(d)} · `}
            {shortDate(d.updated_at)}
          </span>
        </span>
      </Link>
      <DownloadButton d={d} />
    </li>
  )
}

function CategoryTile({ c, count, onClick }: { c: Category; count: number; onClick: () => void }) {
  const Icon = CATEGORY_ICONS[c.icon]
  return (
    <button type="button" onClick={onClick} className="flex flex-col gap-2.5 rounded-2xl bg-surface p-3 text-left text-ink shadow-[0_1px_2px_rgba(18,22,43,0.06),0_6px_18px_rgba(18,22,43,0.06)] hover:bg-surface-2">
      <span className={`grid size-9 place-items-center rounded-[11px] ${CATEGORY_TONES[c.icon]}`}>
        <Icon className="size-[19px]" strokeWidth={2.1} />
      </span>
      <span className="flex flex-col gap-px">
        <span className="text-[14px] leading-[1.2] font-extrabold">{c.name}</span>
        <span className="text-[12px] text-muted">
          {count} document{count > 1 ? 's' : ''}
        </span>
      </span>
    </button>
  )
}

/** La bibliothèque : statuts, procès-verbaux, guides et modèles, par catégorie. */
export function Documents() {
  const q = useLibrary()
  const desktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const category = params.get('categorie')
  const setCategory = (id: string | null) => setParams(id ? { categorie: id } : {}, { replace: true })

  const lib = q.data
  const docs = lib?.documents ?? []
  const shown = filterDocs(docs, category, query)
  const count = (id: string) => docs.filter((d) => d.category_id === id).length
  const current = lib?.categories.find((c) => c.id === category)

  if (q.isPending) return <PageLoader />

  if (desktop) {
    return (
      <div className="flex flex-1 flex-col gap-5 px-10 py-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="titre m-0 text-[34px]">Documents</h1>
            <p className="mt-1 mb-0 text-[15px] text-muted">Les textes, procès-verbaux et guides de l’AEGB. Un clic ouvre l’aperçu.</p>
          </div>
          <SearchField value={query} onChange={setQuery} placeholder="Chercher un document" label="Chercher un document" className="w-[360px]" />
        </div>
        <ErrorNote error={q.error} />
        <div className="grid max-w-[1180px] grid-cols-[260px_minmax(0,1fr)] items-start gap-[22px]">
          <nav aria-label="Catégories de documents" className="flex flex-col gap-0.5 rounded-[12px] bg-surface px-3.5 py-[18px]">
            <h2 className="titre m-0 mb-2 px-1 text-[18px]">Catégories</h2>
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
          </nav>
          <section className="rounded-[12px] bg-surface pt-4 pb-2">
            <div className="grid grid-cols-[minmax(0,1fr)_180px_120px_40px] gap-3.5 px-[18px] pb-2 text-[12px] font-extrabold tracking-[0.8px] text-muted uppercase">
              <span>Document</span>
              <span>Catégorie</span>
              <span>Ajouté le</span>
              <span />
            </div>
            {shown.length ? (
              <ul className="m-0 flex list-none flex-col p-0">
                {shown.map((d) => (
                  <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_180px_120px_40px] items-center gap-3.5 border-t border-line-soft px-[18px] py-[9px] first:border-0">
                    <Link to={`/app/documents/${d.id}`} className="flex min-w-0 items-center gap-3 text-ink no-underline hover:opacity-85">
                      <DocIcon kind={docKind(d.file)} width={32} height={40} />
                      <span className="flex min-w-0 flex-col gap-px">
                        <span className="flex items-center gap-2 text-[15px] font-bold">
                          <span className="truncate">{d.title}</span>
                          {isNew(d) ? <Pill tone="safran">Nouveau</Pill> : null}
                        </span>
                        <span className="text-[12px] text-muted">{docMeta(d)}</span>
                      </span>
                    </Link>
                    <span className="truncate text-[14px] text-ink">{d.category}</span>
                    <span className="text-[14px] text-muted">{shortDate(d.updated_at)}</span>
                    <DownloadButton d={d} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={query ? 'Aucun document ne correspond' : 'Aucun document pour l’instant'} icon={<FileText className="size-6" />}>
                {query ? 'Essaie un autre mot.' : 'Le bureau range ici les statuts, les procès-verbaux d’AG et les guides.'}
              </EmptyState>
            )}
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col bg-page">
      <header className="bg-tisse shrink-0 px-5 pt-[max(env(safe-area-inset-top),8px)] pb-10 text-white">
        <BackLink to="/app/menu" label="Retour au menu" />
        <div className="mt-2 flex flex-col gap-1">
          <h1 className="titre m-0 text-[30px] leading-[1.08]">Documents</h1>
          <p className="m-0 text-[14px] text-white/85">Les textes et guides de l’AEGB</p>
        </div>
      </header>
      <div className="relative -mt-6 flex flex-1 flex-col gap-3 rounded-t-[12px] bg-[#F8F9FC] px-4 pt-5 pb-6">
        <SearchField value={query} onChange={setQuery} placeholder="Chercher un document" label="Chercher un document" className="border-0 bg-[#F3F4F8]" />
        <ErrorNote error={q.error} />
        {current ? (
          <button type="button" onClick={() => setCategory(null)} className="flex w-fit items-center gap-1 text-[14px] font-bold text-leppi">
            <ChevronLeft className="size-4" strokeWidth={2.4} /> Toutes les catégories
          </button>
        ) : !query ? (
          <div className="grid grid-cols-2 gap-2.5">
            {(lib?.categories ?? [])
              .filter((c) => count(c.id) > 0)
              .map((c) => (
                <CategoryTile key={c.id} c={c} count={count(c.id)} onClick={() => setCategory(c.id)} />
              ))}
          </div>
        ) : null}
        <span className="mx-0.5 mt-1 -mb-1 text-[13px] font-extrabold tracking-[0.6px] text-muted uppercase">{current ? current.name : query ? 'Résultats' : 'Ajoutés récemment'}</span>
        {shown.length ? (
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[12px] bg-surface p-0 shadow-[0_1px_2px_rgba(18,22,43,0.06),0_6px_18px_rgba(18,22,43,0.06)]">
            {(current || query ? shown : shown.slice(0, 8)).map((d) => (
              <DocRow key={d.id} d={d} showCategory={!current} />
            ))}
          </ul>
        ) : (
          <div className="rounded-[12px] bg-surface">
            <EmptyState title={query ? 'Aucun document ne correspond' : 'Aucun document pour l’instant'} icon={<FileText className="size-6" />}>
              {query ? 'Essaie un autre mot.' : 'Le bureau range ici les statuts, les procès-verbaux d’AG et les guides.'}
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  )
}
