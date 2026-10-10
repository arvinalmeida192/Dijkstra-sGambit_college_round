import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type SectionHeaderProps = {
  eyebrow?: string
  title: string
  meta?: ReactNode
  tone?: 'light' | 'dark'
  className?: string
}

export function SectionHeader({
  eyebrow,
  title,
  meta,
  tone = 'light',
  className,
}: SectionHeaderProps) {
  const isDark = tone === 'dark'

  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-4 pb-6 border-b-2',
        isDark ? 'border-white/20' : 'border-dark',
        className,
      )}
    >
      <div>
        {eyebrow ? (
          <span
            className={cn(
              'font-mono text-xs font-bold tracking-widest uppercase block mb-2',
              isDark ? 'text-accent' : 'text-accent',
            )}
          >
            {eyebrow}
          </span>
        ) : null}
        <h2
          className={cn(
            'font-display font-black text-4xl md:text-5xl uppercase tracking-tighter',
            isDark ? 'text-white' : 'text-dark',
          )}
        >
          {title}
        </h2>
      </div>
      {meta ? (
        <div
          className={cn(
            'font-mono text-xs',
            isDark ? 'text-white/50' : 'text-dark/60',
          )}
        >
          {meta}
        </div>
      ) : null}
    </div>
  )
}
