import type { AgreementTerms } from '../../lib/api/agreements'
import { formatAmountBaseUnits } from '../../lib/agreementStatus'

type TermsViewProps = {
  terms: AgreementTerms
  compact?: boolean
}

export function TermsView({ terms, compact = false }: TermsViewProps) {
  const title = terms.title ?? terms.summary ?? 'Project Agreement'
  const totalCents =
    terms.totalPayment ??
    terms.milestones.reduce((acc, m) => acc + (m.amount || 0), 0)

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {/* Overall Agreement Summary */}
      <div className="border-2 border-dark/15 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-dark/10 pb-2">
          <h3 className="font-display font-bold text-lg uppercase tracking-tight text-dark">
            {title}
          </h3>
          <div className="font-mono text-xs font-bold text-dark">
            <span>Total Payment: </span>
            <span className="text-accent">{formatAmountBaseUnits(totalCents)}</span>
          </div>
        </div>

        {terms.description ? (
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50 mb-1">
              Scope & Description
            </p>
            <p className="font-body text-sm text-dark/90 whitespace-pre-wrap">
              {terms.description}
            </p>
          </div>
        ) : terms.summary && terms.summary !== title ? (
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50 mb-1">
              Summary
            </p>
            <p className="font-body text-sm text-dark/90 whitespace-pre-wrap">
              {terms.summary}
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 pt-1">
          {terms.finalDeliverable ? (
            <Field label="Final Deliverable" value={terms.finalDeliverable} />
          ) : null}
          {terms.completionCriteria ? (
            <Field
              label="Final Completion Criteria"
              value={terms.completionCriteria}
            />
          ) : null}
        </div>

        {terms.finalDueDate ? (
          <div className="font-mono text-xs text-dark/70 pt-1">
            <span className="font-bold">Final Project Due Date: </span>
            <span>{terms.finalDueDate}</span>
          </div>
        ) : null}
      </div>

      {/* Agreed Milestone Schedule */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
            Milestone Schedule ({terms.milestones.length})
          </p>
          <span className="font-mono text-[11px] text-dark/60">
            Total Allocated: {formatAmountBaseUnits(totalCents)}
          </span>
        </div>

        <ul className="space-y-3">
          {terms.milestones.map((m, index) => (
            <li
              key={`${m.title}-${index}`}
              className="border-2 border-dark/15 bg-white p-4 space-y-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-display font-bold text-base uppercase tracking-tight">
                  {index + 1}. {m.title}
                </h4>
                <span className="font-mono text-xs font-bold text-dark">
                  {formatAmountBaseUnits(m.amount)}{' '}
                  <span className="font-normal text-dark/50">(÷100 units)</span>
                </span>
              </div>

              {m.description ? (
                <Field label="Scope / Description" value={m.description} />
              ) : null}

              {m.deliverables ? (
                <Field label="Deliverables" value={m.deliverables} />
              ) : null}

              {m.acceptanceCriteria ? (
                <Field
                  label="Acceptance criteria"
                  value={m.acceptanceCriteria}
                />
              ) : null}

              <div className="flex flex-wrap gap-4 font-mono text-[11px] text-dark/60 pt-1">
                {m.dueDate ? <span>Due {m.dueDate}</span> : null}
                {m.reviewWindowDays != null ? (
                  <span>Review window {m.reviewWindowDays}d</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {terms.notes ? (
        <div className="border-2 border-dark/10 bg-neutral-50 p-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50 mb-1">
            Additional Contractual Notes
          </p>
          <p className="font-body text-sm text-dark/70 whitespace-pre-wrap">
            {terms.notes}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-dark/40 font-bold">
        {label}
      </p>
      <p className="font-body text-sm text-dark/80 whitespace-pre-wrap">{value}</p>
    </div>
  )
}
