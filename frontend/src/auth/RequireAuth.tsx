import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { PageContainer } from '../components/ui/PageContainer'
import { Spinner } from '../components/ui/Spinner'
import { routes } from '../lib/routes'
import { useAuth } from './AuthContext'

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <PageContainer variant="app" className="py-24 flex justify-center">
        <Spinner label="Checking session" />
      </PageContainer>
    )
  }

  if (status !== 'authenticated') {
    return (
      <Navigate to={routes.login} replace state={{ from: location.pathname }} />
    )
  }

  return <Outlet />
}
