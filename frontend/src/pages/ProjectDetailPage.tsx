import { Link, useParams } from 'react-router-dom'
import { PlaceholderPage } from '../components/layout/PlaceholderPage'
import { Button } from '../components/ui/Button'
import { routes } from '../lib/routes'

export function ProjectDetailPage() {
  const { projectId = 'unknown' } = useParams()

  return (
    <PlaceholderPage
      eyebrow="// Project"
      title="Project Overview"
      routePath={routes.project(projectId)}
      meta={<span className="font-mono">ID: {projectId}</span>}
      description="Project summary, participants, milestones snapshot, and activity entry point."
      actions={
        <>
          <Link to={routes.agreement(projectId)}>
            <Button size="sm" variant="secondary">
              Agreement
            </Button>
          </Link>
          <Link to={routes.progress(projectId)}>
            <Button size="sm" variant="secondary">
              Progress
            </Button>
          </Link>
          <Link to={routes.disputes(projectId)}>
            <Button size="sm" variant="secondary">
              Disputes
            </Button>
          </Link>
          <Link to={routes.payments(projectId)}>
            <Button size="sm" variant="secondary">
              Payments
            </Button>
          </Link>
        </>
      }
    />
  )
}
