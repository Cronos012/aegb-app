/** Le logo de l'AEGB (phare, livre et drapeaux) dans un rond blanc, lisible sur tous les fonds. */
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo-rond.webp`}
      width={size}
      height={size}
      alt="Logo AEGB"
      className="shrink-0 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
      style={{ width: size, height: size }}
      draggable={false}
    />
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
