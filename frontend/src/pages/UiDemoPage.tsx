import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { PublicFooter } from '../components/layout/PublicFooter'
import { PublicHeader } from '../components/layout/PublicHeader'
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  MilestoneStatusBadge,
  Modal,
  PageContainer,
  Panel,
  SectionHeader,
  SegmentedControl,
  Select,
  Spinner,
  Textarea,
} from '../components/ui'
import { MILESTONE_STATUSES } from '../lib/milestoneStatus'

export function UiDemoPage() {
  const [role, setRole] = useState('freelancer')
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <div className="min-h-screen bg-base">
      <PublicHeader
        links={[
          { href: '#primitives', label: 'Primitives', index: '01' },
          { href: '#forms', label: 'Forms', index: '02' },
          { href: '#feedback', label: 'Feedback', index: '03' },
        ]}
        onLogin={() => setModalOpen(true)}
        primaryAction={
          <Button size="sm" onClick={() => setModalOpen(true)}>
            Open Modal
          </Button>
        }
      />

      <main className="py-12 space-y-16">
        <PageContainer variant="app">
          <SectionHeader
            eyebrow="// Phase 04"
            title="UI System Demo"
            meta="Shared components only — not product pages"
          />
          <p className="mt-6 font-body text-dark/70 max-w-2xl">
            Minimal verification surface for approved Fairwork tokens and
            reusable components. Landing novelty (custom cursor, pixel reveal,
            marquees) is intentionally excluded.
          </p>
        </PageContainer>

        <section id="primitives">
          <PageContainer variant="app" className="space-y-8">
            <SectionHeader eyebrow="// Actions" title="Buttons & Badges" />
            <Panel shadow="sm" className="space-y-6">
              <div className="flex flex-wrap gap-3">
                <Button rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Primary
                </Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button disabled>Disabled</Button>
                <Button
                  loading={loading}
                  onClick={() => {
                    setLoading(true)
                    window.setTimeout(() => setLoading(false), 1200)
                  }}
                >
                  Trigger Loading
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">Neutral</Badge>
                <Badge tone="accent" dot>
                  Accent
                </Badge>
                <Badge tone="success" dot>
                  Success
                </Badge>
                <Badge tone="warning" dot>
                  Warning
                </Badge>
                <Badge tone="danger" dot>
                  Danger
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {MILESTONE_STATUSES.map((status) => (
                  <MilestoneStatusBadge key={status} status={status} />
                ))}
              </div>
            </Panel>
          </PageContainer>
        </section>

        <section id="forms">
          <PageContainer variant="app" className="space-y-8">
            <SectionHeader eyebrow="// Inputs" title="Form Controls" />
            <Panel tone="base" shadow="sm" className="grid gap-4 md:grid-cols-2">
              <SegmentedControl
                ariaLabel="Role"
                value={role}
                onChange={setRole}
                options={[
                  { value: 'freelancer', label: 'Freelancer' },
                  { value: 'client', label: 'Client' },
                ]}
                className="md:col-span-2"
              />
              <Input
                label="Identity Email"
                name="email"
                placeholder="alex@studio.design"
              />
              <Input
                label="Password"
                name="password"
                type="password"
                error="Password is required"
              />
              <Select
                label="Milestone Splits"
                name="splits"
                options={[
                  { value: '3', label: '3 Milestones (30% / 40% / 30%)' },
                  { value: '2', label: '2 Milestones (50% / 50%)' },
                ]}
              />
              <Textarea
                label="Acceptance Criteria"
                name="criteria"
                hint="Shared across agreement screens later"
                placeholder="List deliverables…"
              />
            </Panel>
          </PageContainer>
        </section>

        <section id="feedback">
          <PageContainer variant="app" className="space-y-8">
            <SectionHeader eyebrow="// States" title="Feedback Patterns" />
            <div className="grid gap-4">
              <Alert tone="success">✓ Signature validated (demo alert).</Alert>
              <Alert tone="danger" role="alert">
                Invalid credentials — demo error state.
              </Alert>
              <LoadingBlock label="Fetching projects" />
              <EmptyState
                title="No projects yet"
                description="Create a Fairwork project to invite the other party."
                action={<Button size="sm">Create Project</Button>}
              />
              <div className="flex items-center gap-4">
                <Spinner size="sm" label="Syncing" />
                <Spinner size="lg" label="Building" />
              </div>
            </div>
          </PageContainer>
        </section>
      </main>

      <PublicFooter
        columns={[
          {
            title: 'Dev',
            links: [{ href: '/dev/ui', label: 'UI Demo' }],
          },
        ]}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Access Agreements"
        size="md"
      >
        <p className="font-mono text-xs text-dark/70 mb-4">
          Demo modal shell — auth wiring lands in Phase 06/07.
        </p>
        <Input label="Email" name="modal-email" placeholder="you@example.com" />
        <div className="mt-4">
          <Button fullWidth onClick={() => setModalOpen(false)}>
            Close
          </Button>
        </div>
      </Modal>
    </div>
  )
}
