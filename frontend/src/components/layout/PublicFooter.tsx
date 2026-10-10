import type { ReactNode } from 'react'
import { BrandMark } from '../ui/BrandMark'
import { PageContainer } from '../ui/PageContainer'
import { cn } from '../../lib/cn'

export type FooterColumn = {
  title: string
  links: Array<{ href: string; label: string }>
}

type PublicFooterProps = {
  columns?: FooterColumn[]
  children?: ReactNode
  className?: string
}

const currentYear = new Date().getFullYear()

export function PublicFooter({
  columns = [],
  children,
  className,
}: PublicFooterProps) {
  return (
    <footer
      className={cn(
        'bg-dark text-base pt-16 pb-10 border-t-2 border-dark',
        className,
      )}
    >
      <PageContainer variant="marketing">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-white/20">
          <div className="md:col-span-6">
            <BrandMark tone="dark" />
            <p className="mt-6 font-body text-sm text-white/60 max-w-md">
              Portable project protection for freelance agreements, evidence,
              disputes, and milestone payments.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title} className="md:col-span-2 font-mono text-xs space-y-3">
              <div className="text-white/40 uppercase tracking-widest font-bold mb-4">
                {col.title}
              </div>
              {col.links.map((link) => (
                <div key={link.href}>
                  <a href={link.href} className="hover:text-accent transition-colors">
                    {link.label}
                  </a>
                </div>
              ))}
            </div>
          ))}
          {children ? <div className="md:col-span-2">{children}</div> : null}
        </div>
        <div className="pt-8 font-mono text-xs text-white/50">
          © {currentYear} Fairwork. Hackathon demo — testnet / local
          chain only.
        </div>
      </PageContainer>
    </footer>
  )
}
