import { AuthPlaceholder } from '../components/layout/PlaceholderPage'
import { routes } from '../lib/routes'

export function LoginPage() {
  return (
    <AuthPlaceholder
      title="Login"
      routePath={routes.login}
      alternateLabel="Create an account"
      alternateTo={routes.register}
    />
  )
}
