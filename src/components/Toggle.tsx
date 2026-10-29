/** Un interrupteur avec son titre et une ligne d'explication. */
export function Toggle({ checked, onChange, title, detail, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; title: string; detail: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded-2xl bg-surface-2 px-4 py-3.5 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-[13px] text-muted">{detail}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className={`relative h-8 w-[52px] shrink-0 rounded-full transition peer-focus-visible:ring-[3px] peer-focus-visible:ring-safran/60 ${checked ? 'bg-primary' : 'bg-line'}`} aria-hidden="true">
        <span className={`absolute top-1 size-6 rounded-full bg-surface shadow transition-all ${checked ? 'left-[24px]' : 'left-1'}`} />
      </span>
    </label>
  )
}
