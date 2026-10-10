import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type PanelProps = {
  tone?: 'base' | 'surface' | 'dark'
  shadow?: 'none' | 'sm' | 'lg'
  padding?: 'sm' | 'md' | 'lg'
  children: ReactNode
  className?: string
}

const toneClass = {
  base: 'bg-base text-dark border-dark',
  surface: 'bg-surface text-dark border-dark',
  dark: 'bg-dark text-base border-dark',
} as const

const shadowClass = {
  none: '',
  sm: 'shadow-[var(--shadow-brutal)]',
  lg: 'shadow-[var(--shadow-brutal-lg)]',
} as const

const paddingClass = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8 md:p-10',
} as const

export function Panel({
  tone = 'surface',
  shadow = 'none',
  padding = 'md',
  children,
  className,
}: PanelProps) {
  return (
    <div
      className={cn(
        'border-2',
        toneClass[tone],
        shadowClass[shadow],
        paddingClass[padding],
        className,
      )}
    >
      {children}
    </div>
  )
}
