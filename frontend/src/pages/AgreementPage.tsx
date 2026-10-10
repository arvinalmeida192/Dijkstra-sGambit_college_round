import { useParams } from 'react-router-dom'
import { PlaceholderPage } from '../components/layout/PlaceholderPage'
import { routes } from '../lib/routes'

export function AgreementPage() {
  const { projectId = 'unknown' } = useParams()

  return (
    <PlaceholderPage
      eyebrow="// Agreement"
      title="Agreement & Milestones"
      routePath={routes.agreement(projectId)}
      meta={<span className="font-mono">ID: {projectId}</span>}
      description="Define deliverables, acceptance criteria, deadlines, review windows, amounts, versions, and acceptance status."
    />
  )
}
