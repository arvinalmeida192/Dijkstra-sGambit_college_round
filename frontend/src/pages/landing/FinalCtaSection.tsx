import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { PageContainer } from '../../components/ui/PageContainer'
import { routes } from '../../lib/routes'

export function FinalCtaSection() {
  return (
    <section id="join" className="py-24 bg-dark text-base border-b-2 border-dark">
      <PageContainer variant="marketing" className="text-center">
        <p className="font-mono text-xs font-bold text-accent uppercase tracking-widest mb-4">
          // Ready when you are
        </p>
        <h2 className="font-display font-black text-4xl md:text-6xl uppercase tracking-tighter max-w-4xl mx-auto leading-[0.95]">
          Build agreements both sides can trust
        </h2>
        <p className="mt-6 font-body text-lg text-white/70 max-w-2xl mx-auto">
          Create an account as a client or freelancer, or join a project through an
          invitation link. Escrow demos stay on testnet / local chain.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link to={routes.register}>
            <Button size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
              Create account
            </Button>
          </Link>
          <Link to={routes.login}>
            <Button
              size="lg"
              variant="secondary"
              className="!bg-transparent !text-white hover:!bg-white hover:!text-dark"
            >
              Sign in
            </Button>
          </Link>
        </div>
      </PageContainer>
    </section>
  )
}
