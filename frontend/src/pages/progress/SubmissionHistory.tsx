import { Download } from 'lucide-react'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import type { Submission } from '../../lib/api/submissions'
import {
  getReviewDecisionLabel,
  getReviewDecisionTone,
  shortenHash,
} from '../../lib/submissionStatus'

type SubmissionHistoryProps = {
  submissions: Submission[]
  busy: boolean
  onDownload: (submission: Submission) => void
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function SubmissionHistory({
  submissions,
  busy,
  onDownload,
}: SubmissionHistoryProps) {
  if (submissions.length === 0) {
    return (
      <p className="font-mono text-[11px] text-dark/50">
        No submissions yet for this milestone.
      </p>
    )
  }

  const ordered = [...submissions].sort((a, b) => b.revision - a.revision)

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
        Revision history
      </p>
      <ul className="space-y-3">
        {ordered.map((submission) => (
          <li
            key={submission.id}
            className="border-2 border-dark/10 bg-white/60 p-3 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold uppercase">
                  Revision {submission.revision}
                </span>
                <span className="font-mono text-[11px] text-dark/50">
                  {formatDateTime(submission.submittedAt)}
                </span>
              </div>
              {submission.hasFile ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={() => onDownload(submission)}
                >
                  Download
                </Button>
              ) : null}
            </div>

            {submission.notes ? (
              <p className="font-body text-sm text-dark/80 whitespace-pre-wrap">
                {submission.notes}
              </p>
            ) : null}

            {submission.externalUrl ? (
              <p className="font-mono text-[11px]">
                Link:{' '}
                <a
                  href={submission.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent font-bold break-all hover:underline"
                >
                  {submission.externalUrl}
                </a>
              </p>
            ) : null}

            {submission.hasFile ? (
              <p className="font-mono text-[11px] text-dark/70">
                File: {submission.originalFilename ?? 'deliverable'}
                {submission.byteSize != null
                  ? ` · ${submission.byteSize} bytes`
                  : ''}
                {submission.contentType ? ` · ${submission.contentType}` : ''}
              </p>
            ) : null}

            {submission.sha256Hash ? (
              <div className="space-y-1">
                <p className="font-mono text-[11px] text-dark/70 break-all">
                  SHA-256:{' '}
                  <span title={submission.sha256Hash}>
                    {shortenHash(submission.sha256Hash)}
                  </span>
                </p>
                <p className="font-mono text-[10px] text-dark/45">
                  Integrity check only — not proof of quality or authorship.
                </p>
              </div>
            ) : (
              <p className="font-mono text-[10px] text-dark/45">
                No file hash (link/notes-only submission).
              </p>
            )}

            {submission.latestVerificationRun ? (
              <div className="border-t-2 border-dark/10 pt-2 space-y-2 bg-neutral-50/80 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/60">
                      Independent Verification
                    </span>
                    <Badge
                      tone={
                        submission.latestVerificationRun.outcome === 'PASSED'
                          ? 'success'
                          : submission.latestVerificationRun.outcome ===
                              'FAILED'
                            ? 'danger'
                            : 'warning'
                      }
                      dot
                    >
                      {submission.latestVerificationRun.outcome.replace(
                        /_/g,
                        ' ',
                      )}
                    </Badge>
                    <span className="font-mono text-[10px] text-dark/50">
                      {submission.latestVerificationRun.verificationMethod.replace(
                        /_/g,
                        ' ',
                      )}{' '}
                      · v{submission.latestVerificationRun.agreementVersion}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-dark/50">
                    {submission.latestVerificationRun.durationMs}ms
                  </span>
                </div>

                <p className="font-body text-xs text-dark/80">
                  {submission.latestVerificationRun.summary}
                </p>

                {submission.latestVerificationRun.checksExecuted.length > 0 ? (
                  <ul className="space-y-1 font-mono text-[11px]">
                    {submission.latestVerificationRun.checksExecuted.map(
                      (chk) => (
                        <li
                          key={chk.id}
                          className="flex items-start gap-2 text-dark/80"
                        >
                          <span
                            className={
                              chk.passed
                                ? 'text-status-success font-bold'
                                : 'text-status-danger font-bold'
                            }
                          >
                            {chk.passed ? '✓' : '✗'}
                          </span>
                          <div>
                            <span className="font-bold">{chk.name}:</span>{' '}
                            <span>{chk.detail}</span>
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                ) : null}

                {submission.latestAttestation ? (
                  <div className="border-t border-dark/15 pt-2 space-y-1 font-mono text-[10px] text-dark/70">
                    <div className="font-bold uppercase text-status-success">
                      Signed EIP-712 Verification Attestation Issued
                    </div>
                    <div>
                      Verifier Signer:{' '}
                      <code className="bg-dark/5 px-1">
                        {shortenHash(
                          submission.latestAttestation.verifierAddress,
                        )}
                      </code>{' '}
                      · Chain {submission.latestAttestation.chainId}
                    </div>
                    <div>
                      Criteria Hash:{' '}
                      <code className="bg-dark/5 px-1">
                        {shortenHash(submission.latestAttestation.criteriaHash)}
                      </code>{' '}
                      · Artifact Hash:{' '}
                      <code className="bg-dark/5 px-1">
                        {shortenHash(submission.latestAttestation.artifactHash)}
                      </code>
                    </div>
                    <div>
                      Nonce:{' '}
                      <code className="bg-dark/5 px-1">
                        {shortenHash(submission.latestAttestation.nonce)}
                      </code>{' '}
                      · Signature:{' '}
                      <code className="bg-dark/5 px-1">
                        {shortenHash(submission.latestAttestation.signature)}
                      </code>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {(submission.reviews?.length ?? 0) > 0 ? (
              <ul className="space-y-2 border-t border-dark/10 pt-2">
                {submission.reviews!.map((review) => (
                  <li key={review.id} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={getReviewDecisionTone(review.decision)} dot>
                        {getReviewDecisionLabel(review.decision)}
                      </Badge>
                      <span className="font-mono text-[10px] text-dark/50">
                        {formatDateTime(review.createdAt)}
                      </span>
                    </div>
                    {review.feedback ? (
                      <Alert tone="warning">Feedback: {review.feedback}</Alert>
                    ) : null}
                    {(review.unmetCriteria?.length ?? 0) > 0 ? (
                      <ul className="list-disc pl-5 font-mono text-[11px] text-dark/70">
                        {review.unmetCriteria!.map((criterion) => (
                          <li key={criterion}>{criterion}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
