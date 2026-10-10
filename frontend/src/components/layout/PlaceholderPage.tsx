import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { PageContainer } from '../ui/PageContainer'
import { Panel } from '../ui/Panel'
import { SectionHeader } from '../ui/SectionHeader'
import { Button } from '../ui/Button'

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

type AuthPlaceholderProps = {
  title: string
  routePath: string
  alternateLabel: string
  alternateTo: string
}

export function AuthPlaceholder({
  title,
  routePath,
  alternateLabel,
  alternateTo,
}: AuthPlaceholderProps) {
  return (
    <div className="min-h-screen bg-base flex flex-col">
      <PageContainer variant="app" className="py-16 max-w-xl w-full">
        <SectionHeader eyebrow="// Auth" title={title} meta={routePath} />
        <Alert tone="info" className="mt-6">
          Full login/register UI is Phase 06. This route exists so navigation and
          deep links work now.
        </Alert>
        <Panel tone="surface" shadow="sm" className="mt-6 space-y-4">
          <p className="font-body text-sm text-dark/70">
            Forms, validation, and API integration are intentionally not
            implemented here.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to={alternateTo}>
              <Button variant="secondary" size="sm">
                {alternateLabel}
              </Button>
            </Link>
            <Link to="/">
              <Button variant="ghost" size="sm">
                Back to landing
              </Button>
            </Link>
          </div>
        </Panel>
      </PageContainer>
    </div>
  )
}
