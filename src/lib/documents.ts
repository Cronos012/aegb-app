import { useQuery } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { pvFileName, pvPdf } from './pvPdf'
import { useAction } from './queries'
import { supabase } from './supabase'

/* ----------------------------------------------------------------------------
   La bibliothèque de documents (lot 6). Les fichiers sont dans l'espace
   privé « documents », rangés par document : « <id du document>/<fichier> ».
---------------------------------------------------------------------------- */

export type Visibility = 'tous' | 'bureau' | 'public'
export type CategoryIcon = 'shield' | 'vote' | 'info' | 'euro' | 'pen' | 'folder'

export type Category = { id: string; name: string; icon: CategoryIcon; position: number }

export type DocFile = { id: string; path: string; file_name: string; mime: string; size_bytes: number; created_at: string; created_by_name?: string }

export type Doc = {
  id: string
  title: string
  category_id: string
  category: string
  visibility: Visibility
  /** Le procès-verbal d'une AG : l'appli le fabrique, il n'a pas de fichier. */
  assembly_id: string | null
  created_at: string
  updated_at: string
  updated_by_name: string | null
  file: DocFile | null
  /** Toutes les versions, la plus récente d'abord : pour le bureau seulement. */
  versions: DocFile[] | null
}

export type Library = { categories: Category[]; documents: Doc[]; can_edit: boolean; storage_used: number | null }

/** 50 Mo au plus par fichier : la limite de l'offre gratuite de Supabase. */
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024

export const ACCEPTED =
  '.pdf,.doc,.docx,.odt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.txt,.jpg,.jpeg,.png,.webp'

/** Ce que l'espace « documents » accepte (les mêmes types que la base). */
const MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export const VISIBILITY: Record<Visibility, { label: string; detail: string }> = {
  tous: { label: 'Tous les membres', detail: 'Dans l’onglet Documents de chaque membre.' },
  bureau: { label: 'Bureau seulement', detail: 'Les membres qui ont un poste au bureau.' },
  public: { label: 'Public', detail: 'Aussi sur le site de présentation de l’AEGB.' },
}

export function useLibrary(enabled = true) {
  const { session } = useSession()
  return useQuery({
    queryKey: ['documents', session?.user.id],
    enabled: enabled && !!session,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('documents_list')
      if (error) throw error
      return data as unknown as Library
    },
  })
}

export function usePublicDocuments() {
  return useQuery({
    queryKey: ['documents', 'public'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('public_documents')
      if (error) throw error
      return (data ?? []) as unknown as Doc[]
    },
  })
}

/* ----------------------------------------------------------------------------
   Fichiers
---------------------------------------------------------------------------- */

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}

/** Le type d'un fichier choisi, même quand le navigateur ne le donne pas. */
export function mimeOf(file: File): string | null {
  const ext = extensionOf(file.name)
  if (MIMES[ext]) return MIMES[ext]
  return Object.values(MIMES).includes(file.type) ? file.type : null
}

/** PDF, DOC, XLS, PPT ou IMG, pour la petite icône. */
export type DocKind = 'PDF' | 'DOC' | 'XLS' | 'PPT' | 'IMG' | 'TXT'

export function docKind(file: Pick<DocFile, 'mime' | 'file_name'> | null): DocKind {
  if (!file) return 'PDF'
  const m = file.mime
  if (m === 'application/pdf') return 'PDF'
  if (m.startsWith('image/')) return 'IMG'
  if (m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return 'XLS'
  if (m.includes('presentation') || m.includes('powerpoint')) return 'PPT'
  if (m === 'text/plain') return 'TXT'
  return 'DOC'
}

/** « 240 Ko », « 2,1 Mo » */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
  return `${(bytes / (1024 * 1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`
}

/** Un nom de fichier sans accents ni espaces, pour le chemin de stockage. */
function safeName(name: string): string {
  const ext = extensionOf(name)
  const base = name
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60)
  return `${base || 'document'}${ext ? `.${ext}` : ''}`
}

/** Envoie le fichier dans le dossier du document, avant de l'enregistrer : la base vérifie qu'il y est. */
export async function uploadDocument(docId: string, file: File): Promise<{ path: string; file_name: string }> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Ce fichier fait plus de 50 Mo : réduis-le (un PDF compressé, par exemple) puis réessaie.')
  const mime = mimeOf(file)
  if (!mime) throw new Error('Ce type de fichier n’est pas accepté. Envoie un PDF, un document Word ou LibreOffice, un tableur, une présentation ou une image.')
  const path = `${docId}/${Date.now()}-${safeName(file.name)}`
  const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: mime, upsert: false })
  if (error) throw error
  return { path, file_name: file.name }
}

export async function discardUpload(path: string) {
  await supabase.storage.from('documents').remove([path])
}

/** Un lien signé, valable une heure, pour lire ou télécharger le fichier. */
export async function documentUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 3600, download ? { download } : undefined)
  if (error) throw error
  return data.signedUrl
}

export function useDocumentUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['documents', 'lien', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: () => documentUrl(path!),
  })
}

/* ----------------------------------------------------------------------------
   Actions du bureau
---------------------------------------------------------------------------- */

const REFRESH = [['documents'], ['fil'], ['bureau']]

export function useDocumentActions() {
  return {
    save: useAction(
      (v: { id: string; category: string; title: string; visibility: Visibility; file: { path: string; file_name: string } | null; announce: boolean }) =>
        supabase.rpc('save_document', { p_id: v.id, p_category: v.category, p_title: v.title, p_visibility: v.visibility, p_file: v.file ?? undefined, p_announce: v.announce }),
      REFRESH,
    ),
    remove: useAction(async (id: string) => {
      const res = await supabase.rpc('delete_document', { p_id: id })
      // Les fichiers partent après la ligne : un échec laisse un fichier orphelin, sans gêner personne.
      if (!res.error && res.data?.length) await supabase.storage.from('documents').remove(res.data)
      return res
    }, REFRESH),
    saveCategory: useAction((v: { id: string | null; name: string }) => supabase.rpc('save_document_category', { p_id: v.id, p_name: v.name }), REFRESH),
    removeCategory: useAction((id: string) => supabase.rpc('delete_document_category', { p_id: id }), REFRESH),
  }
}

/** Le procès-verbal d'une AG, fabriqué à la demande comme dans l'onglet Votes. */
async function pvBlob(assemblyId: string): Promise<{ blob: Blob; name: string }> {
  const { data, error } = await supabase.rpc('assembly_view', { p_id: assemblyId })
  if (error) throw error
  if (!data) throw new Error('Cette assemblée générale est introuvable.')
  const a = data as unknown as Parameters<typeof pvPdf>[0]
  return { blob: await pvPdf(a), name: pvFileName(a) }
}

/** Un lien vers le fichier du document (ou le PV fabriqué), pour l'ouvrir ou le télécharger. */
export async function documentLink(d: Doc, download = false): Promise<{ url: string; name: string; local: boolean }> {
  if (!d.file && d.assembly_id) {
    const { blob, name } = await pvBlob(d.assembly_id)
    return { url: URL.createObjectURL(blob), name, local: true }
  }
  if (!d.file) throw new Error('Ce document n’a pas encore de fichier.')
  return { url: await documentUrl(d.file.path, download ? d.file.file_name : undefined), name: d.file.file_name, local: false }
}

export async function downloadDocument(d: Doc) {
  const link = await documentLink(d, true)
  const a = document.createElement('a')
  a.href = link.url
  a.download = link.name
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  if (link.local) setTimeout(() => URL.revokeObjectURL(link.url), 2000)
}

/** Ajouté il y a moins de deux semaines. */
export function isNew(d: Pick<Doc, 'updated_at'>, now = Date.now()): boolean {
  return now - new Date(d.updated_at).getTime() < 14 * 86_400_000
}
