import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-2 border-dashed border-dark/30 bg-surface p-10 text-center',
        className,
      )}
    >
      <h3 className="font-display font-bold text-xl uppercase tracking-tight text-dark">
        {title}
      </h3>
      {description ? (
        <p className="mt-2 font-body text-sm text-dark/70 max-w-md mx-auto">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  )
}
