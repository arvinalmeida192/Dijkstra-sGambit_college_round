import { cn } from '../../lib/cn'

type BrandMarkProps = {
  size?: 'sm' | 'md'
  showWordmark?: boolean
  tone?: 'light' | 'dark'
  className?: string
}

const sizeMap = {
  sm: { box: 'w-5 h-5', inner: 'w-2 h-2', text: 'text-xl' },
  md: { box: 'w-6 h-6', inner: 'w-2 h-2', text: 'text-2xl' },
} as const

export function BrandMark({
  size = 'md',
  showWordmark = true,
  tone = 'light',
  className,
}: BrandMarkProps) {
  const s = sizeMap[size]
  const wordmarkClass = tone === 'dark' ? 'text-white' : 'text-dark'

  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <span
        className={cn(
          s.box,
          'bg-accent border-2 border-dark flex items-center justify-center shrink-0',
        )}
        aria-hidden
      >
        <span className={cn(s.inner, tone === 'dark' ? 'bg-white' : 'bg-dark')} />
      </span>
      {showWordmark ? (
        <span
          className={cn(
            'font-display font-extrabold tracking-tighter uppercase',
            s.text,
            wordmarkClass,
          )}
        >
          Fairwork
        </span>
      ) : (
        <span className="sr-only">Fairwork</span>
      )}
    </span>
  )
}
