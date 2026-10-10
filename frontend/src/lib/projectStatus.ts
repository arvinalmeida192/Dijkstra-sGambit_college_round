import type { BadgeTone } from './milestoneStatus'
import type { ProjectStatus } from './api/projects'

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const PROJECT_STATUS_TONES: Record<ProjectStatus, BadgeTone> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  COMPLETED: 'accent',
  CANCELLED: 'danger',
}
