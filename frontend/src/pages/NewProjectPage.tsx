import { Link } from 'react-router-dom'
import { PlaceholderPage } from '../components/layout/PlaceholderPage'
import { Button } from '../components/ui/Button'
import { routes } from '../lib/routes'

export function NewProjectPage() {
  return (
    <PlaceholderPage
      eyebrow="// Projects"
      title="Create Project"
      routePath={routes.projectNew}
      description="Project creation form and invitation flow land in Phase 09. Route exists for navigation wiring."
      actions={
        <Link to={routes.projects}>
          <Button size="sm" variant="secondary">
            Back to projects
          </Button>
        </Link>
      }
    />
  )
}
