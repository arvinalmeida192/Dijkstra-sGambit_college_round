import { describe, expect, it } from 'vitest'
import {
  createInvitationSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  parseBody,
  parseQuery,
} from '../../src/modules/projects/project.validation.js'

describe('createProjectSchema', () => {
  it('accepts a minimal valid project', () => {
    const data = parseBody(createProjectSchema, { title: 'Website rebuild' })
    expect(data).toEqual({
      title: 'Website rebuild',
      description: '',
      externalUrl: undefined,
    })
  })

  it('accepts an external http(s) reference URL', () => {
    const data = parseBody(createProjectSchema, {
      title: 'Marketplace job',
      description: 'Linked for reference only',
      externalUrl: 'https://upwork.example/jobs/123',
    })
    expect(data.externalUrl).toBe('https://upwork.example/jobs/123')
  })

  it('rejects short titles and non-url external links', () => {
    expect(() => parseBody(createProjectSchema, { title: 'A' })).toThrow()
    expect(() =>
      parseBody(createProjectSchema, {
        title: 'Ok title',
        externalUrl: 'not-a-url',
      }),
    ).toThrow()
  })
})

describe('createInvitationSchema', () => {
  it('allows empty body', () => {
    expect(parseBody(createInvitationSchema, {})).toEqual({ email: undefined })
  })

  it('normalizes email', () => {
    const data = parseBody(createInvitationSchema, {
      email: 'Fran@Example.COM',
    })
    expect(data.email).toBe('fran@example.com')
  })
})

describe('listProjectsQuerySchema', () => {
  it('applies defaults', () => {
    expect(parseQuery(listProjectsQuerySchema, {})).toEqual({
      limit: 20,
      offset: 0,
    })
  })
})
