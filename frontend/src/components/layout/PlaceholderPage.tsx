import type { ReactNode } from 'react'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { PageContainer } from '../ui/PageContainer'
import { Panel } from '../ui/Panel'
import { SectionHeader } from '../ui/SectionHeader'

type PlaceholderPageProps = {
  eyebrow: string
  title: string
  description: string
  routePath: string
  meta?: ReactNode
  actions?: ReactNode
}

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  routePath,
  meta,
  actions,
}: PlaceholderPageProps) {
  return (
    <PageContainer variant="app" className="space-y-6">
      <SectionHeader eyebrow={eyebrow} title={title} meta={meta} />
      <Panel tone="surface" shadow="sm" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">Placeholder</Badge>
          <span className="font-mono text-[11px] text-dark/50">{routePath}</span>
        </div>
        <p className="font-body text-sm text-dark/70 max-w-2xl">{description}</p>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </Panel>
      <EmptyState
        title={`${title} UI arrives in a later phase`}
        description="Navigation and layout are wired now so screens can be filled without restructuring routes."
      />
    </PageContainer>
  )
}

