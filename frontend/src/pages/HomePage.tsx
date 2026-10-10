import { Link } from 'react-router-dom'
import { PublicFooter } from '../components/layout/PublicFooter'
import { PublicHeader } from '../components/layout/PublicHeader'
import { Button } from '../components/ui/Button'
import { PageContainer } from '../components/ui/PageContainer'
import { Panel } from '../components/ui/Panel'
import { routes } from '../lib/routes'

export function HomePage() {
  return (
    <div
      className="min-h-screen bg-base flex flex-col"
      style={{
        backgroundImage:
          'linear-gradient(to right, rgba(11,11,11,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,11,11,0.05) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <PublicHeader
        links={[
          { href: routes.dashboard, label: 'Dashboard', index: '01' },
          { href: routes.projects, label: 'Projects', index: '02' },
          { href: routes.uiDemo, label: 'UI Kit', index: '03' },
        ]}
        primaryAction={
          <div className="flex items-center gap-2">
            <Link to={routes.login}>
              <Button variant="ghost" size="sm">
                Login
              </Button>
            </Link>
            <Link to={routes.register}>
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        }
      />

      <PageContainer variant="marketing" className="py-16 flex-1">
        <Panel tone="surface" shadow="lg" padding="lg" className="max-w-3xl">
          <p className="font-mono text-xs font-bold text-accent uppercase tracking-widest">
            Fairwork // Phase 05 shell
          </p>
          <h1 className="mt-4 font-display font-black text-5xl md:text-6xl uppercase tracking-tighter text-dark leading-[0.9]">
            Get Paid <span className="text-accent">For What</span> You Deliver
          </h1>
          <p className="mt-6 font-body text-dark/70 max-w-xl">
            App shell and approved routes are wired. Landing and auth screens
            are filled in Phase 06; these links verify navigation now.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={routes.dashboard}>
              <Button>Open dashboard</Button>
            </Link>
            <Link to={routes.project('demo')}>
              <Button variant="secondary">Demo project</Button>
            </Link>
            <Link to={routes.uiDemo}>
              <Button variant="ghost">UI demo</Button>
            </Link>
          </div>
        </Panel>
      </PageContainer>

      <PublicFooter
        columns={[
          {
            title: 'App',
            links: [
              { href: routes.dashboard, label: 'Dashboard' },
              { href: routes.projects, label: 'Projects' },
              { href: routes.login, label: 'Login' },
              { href: routes.register, label: 'Register' },
            ],
          },
        ]}
      />
    </div>
  )
}
