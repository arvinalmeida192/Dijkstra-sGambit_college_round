import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type AlertTone = 'info' | 'success' | 'warning' | 'danger'

type AlertProps = {
  tone?: AlertTone
  children: ReactNode
  role?: 'status' | 'alert'
  className?: string
}

const toneClass: Record<AlertTone, string> = {
  info: 'bg-dark/5 border-dark text-dark',
  success: 'bg-status-success/20 border-status-success text-dark',
  warning: 'bg-status-warning/20 border-status-warning text-dark',
  danger: 'bg-status-danger/20 border-status-danger text-dark',
}

export function Alert({
  tone = 'info',
  children,
  role = 'status',
  className,
}: AlertProps) {
  return (
    <div
      role={role}
      className={cn(
        'p-3 border-2 font-mono text-xs',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </div>
  )
}
