import type { ReactNode } from 'react'
import type { BadgeTone } from '../../lib/milestoneStatus'
import { cn } from '../../lib/cn'

type BadgeProps = {
  tone?: BadgeTone
  dot?: boolean
  children: ReactNode
  className?: string
}

const toneClass: Record<BadgeTone, string> = {
  neutral: 'bg-dark/10 text-dark border-dark/30',
  accent: 'bg-accent/15 text-dark border-accent',
  success: 'bg-status-success/20 text-dark border-status-success',
  warning: 'bg-status-warning/20 text-dark border-status-warning',
  danger: 'bg-status-danger/20 text-dark border-status-danger',
}

const dotClass: Record<BadgeTone, string> = {
  neutral: 'bg-dark/50',
  accent: 'bg-accent',
  success: 'bg-status-success',
  warning: 'bg-status-warning',
  danger: 'bg-status-danger',
}

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-bold uppercase border',
        toneClass[tone],
        className,
      )}
    >
      {dot ? (
        <span className={cn('w-1.5 h-1.5 shrink-0', dotClass[tone])} aria-hidden />
      ) : null}
      {children}
    </span>
  )
}
