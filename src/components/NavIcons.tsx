/*
  Icônes pleines de la navigation, façon réseau social : en couleur dans la
  barre latérale et le menu, d'une seule couleur (celle du texte) dans la
  barre du bas. Les découpes prennent la couleur du fond pour suivre le mode sombre.
*/

export type NavIconName = 'accueil' | 'messages' | 'evenements' | 'cotisation' | 'votes' | 'documents' | 'membres' | 'profil' | 'bureau'

type Props = { name: NavIconName; size?: number; mono?: boolean; className?: string }

const CUT = 'var(--color-surface)'

export function NavIcon({ name, size = 28, mono = false, className = '' }: Props) {
  const c = (color: string) => (mono ? 'currentColor' : color)
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, className: `shrink-0 ${className}` }
  switch (name) {
    case 'accueil':
      return (
        <svg {...common}>
          <path d="M12 2.6l9.6 8.4h-2.4v9.5a1 1 0 0 1-1 1h-4.4v-6.2h-3.6v6.2H5.8a1 1 0 0 1-1-1V11H2.4z" fill={c('#1B4DB1')} />
        </svg>
      )
    case 'messages':
      return (
        <svg {...common}>
          <path d="M12 2.5C6.5 2.5 2 6.4 2 11.3c0 2.6 1.3 4.9 3.4 6.5L4.9 22l4-2.1c1 .3 2 .4 3.1.4 5.5 0 10-3.9 10-8.8S17.5 2.5 12 2.5z" fill={c('#0A7CFF')} />
          {mono ? null : <path d="M6.5 13.5l3.6-3.8 2.3 2.2 3.2-2.2-3.6 3.8-2.3-2.2z" fill="#FFFFFF" />}
        </svg>
      )
    case 'evenements':
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="19" height="17.5" rx="3" fill={c('#F3425F')} />
          <rect x="4.5" y="9" width="15" height="10.5" rx="1.2" fill={mono ? CUT : '#FFFFFF'} />
          <rect x="7" y="2" width="2.2" height="4.5" rx="1.1" fill={c('#C21D3A')} />
          <rect x="14.8" y="2" width="2.2" height="4.5" rx="1.1" fill={c('#C21D3A')} />
          <rect x="7" y="11.5" width="3" height="2.5" rx=".6" fill={c('#F3425F')} />
          <rect x="11" y="11.5" width="3" height="2.5" rx=".6" fill={c('#F7A1AF')} opacity={mono ? 0.5 : 1} />
          <rect x="7" y="15" width="3" height="2.5" rx=".6" fill={c('#F7A1AF')} opacity={mono ? 0.5 : 1} />
        </svg>
      )
    case 'cotisation':
      return (
        <svg {...common}>
          <rect x="2" y="4.5" width="20" height="15" rx="2.6" fill={c('#2E9E57')} />
          <rect x="2" y="8.2" width="20" height="2.6" fill={mono ? CUT : '#1B6E3A'} />
          <rect x="5" y="14" width="6" height="2.2" rx="1.1" fill={mono ? CUT : '#FFFFFF'} />
          {mono ? null : <circle cx="17.5" cy="15.1" r="1.6" fill="#FCD116" />}
        </svg>
      )
    case 'votes':
      return (
        <svg {...common}>
          <rect x="7" y="2.5" width="10" height="12" rx="1.5" fill={mono ? CUT : '#FFFFFF'} stroke={c('#F7B928')} strokeWidth="1.4" />
          <path d="M9.4 8.4l1.8 1.8 3.4-3.6" fill="none" stroke={c('#E58A00')} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 12.5h18v7.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z" fill={c('#F7B928')} />
          <rect x="8.5" y="12.5" width="7" height="1.6" rx=".8" fill={mono ? CUT : '#B36B00'} />
        </svg>
      )
    case 'documents':
      return (
        <svg {...common}>
          <path d="M2.5 6.5A2.5 2.5 0 0 1 5 4h4.3l2.2 2.5H19A2.5 2.5 0 0 1 21.5 9v1H2.5z" fill={c('#8C5BD6')} />
          <path d="M2.5 9.5h19v9A2.5 2.5 0 0 1 19 21H5a2.5 2.5 0 0 1-2.5-2.5z" fill={c('#A97DEB')} />
        </svg>
      )
    case 'membres':
      return (
        <svg {...common}>
          <circle cx="16.5" cy="8.5" r="3" fill={c('#7FCFE6')} opacity={mono ? 0.6 : 1} />
          <path d="M13.5 20.5c0-3.4 1.4-6 4.3-6 2.6 0 4.2 2.3 4.2 5.2 0 .5-.3.8-.8.8z" fill={c('#7FCFE6')} opacity={mono ? 0.6 : 1} />
          <circle cx="9" cy="7.8" r="3.8" fill={c('#1EA2C8')} />
          <path d="M2 20.3c0-4 3.1-6.8 7-6.8s7 2.8 7 6.8a.9.9 0 0 1-.9.9H2.9a.9.9 0 0 1-.9-.9z" fill={c('#1EA2C8')} />
        </svg>
      )
    case 'profil':
      return (
        <svg {...common}>
          <circle cx="12" cy="7.8" r="4.3" fill={c('#1B4DB1')} />
          <path d="M3.5 21c0-4.5 3.8-7.6 8.5-7.6s8.5 3.1 8.5 7.6a.9.9 0 0 1-.9.9H4.4a.9.9 0 0 1-.9-.9z" fill={c('#1B4DB1')} />
        </svg>
      )
    case 'bureau':
      return (
        <svg {...common}>
          <path d="M9 7V5.6A1.6 1.6 0 0 1 10.6 4h2.8A1.6 1.6 0 0 1 15 5.6V7" fill="none" stroke={c('#5B4A3A')} strokeWidth="2" />
          <path d="M3 9.5A2.5 2.5 0 0 1 5.5 7h13A2.5 2.5 0 0 1 21 9.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5z" fill={c('#9C7A55')} />
          <rect x="3" y="12" width="18" height="1.6" fill={mono ? CUT : '#7A5C3E'} />
          {mono ? null : <rect x="10.5" y="11" width="3" height="3.6" rx=".8" fill="#FCD116" />}
        </svg>
      )
  }
}
