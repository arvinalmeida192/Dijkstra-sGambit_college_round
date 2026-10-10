import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { PageContainer } from '../ui/PageContainer'
import { cn } from '../../lib/cn'

export type PublicNavLink = {
  href: string
  label: string
  index?: string
}

type PublicHeaderProps = {
  links?: PublicNavLink[]
  onLogin?: () => void
  primaryAction?: ReactNode
  className?: string
}

export function PublicHeader({
  links = [],
  onLogin,
  primaryAction,
  className,
}: PublicHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 bg-base/90 backdrop-blur-md border-b-2 border-dark',
        className,
      )}
    >
      <PageContainer
        variant="marketing"
        className="h-16 flex items-center justify-between"
      >
        <Link to="/" className="shrink-0">
          <BrandMark />
        </Link>

        {links.length > 0 ? (
          <nav className="hidden md:flex items-center gap-8 font-mono text-xs uppercase tracking-wider font-semibold">
            {links.map((link) => {
              const className =
                'hover:text-accent transition-colors flex items-center gap-1'
              const content = (
                <>
                  {link.index ? (
                    <span className="text-dark/40">{link.index}/</span>
                  ) : null}
                  {link.label}
                </>
              )
              const isInternal = link.href.startsWith('/')
              return isInternal ? (
                <Link key={link.href} to={link.href} className={className}>
                  {content}
                </Link>
              ) : (
                <a key={link.href} href={link.href} className={className}>
                  {content}
                </a>
              )
            })}
          </nav>
        ) : null}

        <div className="flex items-center gap-3">
          {onLogin ? (
            <Button variant="ghost" size="sm" onClick={onLogin}>
              Login / Portal
            </Button>
          ) : null}
          {primaryAction}
        </div>
      </PageContainer>
    </header>
  )
}
