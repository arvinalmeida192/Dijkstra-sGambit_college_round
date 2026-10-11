import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../ui/BrandMark'
import { PageContainer } from '../ui/PageContainer'
import { routes } from '../../lib/routes'

type AuthLayoutProps = {
  title: string
  subtitle: string
  children: ReactNode
  aside?: ReactNode
}

export function AuthLayout({ title, subtitle, children, aside }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-base flex flex-col">
      <header className="border-b-2 border-dark bg-base/90 backdrop-blur-md">
        <PageContainer
          variant="marketing"
          className="h-14 flex items-center justify-between"
        >
          <Link to={routes.home}>
            <BrandMark size="sm" />
          </Link>
          <Link
            to={routes.home}
            className="font-mono text-xs font-bold uppercase tracking-wider text-dark/60 hover:text-accent"
          >
            ← Back to home
          </Link>
        </PageContainer>
      </header>

      <main className="flex-1 flex items-center py-10 px-4">
        <PageContainer variant="app" className="w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 border-2 border-dark shadow-[var(--shadow-brutal-lg)] overflow-hidden bg-base">
            <div className="lg:col-span-7 p-8 md:p-12 flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <span className="w-5 h-5 bg-accent border-2 border-dark" aria-hidden />
                <span className="font-display font-extrabold text-xl uppercase tracking-tighter">
                  Fairwork Portal // Auth
                </span>
              </div>
              <h1 className="font-display font-black text-3xl md:text-4xl uppercase tracking-tight text-dark mb-2">
                {title}
              </h1>
              <p className="font-mono text-xs text-dark/70 mb-8">{subtitle}</p>
              {children}
            </div>

            <aside className="lg:col-span-5 bg-accent p-8 md:p-12 border-t-2 lg:border-t-0 lg:border-l-2 border-dark text-white flex flex-col justify-between min-h-[280px]">
              {aside ?? (
                <>
                  <div>
                    <span className="font-mono text-xs font-bold uppercase tracking-widest text-white/80 block mb-3">
                      // Project protection
                    </span>
                    <h2 className="font-display font-black text-3xl uppercase leading-none tracking-tight mb-4">
                      Agree. Track. Resolve.
                    </h2>
                    <p className="font-body text-sm text-white/90 leading-relaxed">
                      Fairwork protects freelance milestones with clear agreements,
                      evidence trails, and authorized dispute resolution — demo on
                      testnet / local chain only.
                    </p>
                  </div>
                  <div className="mt-8 font-mono text-[10px] text-white/70 flex items-center justify-between gap-4">
                    <span>EMAIL / PASSWORD MVP</span>
                    <span>PHASE 06 UI</span>
                  </div>
                </>
              )}
            </aside>
          </div>
        </PageContainer>
      </main>
    </div>
  )
}
