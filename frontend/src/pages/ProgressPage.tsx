import { useParams } from 'react-router-dom'
import { PlaceholderPage } from '../components/layout/PlaceholderPage'
import { routes } from '../lib/routes'

export function ProgressPage() {
  const { projectId = 'unknown' } = useParams()

  return (
    <PlaceholderPage
      eyebrow="// Progress"
      title="Submission & Progress"
      routePath={routes.progress(projectId)}
      meta={<span className="font-mono">ID: {projectId}</span>}
      description="Submit deliverables, show revisions, hashes, review actions, and AI assessments when available."
    />
  )
}
