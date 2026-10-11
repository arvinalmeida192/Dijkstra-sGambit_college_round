import { PageContainer } from '../../components/ui/PageContainer'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { cn } from '../../lib/cn'

const steps = [
  {
    n: '01',
    title: 'Open dispute',
    body: 'Either party selects a reason and freezes ordinary milestone release.',
  },
  {
    n: '02',
    title: 'Submit evidence',
    body: 'Upload files, links, and statements tied to the disputed milestone.',
  },
  {
    n: '03',
    title: 'Authorized review',
    body: 'A defined arbitrator/reviewer evaluates the case file and records a decision.',
  },
  {
    n: '04',
    title: 'Resolution path',
    body: 'Release, refund, or authorized split executes only through permitted workflows.',
  },
]

export function DisputeSection() {
  return (
    <section id="dispute-flow" className="py-24 bg-surface border-b-2 border-dark">
      <PageContainer variant="marketing">
        <SectionHeader
          eyebrow="// Dispute protocol"
          title="Evidence In. Decision Out."
          meta={
            <span className="font-mono text-xs text-dark/60">
              AUTHORIZED REVIEWER · STRUCTURED EVIDENCE
            </span>
          }
          className="mb-12 pb-6 border-b-2 border-dark"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {steps.map((step, i) => (
            <article
              key={step.n}
              className={cn(
                'bg-base border-2 border-dark p-6 shadow-[var(--shadow-brutal)] flex flex-col min-h-[220px]',
                i === 2 && 'border-accent',
              )}
            >
              <span className="font-mono text-3xl font-black text-accent mb-4">
                {step.n}
              </span>
              <h3 className="font-display font-bold text-xl uppercase tracking-tight mb-3">
                {step.title}
              </h3>
              <p className="font-body text-sm text-dark/70 leading-relaxed mt-auto">
                {step.body}
              </p>
            </article>
          ))}
        </div>
      </PageContainer>
    </section>
  )
}
