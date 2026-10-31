import { Link } from 'react-router'
import { ChevronRight, CircleDollarSign, FileText, Folder, Info, PenLine, Shield, Vote, type LucideIcon } from 'lucide-react'
import { docKind, sizeLabel, type CategoryIcon, type Doc, type DocKind } from '../../lib/documents'

const KIND_TONES: Record<DocKind, string> = {
  PDF: 'bg-danger-soft text-[#8A0C20]',
  DOC: 'bg-[#E7F1FB] text-[#1D4F86]',
  XLS: 'bg-ok-soft text-[#075C2C]',
  PPT: 'bg-safran-pale text-[#163F93]',
  IMG: 'bg-[#EFEDFF] text-[#3C2E8F]',
  TXT: 'bg-surface-2 text-muted',
}

/** La petite feuille au coin plié, avec le type du fichier. */
export function DocIcon({ kind, width = 38, height = 46 }: { kind: DocKind; width?: number; height?: number }) {
  return (
    <span className={`relative flex shrink-0 items-end justify-center overflow-hidden rounded-[7px] pb-1.5 text-[10px] font-extrabold tracking-[0.3px] ${KIND_TONES[kind]}`} style={{ width, height }} aria-hidden="true">
      <span className="absolute top-0 right-0 size-3 rounded-bl-[5px] bg-white/75" />
      {kind}
    </span>
  )
}

export const CATEGORY_ICONS: Record<CategoryIcon, LucideIcon> = {
  shield: Shield,
  vote: Vote,
  info: Info,
  euro: CircleDollarSign,
  pen: PenLine,
  folder: Folder,
}

export const CATEGORY_TONES: Record<CategoryIcon, string> = {
  shield: 'bg-select text-leppi',
  vote: 'bg-safran-pale text-[#163F93]',
  info: 'bg-ok-soft text-ok',
  euro: 'bg-[#E2F2F8] text-[#145A75]',
  pen: 'bg-[#F1E8FB] text-[#5B2D91]',
  folder: 'bg-surface-2 text-muted',
}

/** « PDF · 240 Ko », ou « PDF fabriqué à la demande » pour un procès-verbal. */
export function docMeta(d: Doc): string {
  if (d.assembly_id && !d.file) return 'PDF fabriqué à l’ouverture'
  if (!d.file) return 'Fichier à venir'
  return `${docKind(d.file)} · ${sizeLabel(d.file.size_bytes)}`
}

/** Le document annoncé dans une publication du bureau. */
export function FeedDocument({ id, docs }: { id: string; docs: Doc[] | undefined }) {
  const d = docs?.find((x) => x.id === id)
  if (!docs) return <div className="mx-4 mb-3 h-[70px] animate-pulse rounded-2xl bg-surface-2" />
  if (!d) return null
  return (
    <Link to={`/app/documents/${d.id}`} className="mx-4 mb-3 flex items-center gap-3 rounded-2xl border-[1.5px] border-line-soft p-3 text-ink no-underline hover:bg-surface-2">
      {d.file || d.assembly_id ? <DocIcon kind={docKind(d.file)} /> : <FileText className="size-8 text-muted" />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold">{d.title}</span>
        <span className="truncate text-[13px] text-muted">
          {d.category} · {docMeta(d)}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" />
    </Link>
  )
}
