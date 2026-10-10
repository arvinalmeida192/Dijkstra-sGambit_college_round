# Fairwork --- Project Overview and Build Plan

**Hackathon project:** Fairwork --- Get Paid for What You Deliver\
**Product direction:** A portable project-protection layer for freelance
work\
**Core idea:** Connect agreements, evidence-based progress tracking,
dispute resolution, and milestone payments without trying to replace
every freelance marketplace.

------------------------------------------------------------------------

## 1. The Problem

Freelancers and clients often disagree about what was promised, whether
a deliverable meets the requirements, when payment should be released,
and what happens when one party stops responding.

Freelancers risk completing work and not getting paid. Clients risk
paying for work that does not meet the agreed requirements. Existing
marketplaces may provide their own protections, but projects and
evidence can be spread across different tools.

A standalone agreement website also has an adoption problem: clients and
freelancers already use marketplaces and work tools. Asking them to move
their entire workflow to a new website creates friction.

## 2. Our Solution

**Fairwork is a portable trust and payment-protection layer for
freelance projects.**

Users can link a project from an existing workflow, agree on
milestone-based terms, submit and verify work, track project progress,
and resolve disputes with a transparent evidence trail.

Fairwork will not claim to control third-party marketplace contracts or
payments unless an official integration explicitly permits those
actions. The first version will work independently through project
invitation links and user-authorized evidence sources.

### Product principles

-   **Protect both parties:** clients can challenge incomplete work, and
    freelancers can challenge unfair rejection or payment withholding.
-   **Evidence over unsupported claims:** progress should be based on
    deliverables, version history, test results, and recorded
    actions---not just a manually entered percentage.
-   **AI assists; rules enforce:** AI can analyze evidence and flag
    risks, but it must not independently decide to release, refund, or
    penalize funds.
-   **Transparent history:** accepted contract versions, submissions,
    decisions, and transactions should be traceable.
-   **Integrate responsibly:** use official APIs and explicit
    permissions; do not bypass a marketplace's terms or payment
    protections.
-   **Privacy by design:** keep private files and sensitive
    communications off-chain, with access controls.

------------------------------------------------------------------------

## 3. What We Will Build

### A. Fairwork Connect --- Link a project to Fairwork

The user should not need to move their entire freelance workflow to
Fairwork.

For the MVP: - Let a client create a Fairwork project and generate an
invitation link. - Let the freelancer join through the link and confirm
their role. - Store an external project URL or reference when
applicable. - Let both parties review and accept the same agreement. -
Provide a shared Fairwork dashboard for milestones, evidence, deadlines,
disputes, and payment status.

Integration roadmap: 1. **MVP:** shareable project links and manually
confirmed project details. 2. **MVP/stretch:** GitHub integration for
software projects, using user-authorized repository access. 3.
**Prototype/stretch:** a browser-extension experience that opens or
links a supported project to Fairwork with user consent. 4. **Future:**
official marketplace API integrations, subject to platform access, API
permissions, and terms.

An external project link does not mean Fairwork controls that
marketplace's contract or payments. Marketplace-specific integration and
payment capabilities must be verified separately.

### B. Milestone-Based Agreements

A project is divided into milestones. Each milestone defines: -
Deliverables and acceptance criteria. - Deadline and review window. -
Payment amount and funding status. - Dependencies, if applicable. -
Revision and dispute rules.

Both parties explicitly accept the terms. Any later change creates a new
version instead of silently overwriting the previous agreement.

### C. Project Progress Tracking

Use a shared milestone state machine:

`PENDING → IN_PROGRESS → SUBMITTED → APPROVED`

Additional branches include: - `REVISION_REQUESTED` - `DISPUTED` -
`CANCELLED` where allowed by the agreement

Track: - Milestone status and deadlines. - Deliverable submissions and
revisions. - Contract version associated with each submission. - Client
approvals and revision requests. - Activity and decision history. -
Payment states: funded, pending, released, refunded, or disputed.

A freelancer can mark work as submitted, but cannot mark it approved on
the client's behalf. A file upload alone does not prove that the work
satisfies the agreed requirements.

### D. AI Progress Intelligence

AI will analyze available project evidence and provide explanations and
recommendations. It is advisory, not the authority for payment
decisions.

#### 1. AI deliverable verification

Compare milestone acceptance criteria with submitted evidence. For
example, identify a missing required page or an unverified feature in a
software project. Clearly distinguish verified, apparently present,
missing, and unverified requirements.

#### 2. Delay and inactivity alerts

Use deadlines, review windows, dependencies, and activity records to
flag possible delays. Start with transparent deterministic rules; only
introduce predictive machine learning if suitable historical data
becomes available.

#### 3. Continuous work analysis

For connected software projects, analyze authorized GitHub commits, pull
requests, changed files, and automated test results to summarize
activity relevant to the milestone. Commit counts alone are not proof of
meaningful progress.

#### 4. Dispute evidence assistant

Organize the agreement, submissions, revision history, test results, and
party statements. Map evidence to acceptance criteria, identify
contradictions or missing information, and prepare a neutral summary for
the reviewer. AI must not autonomously determine who wins a dispute.

Every AI assessment should show the evidence it used, the checks it
could not perform, and its limitations. Neither an AI score nor a risk
alert may independently trigger a payment, refund, or penalty.

### E. Deadline and Inactivity Protection

-   Record delivery deadlines and review windows in the agreement.
-   Send reminders before and after important deadlines.
-   Record overdue submissions and missed review windows.
-   Support agreed extensions through a versioned contract change.
-   Escalate client inactivity through predefined steps.
-   Do not allow a timeout to bypass an open dispute.

Automatic approval after a review period should only be enabled if the
terms clearly provide for it and appropriate safeguards are in place. A
backend scheduler can request a time-dependent transaction, but the
smart contract must check the actual conditions when called.

### F. Versioned Agreements

Every proposed contract change creates a new version. Preserve: -
Original and revised terms. - Deliverables, acceptance criteria, price,
and deadlines. - Who proposed the change and when. - Whether each party
accepted or rejected it. - A reference/hash linking each version to its
predecessor.

A proposed version does not become active until the required parties
accept it. Existing funded amounts must not be silently changed by an
unaccepted proposal.

### G. Tamper-Evident Delivery Proofs

For each submission, record: - Project and milestone identifiers. -
Submitter identity. - Submission timestamp. - Contract version. - File
reference and SHA-256 hash. - Revision number and submission notes. -
Review outcome and related event references.

Store actual files and private evidence off-chain. Store appropriate
hashes, identifiers, and important state-change events on-chain where
justified. A matching hash supports file-integrity verification; it does
**not** prove quality, correctness, authorship, or that the requirements
were met. Use authenticated actions and signatures where appropriate to
establish who approved or submitted something.

### H. Evidence-Based Dispute Resolution

1.  Either party opens a dispute and selects a reason.
2.  The disputed funds are protected from ordinary release.
3.  Both parties submit evidence and responses.
4.  The parties may negotiate a resolution.
5.  If unresolved, an authorized neutral reviewer/arbitrator evaluates
    the evidence against the agreed criteria.
6.  The decision and its rationale/reference are recorded.
7.  An authorized transaction executes the permitted outcome: release,
    refund, or an agreed/authorized split.

For the MVP, use a defined arbitrator role rather than building a
decentralized arbitration network. The contract must enforce role
permissions and valid state transitions. Disputed funds should be
separated from undisputed milestone funds wherever the contract design
permits.

### I. Conditional Payments and Payment Tracking

The smart contract should enforce escrow rules for the payment flow
supported by the demo: - Funds are deposited into the agreement's
escrow. - Milestone amounts and payment states are visible. - Approved
milestones can be paid according to the agreed rules. - Disputed amounts
cannot be released through the normal approval path. - Only authorized
resolution paths can release or refund disputed funds. - Contract events
provide an auditable transaction history.

For the hackathon, use a local chain or EVM-compatible testnet and test
tokens. Do not use real customer funds. The exact payment asset and
chain should be confirmed against hackathon constraints.

------------------------------------------------------------------------

## 4. Proposed User Journey

1.  A client creates a project or links an existing project reference.
2.  The client defines milestones, deliverables, acceptance criteria,
    deadlines, and payment amounts.
3.  The freelancer joins using an invitation link and reviews the terms.
4.  Both parties accept the agreement.
5.  The client funds the agreement in the demo escrow.
6.  The freelancer submits a deliverable.
7.  Fairwork records the submission metadata, file hash, timestamp, and
    applicable contract version.
8.  AI analyzes the evidence and reports what appears satisfied,
    missing, or unverified.
9.  The client approves, requests a revision, or opens a dispute.
10. Deadline and inactivity rules handle missed responses without
    bypassing an open dispute.
11. If a dispute is opened, both parties provide evidence and an
    authorized reviewer records a decision.
12. The smart contract executes a valid payment outcome and the audit
    trail records the result.

The demonstration should show at least one complete lifecycle, including
a disputed milestone and a correctly authorized resolution.

------------------------------------------------------------------------

## 5. Technical Architecture

### Proposed stack

  -----------------------------------------------------------------------
  Layer                   Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Frontend                React + Vite + Tailwind Dashboards, agreement
                          CSS                     builder, submissions,
                                                  AI insights, dispute UI

  Backend                 Node.js + Express       API, authentication,
                                                  workflow orchestration,
                                                  notifications

  Database                PostgreSQL              Users, projects,
                                                  milestones, contract
                                                  versions, submissions,
                                                  disputes, indexed
                                                  events

  Smart contracts         Solidity                Escrow, permissions,
                                                  state transitions,
                                                  valid release/refund
                                                  paths

  Contract development    Hardhat                 Local blockchain,
                                                  deployment, contract
                                                  tests

  Blockchain client       Ethers.js               Frontend/backend
                                                  contract interaction as
                                                  appropriate

  Wallet                  MetaMask                User authorization and
                                                  testnet transactions

  AI                      LLM API plus            Requirement analysis,
                          deterministic checks    evidence summaries,
                                                  risk explanations

  Evidence storage        Private object storage  Deliverables and
                          or IPFS where           evidence;
                          appropriate             access/privacy must be
                                                  considered

  Software evidence       GitHub API with user    Commits, pull requests,
                          authorization           changed files, and test
                                                  evidence
  -----------------------------------------------------------------------

### Architecture rules

-   The backend coordinates actions but must not be able to unilaterally
    release escrow funds.
-   Smart-contract functions must enforce caller permissions, valid
    states, and payment limits.
-   AI output is untrusted input: validate its schema and never execute
    payment decisions directly from model output.
-   Database state and on-chain state must be reconciled; do not assume
    a database write means a blockchain transaction succeeded.
-   Do not store passwords, private keys, confidential files, or
    unnecessary personal data on-chain.
-   Keep API keys and database credentials in environment variables,
    excluded from Git.
-   Protect external integrations with least-privilege scopes and
    explicit consent.

------------------------------------------------------------------------

## 6. Four-Developer Work Split

Ownership is by module, with shared interfaces agreed before parallel
implementation. Each developer should communicate dependencies through
their `devname.md` file, naming the developer they need and the specific
request.

### Developer A --- Frontend and user experience

-   Landing page and project dashboard.
-   Project creation and invitation flow.
-   Agreement/milestone builder and version comparison.
-   Submission timeline and payment status UI.
-   AI insights and dispute screens.

### Developer B --- Backend and database

-   Authentication and role-based access.
-   Project, milestone, contract-version, and submission APIs.
-   PostgreSQL schema and migrations.
-   Notifications, deadline processing, and integration orchestration.
-   GitHub connection and event synchronization as scoped.

### Developer C --- Smart contracts and blockchain

-   Escrow and milestone payment contract.
-   Contract permissions and state transitions.
-   Authorized dispute-resolution execution.
-   Events for agreement versions, submissions, approvals, disputes, and
    transactions.
-   Hardhat tests for unauthorized access, invalid states, and payment
    safety.

### Developer D --- AI, evidence verification, and quality assurance

-   SHA-256 delivery-proof pipeline and submission verification.
-   AI deliverable assessment and evidence-grounded summaries.
-   Delay/inactivity risk rules and AI explanations.
-   Dispute evidence assistant.
-   Integration test plan and end-to-end test coordination.

### Shared integration rules

-   Agree on API schemas, database ownership, contract ABI, event
    formats, milestone states, and error formats before parallel work.
-   Each module must document inputs, outputs, environment variables,
    and how to run tests.
-   Use separate branches and small, reviewable changes.
-   Do not silently change shared interfaces; announce proposed changes
    and coordinate with affected owners.
-   Integrate and test after each phase checkpoint.
-   Keep the main branch runnable.
-   The team controls integration and Git operations; agents must follow
    the team's agreed Git restrictions.

------------------------------------------------------------------------

## 7. Delivery Phases

### Phase 1 --- Specification and shared interfaces

-   Confirm user roles and project lifecycle.
-   Define milestone state machine and payment rules.
-   Finalize database schema, API contract, and smart-contract
    interface.
-   Agree on contract versioning, evidence fields, AI output schema, and
    integration boundaries.
-   Create the initial UI flow and repository/module ownership.

### Phase 2 --- Parallel implementation

-   Build frontend screens and API/database modules.
-   Build the escrow contract and contract tests.
-   Build evidence hashing, AI analysis, deadline rules, and test
    coverage.
-   Use mock responses where needed, with documented interface
    contracts.

### Phase 3 --- Integration

-   Connect frontend to backend APIs.
-   Connect wallet and frontend/backend contract interactions.
-   Synchronize payment and milestone states.
-   Test invitation, agreement acceptance, submission, review, dispute,
    and resolution end to end.
-   Validate GitHub authorization and AI evidence references.

### Phase 4 --- Hardening and demo

-   Test unauthorized release attempts and invalid state transitions.
-   Test revisions, late submissions, inactivity, and open-dispute
    timeouts.
-   Test file-hash verification and audit-history consistency.
-   Check permissions, secrets, input validation, error handling, and
    privacy.
-   Prepare a reliable testnet/local-chain demo and explain which
    integrations are real versus simulated.

------------------------------------------------------------------------

## 8. MVP Scope and Non-Goals

### Must have

-   Client and freelancer roles.
-   Project invitation link.
-   Versioned agreement with milestone terms.
-   Submission records with timestamps and hashes.
-   Shared milestone and payment dashboard.
-   AI evidence assessment with transparent explanations.
-   Deadline/inactivity handling.
-   Dispute case with evidence and authorized resolution.
-   Working demo escrow contract and tests.
-   Auditable history of important actions.

### Build if time permits

-   GitHub OAuth/API integration.
-   Browser extension prototype.
-   Automated test evidence ingestion.
-   Rich contract diff UI.
-   Advanced delay prediction.

### Not part of the initial MVP

-   Replacing Upwork, Freelancer.com, or Fiverr.
-   Claiming official marketplace integration without approval.
-   Circumventing platform rules or moving marketplace payments
    off-platform in violation of terms.
-   Fully decentralized arbitration.
-   Training a custom AI model from scratch.
-   Using AI as the final judge of work quality or as an autonomous
    payment authority.
-   Handling real customer funds.

------------------------------------------------------------------------

## 9. Demo Script

The strongest demo is a single complete story:

1.  A client creates a project with two or three clear milestones.
2.  The freelancer joins via a Fairwork link and both accept the
    contract.
3.  The demo deposits test funds into escrow.
4.  The freelancer submits a deliverable; Fairwork records its hash and
    contract version.
5.  AI checks the acceptance criteria and flags one missing requirement.
6.  The client requests a revision or opens a dispute.
7.  Both parties' evidence appears in the dispute case.
8.  An authorized reviewer records a reasoned decision.
9.  The smart contract releases or refunds the correct amount according
    to the demo's rules.
10. The audit timeline shows the agreement versions, submissions,
    decision, and transaction.

Be explicit during the presentation about which parts use real APIs,
which use testnet transactions, and which are simulated. Do not present
mocked marketplace data as an official integration.

------------------------------------------------------------------------

## 10. Success Criteria

Fairwork is ready for demonstration when: - Both parties can join and
accept the same agreement. - Accepted contract versions cannot be
silently overwritten. - Submissions preserve timestamps, hashes, and
revision history. - Progress status follows the shared state machine. -
AI findings reference available evidence and identify uncertainty. -
Deadline automation cannot bypass an active dispute. - Unauthorized
users cannot approve or release funds. - A disputed milestone cannot be
paid through the normal approval path. - An authorized resolution
executes the correct permitted outcome. - The full lifecycle works
reproducibly in a local environment or testnet.

## Final Product Statement

**Fairwork is an AI-assisted, blockchain-backed project-protection layer
that connects freelance agreements to verifiable work evidence,
transparent dispute resolution, and milestone-based payments. It
complements existing freelance workflows through links and authorized
integrations instead of trying to become another general-purpose
freelance marketplace.**
