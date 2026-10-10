import { useParams } from 'react-router-dom'
import { PlaceholderPage } from '../components/layout/PlaceholderPage'
import { routes } from '../lib/routes'

export function PaymentsPage() {
  const { projectId = 'unknown' } = useParams()

  return (
    <PlaceholderPage
      eyebrow="// Payments"
      title="Payments & Activity"
      routePath={routes.payments(projectId)}
      meta={<span className="font-mono">ID: {projectId}</span>}
      description="Escrow/funding state, pending/released/refunded/disputed amounts, transaction refs, and audit timeline."
    />
  )
}
