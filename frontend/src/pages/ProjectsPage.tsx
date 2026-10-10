import { Link } from 'react-router-dom'
import { PlaceholderPage } from '../components/layout/PlaceholderPage'
import { Button } from '../components/ui/Button'
import { routes } from '../lib/routes'

export function ProjectsPage() {
  return (
    <PlaceholderPage
      eyebrow="// Projects"
      title="Projects"
      routePath={routes.projects}
      description="List authorized projects. Create, invite, and open project detail from here in later phases."
      actions={
        <>
          <Link to={routes.projectNew}>
            <Button size="sm">Create project</Button>
          </Link>
          <Link to={routes.project('demo')}>
            <Button size="sm" variant="secondary">
              Open demo project
            </Button>
          </Link>
        </>
      }
    />
  )
}
