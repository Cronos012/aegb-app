import { useState } from 'react'

const URL_RE = /(https?:\/\/[^\s<]+)/g

/** Les liens deviennent cliquables ; tout le reste reste du texte. */
function linkify(text: string) {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part
    // Un point ou une parenthèse en fin de phrase ne fait pas partie du lien.
    const match = part.match(/^(.*?)([.,;:!?)\]]*)$/)
    const href = match?.[1] ?? part
    return (
      <span key={i}>
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">
          {href}
        </a>
        {match?.[2]}
      </span>
    )
  })
}

const LIMIT = 320

/** Un texte de publication : retours à la ligne gardés, « Voir plus » au-delà de quelques lignes. */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > LIMIT || text.split('\n').length > 7
  if (!long || open) return <p className={`m-0 break-words whitespace-pre-line ${className}`}>{linkify(text)}</p>

  let cut = text.split('\n').slice(0, 6).join('\n')
  if (cut.length > LIMIT - 40) cut = cut.slice(0, LIMIT - 40).replace(/\s+\S*$/, '')
  return (
    <p className={`m-0 break-words whitespace-pre-line ${className}`}>
      {linkify(cut)}…{' '}
      <button type="button" onClick={() => setOpen(true)} className="font-bold text-muted hover:underline">
        Voir plus
      </button>
    </p>
  )
}
