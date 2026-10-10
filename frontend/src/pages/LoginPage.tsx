import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { AuthApiError, isAuthApiConfigured } from '../lib/api/auth'
import { validateLoginForm } from '../lib/authValidation'
import { routes } from '../lib/routes'

export function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from =
    (location.state as { from?: string } | null)?.from ?? routes.dashboard

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (status === 'authenticated') {
    return <Navigate to={from} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const errors = validateLoginForm({ email, password })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setLoading(true)
    try {
      await login({ email: email.trim(), password })
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof AuthApiError) {
        setFormError(err.message)
      } else {
        setFormError('Sign-in failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Access Agreements"
      subtitle="EMAIL / PASSWORD SIGN-IN · CLIENT OR FREELANCER"
    >
      {!isAuthApiConfigured() ? (
        <Alert tone="warning" className="mb-6" role="status">
          Set <code className="font-bold">VITE_API_BASE_URL</code> (see{' '}
          <code className="font-bold">frontend/.env.example</code>) so this form
          can reach the Phase 07 auth API.
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          placeholder="you@studio.design"
          disabled={loading}
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          placeholder="••••••••••••"
          disabled={loading}
        />

        {formError ? (
          <Alert tone="danger" role="alert">
            {formError}
          </Alert>
        ) : null}

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={loading}
          rightIcon={<ArrowRight className="w-4 h-4" />}
        >
          Sign In
        </Button>
      </form>

      <p className="mt-8 pt-4 border-t border-dark/15 font-mono text-xs text-dark/60">
        No account?{' '}
        <Link to={routes.register} className="text-accent font-bold hover:underline">
          Create one
        </Link>
      </p>
    </AuthLayout>
  )
}
