import {
  CheckCircle2,
  FileSignature,
  GitPullRequest,
  Vault,
} from 'lucide-react'
import { PageContainer } from '../../components/ui/PageContainer'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { cn } from '../../lib/cn'

const stages = [
  {
    index: '01',
    tone: 'base' as const,
    indexClass: 'text-dark',
    label: 'Stage 1 // Protocol init',
    title: 'Define the Agreement',
    body: 'Set milestones with deliverables, acceptance criteria, deadlines, review windows, and payment amounts. Both parties accept before work starts.',
    footerLeft: 'Acceptance matrix',
    footerRight: 'Verified brief',
    icon: FileSignature,
  },
  {
    index: '02',
    tone: 'dark' as const,
    indexClass: 'text-accent',
    label: 'Stage 2 // Capital escrow',
    title: 'Fund the Contract',
    body: 'Client funds milestone escrow on the demo chain. Fairwork tracks funded, pending, released, refunded, and disputed amounts — clearly labeled as testnet/local.',
    footerLeft: 'Escrow state',
    footerRight: 'Demo funds only',
    icon: Vault,
  },
  {
    index: '03',
    tone: 'base' as const,
    indexClass: 'text-status-warning',
    label: 'Stage 3 // Delivery proof',
    title: 'Deliver & Verify',
    body: 'Freelancers submit files, links, and notes with timestamps and integrity hashes. Clients approve, request revisions, or open a dispute within the review window.',
    footerLeft: 'Timed review',
    footerRight: 'Evidence trail',
    icon: GitPullRequest,
  },
  {
    index: '04',
    tone: 'accent' as const,
    indexClass: 'text-white',
    label: 'Stage 4 // Settlement',
    title: 'Release or Resolve',
    body: 'Approved milestones release through the authorized payment path. Open disputes block ordinary release until an authorized reviewer records a decision.',
    footerLeft: 'Authorized path',
    footerRight: 'Audit timeline',
    icon: CheckCircle2,
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 bg-surface border-b-2 border-dark">
      <PageContainer variant="marketing">
        <SectionHeader
          eyebrow="// Deterministic workflow"
          title="How Fairwork Operates"
          meta={
            <span className="px-2 py-0.5 bg-dark text-white font-bold font-mono text-xs">
              4 STAGES
            </span>
          }
          className="mb-12 pb-6 border-b-2 border-dark"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {stages.map((stage) => {
            const Icon = stage.icon
            const isDark = stage.tone === 'dark'
            const isAccent = stage.tone === 'accent'
            return (
              <article
                key={stage.index}
                className={cn(
                  'border-2 border-dark p-8 shadow-[var(--shadow-brutal)] flex flex-col justify-between min-h-[420px] transition-transform hover:-translate-y-2',
                  stage.tone === 'base' && 'bg-base text-dark',
                  isDark && 'bg-dark text-white',
                  isAccent && 'bg-accent text-white',
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-8">
                    <span
                      className={cn(
                        'font-mono text-5xl font-black',
                        stage.indexClass,
                      )}
                    >
                      {stage.index}
                    </span>
                    <div
                      className={cn(
                        'w-10 h-10 border-2 flex items-center justify-center',
                        isDark
                          ? 'border-white/20 bg-darker'
                          : isAccent
                            ? 'border-dark bg-dark'
                            : 'border-dark bg-white',
                      )}
                    >
                      <Icon
                        className={cn(
                          'w-5 h-5',
                          isAccent
                            ? 'text-status-success'
                            : isDark
                              ? 'text-accent'
                              : 'text-dark',
                        )}
                        aria-hidden
                      />
                    </div>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-[11px] font-bold uppercase tracking-wider block mb-2',
                      isAccent || isDark ? 'text-white/80' : 'text-accent',
                    )}
                  >
                    {stage.label}
                  </span>
                  <h3 className="font-display font-bold text-2xl uppercase tracking-tight mb-4">
                    {stage.title}
                  </h3>
                  <p
                    className={cn(
                      'font-body text-sm leading-relaxed',
                      isAccent || isDark ? 'text-white/80' : 'text-dark/70',
                    )}
                  >
                    {stage.body}
                  </p>
                </div>
                <div
                  className={cn(
                    'pt-6 border-t font-mono text-xs flex items-center justify-between gap-2',
                    isAccent || isDark ? 'border-white/20 text-white/70' : 'border-dark/15 text-dark/60',
                  )}
                >
                  <span>{stage.footerLeft}</span>
                  <span
                    className={cn(
                      'font-bold',
                      isAccent ? 'text-white' : isDark ? 'text-accent' : 'text-dark',
                    )}
                  >
                    {stage.footerRight}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      </PageContainer>
    </section>
  )
}
