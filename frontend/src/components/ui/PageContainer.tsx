import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'marketing' | 'app'
  children: ReactNode
}

export function PageContainer({
  variant = 'app',
  children,
  className,
  ...rest
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 md:px-8',
        variant === 'marketing' ? 'max-w-[1720px]' : 'max-w-[1200px]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
