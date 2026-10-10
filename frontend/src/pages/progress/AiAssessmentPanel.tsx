import { Alert } from '../../components/ui/Alert'

/**
 * Phase 15: AI assessment endpoint is not implemented yet.
 * Show an explicit unavailable state — never fabricate findings.
 */
export function AiAssessmentPanel() {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
        AI assessment
      </p>
      <Alert tone="warning">
        AI evidence assessment is unavailable. No assessment endpoint is wired
        yet, so Fairwork will not invent findings. Criteria comparison arrives
        in a later phase.
      </Alert>
    </div>
  )
}
