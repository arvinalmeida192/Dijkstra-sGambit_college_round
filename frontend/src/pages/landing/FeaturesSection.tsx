import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { PageContainer } from '../../components/ui/PageContainer'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { cn } from '../../lib/cn'

const features = [
  {
    title: 'Milestone-Based Agreements',
    tag: 'Spec & criteria',
    body: 'Define deliverables, deadlines, acceptance criteria, review windows, and payment amounts. Proposed changes stay inactive until required parties accept.',
    detail: 'Agreement versions + dual acceptance status',
  },
  {
    title: 'Conditional Payments',
    tag: 'Escrow tracking',
    body: 'Track funded, pending, released, refunded, and disputed amounts per milestone. Demo transactions are labeled testnet/local — never presented as real funds.',
    detail: 'Payment state follows authorized workflows',
  },
  {
    title: 'Delivery Verification',
    tag: 'Evidence trail',
    body: 'Submissions record who delivered what, when, against which agreement version — with file/link references and SHA-256 hashes where applicable. A hash verifies integrity, not quality.',
    detail: 'Integrity check ≠ quality proof',
  },
  {
    title: 'Dispute Resolution',
    tag: 'Structured evidence',
    body: 'Either party can open a dispute, submit evidence, and view claims. An authorized reviewer records the decision. AI summaries are advisory only.',
    detail: 'Disputed funds blocked from ordinary release',
  },
  {
    title: 'Agreement Transparency',
    tag: 'Audit timeline',
    body: 'A chronological activity timeline covers agreement changes, submissions, reviews, dispute decisions, and payment events for mutual accountability.',
    detail: 'Read-only project history',
  },
  {
    title: 'Participant Protection',
    tag: 'Deadlines & escalation',
    body: 'Show delivery deadlines, review windows, overdue states, and who owes the next action. Deadline automation never bypasses an open dispute.',
    detail: 'Escalation without silent auto-payout of disputes',
  },
  {
    title: 'Payment Tracking',
    tag: 'Lifecycle visibility',
    body: 'See escrow/funding state and transaction references alongside available actions for the user’s role and current milestone state.',
    detail: 'Role-aware payment actions',
  },
] as const

export function FeaturesSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="features" className="py-24 bg-base border-b-2 border-dark">
      <PageContainer variant="marketing">
        <SectionHeader
          eyebrow="// Specification suite"
          title="The Seven Core Pillars"
          meta={
            <span className="font-mono text-xs text-dark/60">
              EXPAND TO READ SPECS
            </span>
          }
          className="mb-16 pb-6 border-b-2 border-dark"
        />

        <div className="divide-y-2 divide-dark border-y-2 border-dark">
          {features.map((feature, index) => {
            const open = openIndex === index
            const n = String(index + 1).padStart(2, '0')
            return (
              <div
                key={feature.title}
                className={cn(
                  'transition-colors',
                  open ? 'bg-surface' : 'hover:bg-surface/60',
                )}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                  className="w-full text-left py-8 md:py-10 flex flex-wrap items-center justify-between gap-6 px-4 md:px-6"
                >
                  <div className="flex items-center gap-6 md:gap-10 min-w-0">
                    <span
                      className={cn(
                        'font-mono text-xl md:text-2xl font-bold',
                        open ? 'text-accent' : 'text-dark/40',
                      )}
                    >
                      {n}
                    </span>
                    <h3
                      className={cn(
                        'font-display font-bold text-2xl md:text-4xl uppercase tracking-tight',
                        open ? 'text-accent' : 'text-dark',
                      )}
                    >
                      {feature.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs">
                    <span className="hidden md:inline-block px-3 py-1 bg-dark/5 text-dark/70 border border-dark/20 uppercase">
                      {feature.tag}
                    </span>
                    <span
                      className={cn(
                        'w-8 h-8 border-2 border-dark flex items-center justify-center',
                        open && 'bg-accent text-white',
                      )}
                      aria-hidden
                    >
                      {open ? (
                        <Minus className="w-4 h-4" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </span>
                  </div>
                </button>

                {open ? (
                  <div className="px-4 md:px-20 pb-10 pt-2 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start bg-white border-t border-dark/10">
                    <p className="lg:col-span-8 font-body text-base md:text-lg text-dark/80 leading-relaxed">
                      {feature.body}
                    </p>
                    <div className="lg:col-span-4 p-4 bg-surface border-2 border-dark font-mono text-xs">
                      <div className="text-[10px] text-dark/50 mb-1 uppercase">
                        MVP note
                      </div>
                      <div className="font-bold text-accent">{feature.detail}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </PageContainer>
    </section>
  )
}
