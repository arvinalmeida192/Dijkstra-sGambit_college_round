import type { AgreementTerms } from '../../lib/api/agreements'
import { formatAmountBaseUnits } from '../../lib/agreementStatus'

type TermsViewProps = {
  terms: AgreementTerms
  compact?: boolean
}

export function TermsView({ terms, compact = false }: TermsViewProps) {
  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50 mb-1">
          Summary
        </p>
        <p className="font-body text-sm text-dark/90 whitespace-pre-wrap">
          {terms.summary}
        </p>
      </div>

      <div className="space-y-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
          Milestone terms
        </p>
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
              <Field label="Deliverables" value={m.deliverables} />
              <Field label="Acceptance criteria" value={m.acceptanceCriteria} />
              <div className="flex flex-wrap gap-4 font-mono text-[11px] text-dark/60">
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
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50 mb-1">
            Notes
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
      <p className="font-mono text-[10px] uppercase tracking-wider text-dark/40">
        {label}
      </p>
      <p className="font-body text-sm text-dark/80 whitespace-pre-wrap">{value}</p>
    </div>
  )
}
