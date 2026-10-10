import { Link, useSearchParams } from 'react-router-dom'
import { PublicFooter } from '../components/layout/PublicFooter'
import { PublicHeader } from '../components/layout/PublicHeader'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { PageContainer } from '../components/ui/PageContainer'
import { routes } from '../lib/routes'
import { DisputeSection } from './landing/DisputeSection'
import { FeaturesSection } from './landing/FeaturesSection'
import { FinalCtaSection } from './landing/FinalCtaSection'
import { HeroSection } from './landing/HeroSection'
import { HowItWorksSection } from './landing/HowItWorksSection'
import { ProblemSection } from './landing/ProblemSection'

const navLinks = [
  { href: '#the-problem', label: 'The Problem', index: '01' },
  { href: '#how-it-works', label: 'Workflow', index: '02' },
  { href: '#features', label: 'Features', index: '03' },
  { href: '#dispute-flow', label: 'Disputes', index: '04' },
]

export function HomePage() {
  const [params] = useSearchParams()
  const invite = params.get('invite')?.trim()

  return (
    <div className="min-h-screen bg-base flex flex-col">
      <PublicHeader
        links={navLinks}
        primaryAction={
          <div className="flex items-center gap-2">
            <Link to={routes.login}>
              <Button variant="ghost" size="sm">
                Login
              </Button>
            </Link>
            <Link
              to={
                invite
                  ? routes.invite(invite)
                  : routes.register
              }
            >
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        }
      />

      {invite ? (
        <PageContainer variant="marketing" className="pt-4">
          <Alert tone="info">
            You have a project invitation.{' '}
            <Link
              to={routes.invite(invite)}
              className="font-bold text-accent hover:underline"
            >
              Review and accept it here
            </Link>
            .
          </Alert>
        </PageContainer>
      ) : null}

      <HeroSection />
      <ProblemSection />
      <HowItWorksSection />
      <FeaturesSection />
      <DisputeSection />
      <FinalCtaSection />

      <PublicFooter
        columns={[
          {
            title: 'Product',
            links: [
              { href: '#how-it-works', label: 'Workflow' },
              { href: '#features', label: 'Features' },
              { href: '#dispute-flow', label: 'Disputes' },
            ],
          },
          {
            title: 'Account',
            links: [
              { href: routes.login, label: 'Login' },
              { href: routes.register, label: 'Register' },
              { href: routes.dashboard, label: 'Dashboard' },
            ],
          },
          {
            title: 'Dev',
            links: [{ href: routes.uiDemo, label: 'UI Kit' }],
          },
        ]}
      />
    </div>
  )
}
