import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { AuthApiError, isAuthApiConfigured } from '../lib/api/auth'
import { validateRegisterForm } from '../lib/authValidation'
import type { UserRole } from '../lib/roles'
import { routes } from '../lib/routes'

const roleOptions = [
  { value: 'FREELANCER', label: 'Freelancer' },
  { value: 'CLIENT', label: 'Client' },
]

export function RegisterPage() {
  const { register, status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const invite = params.get('invite')?.trim() ?? ''

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<UserRole>('FREELANCER')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (status === 'authenticated') {
    return <Navigate to={routes.dashboard} replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const errors = validateRegisterForm({
      name,
      email,
      password,
      confirmPassword,
      role,
    })
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setLoading(true)
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      })
      navigate(routes.dashboard, { replace: true })
    } catch (err) {
      if (err instanceof AuthApiError) {
        setFormError(err.message)
      } else {
        setFormError('Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create Account"
      subtitle="CHOOSE CLIENT OR FREELANCER · EMAIL / PASSWORD"
      aside={
        <>
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-white/80 block mb-3">
              // Join Fairwork
            </span>
            <h2 className="font-display font-black text-3xl uppercase leading-none tracking-tight mb-4">
              Pick your role
            </h2>
            <p className="font-body text-sm text-white/90 leading-relaxed">
              Clients create projects and fund milestones. Freelancers deliver work and
              submit evidence. Arbitrator accounts are provisioned separately for MVP
              demos.
            </p>
          </div>
          <div className="mt-8 font-mono text-[10px] text-white/70 flex items-center justify-between gap-4">
            <span>ROLE ON REGISTER</span>
            <span>{role}</span>
          </div>
        </>
      }
    >
      {!isAuthApiConfigured() ? (
        <Alert tone="warning" className="mb-6" role="status">
          Set <code className="font-bold">VITE_API_BASE_URL</code> (see{' '}
          <code className="font-bold">frontend/.env.example</code>) so this form
          can reach the Phase 07 auth API.
        </Alert>
      ) : null}

      {invite ? (
        <Alert tone="info" className="mb-6" role="status">
          Joining via invitation: <span className="font-bold">{invite}</span>. Full
          invitation acceptance lands in later phases.
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <SegmentedControl
            ariaLabel="Account role"
            options={roleOptions}
            value={role}
            onChange={(value) => setRole(value as UserRole)}
            disabled={loading}
          />
          {fieldErrors.role ? (
            <p className="mt-1 font-mono text-[11px] text-status-danger" role="alert">
              {fieldErrors.role}
            </p>
          ) : null}
        </div>

        <Input
          label="Full name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          placeholder="Alex Rivera"
          disabled={loading}
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint="At least 8 characters"
          placeholder="••••••••••••"
          disabled={loading}
        />
        <Input
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
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
          Create account
        </Button>
      </form>

      <p className="mt-8 pt-4 border-t border-dark/15 font-mono text-xs text-dark/60">
        Already registered?{' '}
        <Link to={routes.login} className="text-accent font-bold hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
