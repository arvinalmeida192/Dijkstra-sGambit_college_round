import { AuthPlaceholder } from '../components/layout/PlaceholderPage'
import { routes } from '../lib/routes'

export function RegisterPage() {
  return (
    <AuthPlaceholder
      title="Register"
      routePath={routes.register}
      alternateLabel="Sign in instead"
      alternateTo={routes.login}
    />
  )
}
