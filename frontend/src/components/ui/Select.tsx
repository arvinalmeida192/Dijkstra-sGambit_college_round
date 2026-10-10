import type { SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export type SelectOption = {
  value: string
  label: string
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  options: SelectOption[]
  error?: string
  hint?: string
}

export function Select({
  label,
  options,
  error,
  hint,
  id,
  className,
  disabled,
  ...rest
}: SelectProps) {
  const inputId = id ?? rest.name

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className="block font-mono text-xs font-bold uppercase text-dark mb-1"
      >
        {label}
      </label>
      <select
        id={inputId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        className={cn(
          'w-full p-3 bg-white border-2 font-mono text-xs',
          'focus:outline-none focus:border-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error ? 'border-status-danger' : 'border-dark',
          className,
        )}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p
          id={`${inputId}-error`}
          className="mt-1 font-mono text-[11px] text-status-danger"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1 font-mono text-[11px] text-dark/50">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
