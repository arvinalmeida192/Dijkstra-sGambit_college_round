import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { PageContainer } from '../components/ui/PageContainer'
import { Panel } from '../components/ui/Panel'
import { SectionHeader } from '../components/ui/SectionHeader'
import { Textarea } from '../components/ui/Textarea'
import { ApiError, isApiConfigured } from '../lib/api/client'
import { createProject } from '../lib/api/projects'
import { routes } from '../lib/routes'

export function NewProjectPage() {
  const { token, user } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (user && user.role !== 'CLIENT') {
    return <Navigate to={routes.projects} replace />
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {}
    if (!title.trim()) errors.title = 'Title is required.'
    else if (title.trim().length > 200) {
      errors.title = 'Title must be 200 characters or fewer.'
    }
    if (externalUrl.trim()) {
      try {
        const parsed = new URL(externalUrl.trim())
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          errors.externalUrl = 'Enter a valid http(s) URL.'
        }
      } catch {
        errors.externalUrl = 'Enter a valid http(s) URL.'
      }
    }
    return errors
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0 || !token) return

    setLoading(true)
    try {
      const { project } = await createProject(token, {
        title: title.trim(),
        description: description.trim() || undefined,
        externalUrl: externalUrl.trim() || undefined,
      })
      navigate(routes.project(project.id), { replace: true })
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : 'Could not create project. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageContainer variant="app" className="space-y-6">
      <SectionHeader
        eyebrow="// Projects"
        title="Create Project"
        meta={
          <Link
            to={routes.projects}
            className="font-mono text-xs font-bold uppercase tracking-wider text-accent hover:underline"
          >
            ← Back
          </Link>
        }
      />

      {!isApiConfigured() ? (
        <Alert tone="warning">
          Set <code className="font-bold">VITE_API_BASE_URL</code> before
          creating projects.
        </Alert>
      ) : null}

      <Panel tone="surface" shadow="sm" padding="lg" className="max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Input
            label="Title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={fieldErrors.title}
            placeholder="Brand redesign — Q2"
            disabled={loading}
            required
          />
          <Textarea
            label="Description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            hint="Optional. Summarize scope for your freelancer."
            placeholder="Landing page rebuild, two review rounds…"
            disabled={loading}
            rows={4}
          />
          <Input
            label="External job URL"
            name="externalUrl"
            type="url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            error={fieldErrors.externalUrl}
            hint="Optional reference only — Fairwork does not control external platforms."
            placeholder="https://…"
            disabled={loading}
          />

          {formError ? (
            <Alert tone="danger" role="alert">
              {formError}
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              loading={loading}
              disabled={!isApiConfigured()}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Create project
            </Button>
            <Link to={routes.projects}>
              <Button type="button" variant="secondary" disabled={loading}>
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Panel>
    </PageContainer>
  )
}
