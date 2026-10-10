import { Link } from 'react-router-dom'
import { ArrowUpRight, Play, ShieldCheck } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { MilestoneStatusBadge } from '../../components/ui/MilestoneStatusBadge'
import { PageContainer } from '../../components/ui/PageContainer'
import { Panel } from '../../components/ui/Panel'
import { routes } from '../../lib/routes'

const techGridStyle = {
  backgroundImage:
    'linear-gradient(to right, rgba(11,11,11,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,11,11,0.05) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
} as const

export function HeroSection() {
  return (
    <section id="hero" className="relative pt-6 pb-16" style={techGridStyle}>
      <PageContainer variant="marketing">
        <Panel
          tone="surface"
          shadow="lg"
          padding="lg"
          className="rounded-2xl md:rounded-3xl overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between pb-8 border-b-2 border-dark/15 mb-10 gap-4 font-mono text-xs">
            <div className="flex items-center gap-4">
              <span className="px-2.5 py-1 bg-dark text-white font-bold">
                AGREEMENTS / 2026
              </span>
              <span className="text-dark/60 tracking-wider">
                PROJECT PROTECTION // MILESTONE ESCROW
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Badge tone="success" dot>
                Demo sample
              </Badge>
              <span className="font-bold text-accent">[INDEX 01/05]</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-accent uppercase mb-4 tracking-widest">
                <span className="w-2 h-2 bg-accent" aria-hidden />
                Portable freelance project protection
              </div>

              <h1 className="font-display font-black text-5xl sm:text-7xl md:text-8xl leading-[0.88] uppercase tracking-tighter text-dark mb-8">
                <span className="block">Get Paid</span>
                <span className="block text-accent">For What</span>
                <span className="block">You Deliver</span>
              </h1>

              <p className="font-body text-base md:text-xl text-dark/80 max-w-xl mb-10 leading-relaxed">
                Fairwork helps clients and freelancers agree on milestones, track
                deliverables, review advisory AI insights, resolve disputes with an
                authorized reviewer, and see payment status — without replacing your
                existing freelance platform.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Link to={routes.register}>
                  <Button size="lg" rightIcon={<ArrowUpRight className="w-5 h-5" />}>
                    Start an Agreement
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button variant="secondary" size="lg" leftIcon={<Play className="w-4 h-4" />}>
                    See how it works
                  </Button>
                </a>
              </div>

              <div className="mt-12 pt-8 border-t border-dark/15 flex flex-wrap items-center gap-8 font-mono text-[11px] text-dark/60">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-status-success" aria-hidden />
                  <span>MILESTONE AGREEMENTS</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-accent" aria-hidden />
                  <span>EVIDENCE + DISPUTES</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tracking-widest text-dark">
                    ||| | || |||| | | |||
                  </span>
                  <span>TESTNET / LOCAL DEMO</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <Panel tone="base" shadow="sm" padding="md" className="relative">
                <div className="flex items-center justify-between pb-4 border-b-2 border-dark mb-5 font-mono text-xs">
                  <span className="font-bold uppercase tracking-wider">
                    Live Agreement Sample
                  </span>
                  <span className="text-accent font-bold">#FW-9021</span>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-white border-2 border-dark">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-dark/50 font-bold">
                        M1 // FOUNDATION
                      </span>
                      <MilestoneStatusBadge status="APPROVED" />
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display font-bold text-lg text-dark">
                        System Architecture v1.0
                      </h3>
                      <span className="font-mono font-bold text-lg text-dark shrink-0">
                        $4,500
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-mono text-dark/60 flex items-center justify-between pt-2 border-t border-dark/10">
                      <span>Approved by client</span>
                      <span className="text-status-success font-bold">✓ Complete</span>
                    </div>
                  </div>

                  <div className="p-4 bg-white border-2 border-accent relative">
                    <div className="absolute -top-2.5 right-4 px-2 py-0.5 bg-accent text-white font-mono text-[9px] font-bold tracking-widest uppercase">
                      Active action
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-accent font-bold">
                        M2 // DESIGN SYSTEM
                      </span>
                      <MilestoneStatusBadge status="IN_REVIEW" />
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display font-bold text-lg text-dark">
                        Interactive High-Fidelity UI
                      </h3>
                      <span className="font-mono font-bold text-lg text-accent shrink-0">
                        $7,200
                      </span>
                    </div>
                    <p className="mt-3 font-mono text-[11px] text-dark/60">
                      Client review window open — approve, request revision, or open a
                      dispute.
                    </p>
                  </div>

                  <div className="p-4 bg-dark/5 border-2 border-dashed border-dark/40 opacity-90">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-dark/50 font-bold">
                        M3 // DEPLOY
                      </span>
                      <MilestoneStatusBadge status="PENDING" />
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display font-bold text-lg text-dark/70">
                        Protocol Validation
                      </h3>
                      <span className="font-mono font-bold text-lg text-dark/70 shrink-0">
                        $5,800
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-mono text-dark/50 flex items-center justify-between pt-2 border-t border-dark/10">
                      <span>Funds reserved (demo)</span>
                      <span>Awaiting M2</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t-2 border-dark flex items-center justify-between font-mono text-xs">
                  <div>
                    <span className="text-dark/50 block text-[10px]">
                      TOTAL (SAMPLE)
                    </span>
                    <span className="font-bold text-base text-dark">$17,500.00</span>
                  </div>
                  <div className="text-right">
                    <span className="text-dark/50 block text-[10px]">LABEL</span>
                    <span className="font-bold text-status-success">ILLUSTRATIVE ONLY</span>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </Panel>
      </PageContainer>
    </section>
  )
}
