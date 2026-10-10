import { Link } from 'react-router-dom'
import { PlaceholderPage } from '../components/layout/PlaceholderPage'
import { Button } from '../components/ui/Button'
import { routes } from '../lib/routes'

export function DashboardPage() {
  return (
    <PlaceholderPage
      eyebrow="// App"
      title="Dashboard"
      routePath={routes.dashboard}
      description="Overview of active projects, milestone statuses, deadlines, alerts, disputes, and payment summaries."
      actions={
        <>
          <Link to={routes.projects}>
            <Button size="sm" variant="secondary">
              View projects
            </Button>
          </Link>
          <Link to={routes.projectNew}>
            <Button size="sm">New project</Button>
          </Link>
        </>
      }
    />
  )
}
