import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ChevronLeft, Clock, Download, Eye, Folder, Globe, Lock, Share2, Users } from 'lucide-react'
import { Button, ButtonLink } from '../../components/Button'
import { docMeta, DocIcon } from '../../components/documents/DocParts'
import { ErrorNote, PageLoader, Spinner } from '../../components/Feedback'
import { useToast } from '../../components/Toast'
import { docKind, documentLink, documentUrl, downloadDocument, sizeLabel, useLibrary, type Doc } from '../../lib/documents'
import { longDate, shortDate } from '../../lib/format'
import { useIsDesktop } from '../../lib/media'

const SEEN_BY = {
  public: { icon: Globe, text: 'Visible aussi sur le site de l’AEGB' },
  tous: { icon: Users, text: 'Visible par tous les membres' },
  bureau: { icon: Lock, text: 'Visible par le bureau seulement' },
}

/** L'aperçu : l'image, ou le PDF dans la page sur ordinateur. Sur téléphone, le lecteur du téléphone fait mieux. */
function Preview({ d, desktop }: { d: Doc; desktop: boolean }) {
  const kind = docKind(d.file)
  const previewable = kind === 'IMG' || (kind === 'PDF' && desktop)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!previewable) return
    let alive = true
    let local: string | null = null
    documentLink(d)
      .then((link) => {
        if (link.local) local = link.url
        if (alive) setUrl(link.url)
      })
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
      if (local) URL.revokeObjectURL(local)
    }
  }, [d, previewable])

  if (!previewable) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[12px] bg-surface px-6 py-8 text-center shadow-[0_2px_4px_rgba(18,22,43,0.08),0_14px_34px_rgba(18,22,43,0.14)]">
        <DocIcon kind={kind} width={64} height={78} />
        <p className="m-0 text-[15px] font-bold">{d.title}</p>
        <p className="m-0 text-[13px] text-muted">{d.assembly_id && !d.file ? 'Le procès-verbal se fabrique quand tu l’ouvres.' : 'Ouvre-le pour le lire en entier.'}</p>
      </div>
    )
  }
  if (error) return <ErrorNote error="L’aperçu n’a pas pu s’ouvrir. Tu peux télécharger le document." />
  if (!url) {
    return (
      <div className="grid h-[420px] place-items-center rounded-[12px] bg-surface">
        <Spinner />
      </div>
    )
  }
  return kind === 'IMG' ? (
    <img src={url} alt={d.title} className="max-h-[70dvh] w-full rounded-[12px] bg-surface object-contain shadow-[0_2px_4px_rgba(18,22,43,0.08),0_14px_34px_rgba(18,22,43,0.14)]" />
  ) : (
    <iframe src={url} title={d.title} className="h-[72dvh] w-full rounded-[12px] border-0 bg-surface shadow-[0_2px_4px_rgba(18,22,43,0.08),0_14px_34px_rgba(18,22,43,0.14)]" />
  )
}

function Versions({ d }: { d: Doc }) {
  const toast = useToast()
  const old = (d.versions ?? []).slice(1)
  if (!old.length) return null
  return (
    <section className="flex flex-col gap-2 rounded-[12px] bg-surface px-4 py-3.5">
      <h2 className="m-0 flex items-center gap-1.5 text-[14px] font-extrabold">
        <Lock className="size-3.5" /> Anciennes versions, pour le bureau
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {old.map((v) => (
          <li key={v.id} className="flex items-center gap-3 border-t border-line-soft py-2 first:border-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold">{v.file_name}</span>
              <span className="block text-[12px] text-muted">
                {shortDate(v.created_at)} · {sizeLabel(v.size_bytes)}
                {v.created_by_name ? ` · ${v.created_by_name}` : ''}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Télécharger ${v.file_name}`}
              className="grid size-9 place-items-center rounded-full bg-surface-2 text-leppi"
              onClick={async () => {
                try {
                  window.open(await documentUrl(v.path, v.file_name), '_blank', 'noopener')
                } catch {
                  toast('Le téléchargement n’a pas pu commencer.', 'error')
                }
              }}
            >
              <Download className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Un document : l'aperçu, d'où il vient, et le bouton pour le télécharger. */
export function Document() {
  const { id } = useParams()
  const q = useLibrary()
  const desktop = useIsDesktop()
  const toast = useToast()
  const [busy, setBusy] = useState<'open' | 'down' | null>(null)
  if (q.isPending) return <PageLoader />
  const d = q.data?.documents.find((x) => x.id === id)
  if (!d) {
    return (
      <div className="flex flex-1 flex-col gap-4 bg-surface px-5 pt-[max(env(safe-area-inset-top),24px)] lg:mx-auto lg:my-10 lg:w-full lg:max-w-[560px] lg:flex-none lg:rounded-[12px] lg:pb-6">
        <ErrorNote error={q.error ?? 'Ce document n’existe plus, ou il est réservé au bureau.'} />
        <ButtonLink to="/app/documents" variant="outline">
          Retour aux documents
        </ButtonLink>
      </div>
    )
  }

  const seen = SEEN_BY[d.visibility]
  const download = async () => {
    setBusy('down')
    try {
      await downloadDocument(d)
    } catch {
      toast('Le téléchargement n’a pas pu commencer. Réessaie.', 'error')
    } finally {
      setBusy(null)
    }
  }
  const open = async () => {
    setBusy('open')
    // La fenêtre s'ouvre tout de suite : sinon le téléphone la bloque.
    const tab = window.open('', '_blank')
    try {
      const link = await documentLink(d)
      if (tab) tab.location.href = link.url
      else window.location.assign(link.url)
    } catch {
      tab?.close()
      toast('Le document n’a pas pu s’ouvrir. Réessaie.', 'error')
    } finally {
      setBusy(null)
    }
  }
  const share = () => {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: d.title, url }).catch(() => {})
    else navigator.clipboard?.writeText(url).then(() => toast('Lien copié : il faut être connecté pour l’ouvrir.'))
  }

  const meta = (
    <section className="flex flex-col gap-[9px] rounded-[12px] bg-surface px-4 py-3.5">
      <div className="flex items-center gap-3">
        <DocIcon kind={docKind(d.file)} width={34} height={42} />
        <span className="flex min-w-0 flex-col gap-px">
          <span className="text-[16px] font-extrabold">{d.title}</span>
          <span className="text-[13px] text-muted">{docMeta(d)}</span>
        </span>
      </div>
      <span className="h-px bg-line-soft" />
      <span className="flex items-center gap-2 text-[13px] text-ink">
        <Folder className="size-4 text-leppi" /> {d.category}
      </span>
      <span className="flex items-center gap-2 text-[13px] text-ink">
        <Clock className="size-4 text-leppi" /> Mis à jour le {longDate(d.updated_at)}
        {d.updated_by_name ? ` par ${d.updated_by_name}` : ''}
      </span>
      <span className="flex items-center gap-2 text-[13px] text-ink">
        <seen.icon className="size-4 text-leppi" /> {seen.text}
      </span>
    </section>
  )

  const actions = (
    <>
      <Button className="flex-1" busy={busy === 'down'} icon={<Download className="size-5" />} onClick={download}>
        Télécharger
      </Button>
      <Button variant="outline" busy={busy === 'open'} icon={<Eye className="size-5" />} onClick={open}>
        Ouvrir
      </Button>
    </>
  )

  if (desktop) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-10 py-8">
        <Link to="/app/documents" className="flex w-fit items-center gap-1.5 text-[14px] font-bold text-leppi no-underline">
          <ChevronLeft className="size-4" strokeWidth={2.4} /> Documents
        </Link>
        <div className="grid max-w-[1180px] grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
          <Preview d={d} desktop />
          <div className="flex flex-col gap-3">
            {meta}
            <div className="flex gap-2.5">{actions}</div>
            <Button variant="ghost" size="sm" icon={<Share2 className="size-4" />} onClick={share}>
              Partager le lien
            </Button>
            <Versions d={d} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-[#E9EBF2]">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line-soft bg-surface py-2 pr-3 pl-2 pt-[max(env(safe-area-inset-top),8px)]">
        <Link to="/app/documents" aria-label="Retour aux documents" className="grid size-11 place-items-center rounded-xl text-ink hover:bg-surface-2">
          <ChevronLeft className="size-6" strokeWidth={2.2} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="titre m-0 truncate text-[19px]">{d.title}</h1>
          <p className="m-0 truncate text-[13px] text-muted">{d.category}</p>
        </div>
        <button type="button" onClick={share} aria-label="Partager" className="grid size-[42px] place-items-center rounded-full bg-surface-2 text-ink">
          <Share2 className="size-[19px]" />
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-3.5 px-4 pt-[18px] pb-3">
        <Preview d={d} desktop={false} />
        {meta}
        <Versions d={d} />
      </div>
      <div className="sticky bottom-0 flex gap-2.5 border-t border-line-soft bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)]">{actions}</div>
    </div>
  )
}
