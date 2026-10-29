import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** Le style des champs, sans la hauteur : chaque champ choisit la sienne. */
export const inputBase =
  'w-full min-w-0 rounded-[14px] border-[1.5px] border-line bg-surface px-4 text-base text-ink placeholder:text-muted/70 ' +
  'outline-none transition focus:border-primary focus:ring-[3px] focus:ring-safran/45 aria-invalid:border-danger disabled:bg-surface-2 disabled:text-muted'

export const inputClass = `${inputBase} h-[52px]`

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: ReactNode
  error?: string | null
  labelRight?: ReactNode
}

export function TextField({ label, hint, error, labelRight, id, className = '', ...rest }: FieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <div className={`flex min-w-0 flex-col gap-[7px] ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="text-sm font-bold">
          {label}
        </label>
        {labelRight}
      </div>
      <input id={fieldId} className={inputClass} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${fieldId}-aide` : undefined} {...rest} />
      {error ? (
        <p id={`${fieldId}-aide`} className="m-0 text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-aide`} className="m-0 flex items-center gap-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function PasswordField({ label, hint, error, labelRight, id, className = '', ...rest }: FieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  const [visible, setVisible] = useState(false)
  return (
    <div className={`flex min-w-0 flex-col gap-[7px] ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="text-sm font-bold">
          {label}
        </label>
        {labelRight}
      </div>
      <div className="relative">
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          className={`${inputClass} pr-[52px]`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-aide` : undefined}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="absolute top-1 right-1 grid size-11 place-items-center rounded-[10px] text-muted hover:text-ink"
        >
          {visible ? <EyeOff className="size-[22px]" strokeWidth={1.9} /> : <Eye className="size-[22px]" strokeWidth={1.9} />}
        </button>
      </div>
      {error ? (
        <p id={`${fieldId}-aide`} className="m-0 text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : hint ? (
        <div id={`${fieldId}-aide`}>{hint}</div>
      ) : null}
    </div>
  )
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  counter?: boolean
  error?: string | null
}

export function TextArea({ label, counter, error, id, className = '', maxLength, value, ...rest }: AreaProps) {
  const auto = useId()
  const fieldId = id ?? auto
  const length = typeof value === 'string' ? value.length : 0
  return (
    <div className={`flex min-w-0 flex-col gap-[7px] ${className}`}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={fieldId} className="text-sm font-bold">
          {label}
        </label>
        {counter && maxLength ? (
          <span className="text-[13px] text-muted tabular-nums" aria-live="polite">
            {length} / {maxLength}
          </span>
        ) : null}
      </div>
      <textarea
        id={fieldId}
        maxLength={maxLength}
        value={value}
        className={`${inputBase} min-h-[104px] resize-y py-3 leading-[1.45]`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {error ? <p className="m-0 text-[13px] font-semibold text-danger">{error}</p> : null}
    </div>
  )
}

export function SearchField({ value, onChange, placeholder, className = '', label = 'Rechercher' }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string; label?: string }) {
  return (
    <label className={`flex h-12 min-w-0 items-center gap-2.5 rounded-[14px] border-[1.5px] border-line bg-surface px-3.5 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-safran/45 ${className}`}>
      <svg className="size-5 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
      </svg>
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
      />
    </label>
  )
}
