import { forbidden } from '../utils/errors.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { query } from '../db/pool.js'

/**
 * Require one of the listed global roles (CLIENT | FREELANCER | ARBITRATOR).
 */
export function requireRoles(...roles) {
  const allowed = new Set(roles)
  return (req, _res, next) => {
    if (!req.user) {
      return next(forbidden())
    }
    if (!allowed.has(req.user.role)) {
      return next(forbidden(`Role ${req.user.role} is not permitted for this action.`))
    }
    next()
  }
}

/**
 * Project-level access pattern for later phases.
 * A user may access a project if they are client_id, freelancer_id,
 * or (later) a listed participant. Projects table arrives in Phase 08;
 * until then this helper fails closed when the project is missing.
 */
export function requireProjectAccess(getProjectId) {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw forbidden()
    }

    const projectId =
      typeof getProjectId === 'function' ? getProjectId(req) : req.params[getProjectId]

    if (!projectId) {
      throw forbidden('Project id is required.')
    }

    // Soft check: table may not exist until Phase 08 migrations.
    let result
    try {
      result = await query(
        `SELECT id, client_id, freelancer_id
         FROM projects
         WHERE id = $1`,
        [projectId],
      )
    } catch (err) {
      if (err?.code === '42P01') {
        // undefined_table
        throw forbidden('Project access control is not available yet.')
      }
      throw err
    }

    const project = result.rows[0]
    if (!project) {
      throw forbidden('You do not have access to this project.')
    }

    const isParticipant =
      project.client_id === req.user.id || project.freelancer_id === req.user.id
    const isArbitrator = req.user.role === 'ARBITRATOR'

    if (!isParticipant && !isArbitrator) {
      throw forbidden('You do not have access to this project.')
    }

    req.project = project
    next()
  })
}
