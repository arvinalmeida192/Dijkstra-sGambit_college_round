import { PageContainer } from '../../components/ui/PageContainer'
import { SectionHeader } from '../../components/ui/SectionHeader'

const problems = [
  {
    index: '01',
    tone: 'text-status-danger',
    label: 'Vulnerability: Talent',
    title: 'Freelancers risk unpaid work, perpetual revisions, and ghosted handoffs.',
    body: 'When work is submitted before payment terms are locked, leverage evaporates. Fairwork records milestones, submissions, and evidence so both sides share the same timeline.',
    tag: 'Unsecured delivery risk',
  },
  {
    index: '02',
    tone: 'text-status-warning',
    label: 'Vulnerability: Client',
    title: 'Clients risk deposits on deliverables that miss the agreed brief.',
    body: 'Ambiguous scope and missing acceptance criteria leave clients with little recourse. Fairwork keeps criteria, review windows, and revision history next to each milestone.',
    tag: 'Scope & acceptance risk',
  },
  {
    index: '03',
    tone: 'text-accent',
    label: 'Vulnerability: Process',
    title: 'Disputes stall when evidence is scattered and decisions are opaque.',
    body: 'Screenshots in chat threads do not make a case file. Fairwork structures claims, evidence, advisory AI summaries, and authorized reviewer decisions in one place.',
    tag: 'Opaque dispute risk',
  },
] as const

const darkGridStyle = {
  backgroundImage:
    'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
} as const

export function ProblemSection() {
  return (
    <section
      id="the-problem"
      className="py-24 bg-dark text-base border-b-2 border-dark relative overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={darkGridStyle}
        aria-hidden
      />
      <PageContainer variant="marketing" className="relative z-10">
        <SectionHeader
          tone="dark"
          eyebrow="// Exposure audit"
          title="The Broken Status Quo"
          meta={<span className="text-white/40">SECTION [02/05]</span>}
          className="mb-16"
        />

        <div className="space-y-10 lg:space-y-16">
          {problems.map((item) => (
            <article
              key={item.index}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start p-8 md:p-12 border-2 border-white/20 bg-darker transition-colors hover:border-accent"
            >
              <div className="lg:col-span-3">
                <span
                  className={`font-mono text-6xl md:text-8xl font-black block ${item.tone}`}
                >
                  {item.index}
                </span>
                <span className="font-mono text-xs tracking-widest text-white/50 uppercase mt-2 block">
                  {item.label}
                </span>
              </div>
              <div className="lg:col-span-9">
                <h3 className="font-display font-extrabold text-3xl md:text-5xl text-white uppercase leading-[1.05] tracking-tight mb-6">
                  {item.title}
                </h3>
                <p className="font-body text-lg text-white/70 max-w-3xl leading-relaxed">
                  {item.body}
                </p>
                <div className={`mt-8 font-mono text-xs ${item.tone}`}>
                  <span className="px-2 py-1 border border-current uppercase bg-white/5">
                    {item.tag}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </PageContainer>
    </section>
  )
}
