import { cn } from '../../lib/cn'

export type SegmentOption = {
  value: string
  label: string
}

type SegmentedControlProps = {
  options: SegmentOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  disabled?: boolean
}

export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  disabled = false,
}: SegmentedControlProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'grid p-1 bg-surface border-2 border-dark font-mono text-xs font-bold',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'py-2 uppercase text-center transition-all',
              selected ? 'bg-dark text-white' : 'text-dark/60 hover:text-dark',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
