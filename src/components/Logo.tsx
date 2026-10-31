export function Logo({ size = 44, background = '#1A2352' }: { size?: number; background?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="Logo AEGB" className="shrink-0">
      <circle cx="100" cy="100" r="92" fill={background} />
      <circle cx="100" cy="100" r="84" fill="none" stroke="#CE1126" strokeWidth="14" strokeDasharray="168 360" transform="rotate(-86 100 100)" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="#FCD116" strokeWidth="14" strokeDasharray="168 360" transform="rotate(34 100 100)" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="#009460" strokeWidth="14" strokeDasharray="168 360" transform="rotate(154 100 100)" />
      <text x="100" y="117" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="50" fontWeight="800" fill="#FFFFFF">
        AEGB
      </text>
    </svg>
  )
}

export function Brand({ size = 44, label = 'AEGB', className = '' }: { size?: number; label?: string; className?: string }) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <Logo size={size} />
      <span className="titre text-[22px]">{label}</span>
    </span>
  )
}
