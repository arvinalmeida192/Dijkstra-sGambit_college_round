import {
  getMilestoneStatusLabel,
  getMilestoneStatusTone,
  type MilestoneStatus,
} from '../../lib/milestoneStatus'
import { Badge } from './Badge'

type MilestoneStatusBadgeProps = {
  status: MilestoneStatus
  className?: string
}

export function MilestoneStatusBadge({
  status,
  className,
}: MilestoneStatusBadgeProps) {
  return (
    <Badge tone={getMilestoneStatusTone(status)} dot className={className}>
      {getMilestoneStatusLabel(status)}
    </Badge>
  )
}
