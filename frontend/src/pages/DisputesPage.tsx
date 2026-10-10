import { useParams } from 'react-router-dom'
import { PlaceholderPage } from '../components/layout/PlaceholderPage'
import { routes } from '../lib/routes'

export function DisputesPage() {
  const { projectId = 'unknown' } = useParams()

  return (
    <PlaceholderPage
      eyebrow="// Disputes"
      title="Disputes"
      routePath={routes.disputes(projectId)}
      meta={<span className="font-mono">ID: {projectId}</span>}
      description="Open disputes, attach evidence, view claims, AI summary, and reviewer decisions."
    />
  )
}
