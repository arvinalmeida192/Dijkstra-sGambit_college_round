import { cn } from '../../lib/cn'

type SpinnerProps = {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClass = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-10 h-10 border-[3px]',
} as const

export function Spinner({
  label = 'Loading',
  size = 'md',
  className,
}: SpinnerProps) {
  return (
    <span
      role="status"
      className={cn('inline-flex items-center gap-3', className)}
    >
      <span
        className={cn(
          sizeClass[size],
          'border-dark border-t-accent animate-spin',
        )}
        aria-hidden
      />
      <span className="font-mono text-xs uppercase tracking-wider text-dark/70">
        {label}
      </span>
    </span>
  )
}

type LoadingBlockProps = {
  label?: string
  className?: string
}

export function LoadingBlock({
  label = 'Loading',
  className,
}: LoadingBlockProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center border-2 border-dashed border-dark/30 bg-surface p-10',
        className,
      )}
    >
      <Spinner label={label} />
    </div>
  )
}
