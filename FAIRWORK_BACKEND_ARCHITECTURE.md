# Fairwork — Backend Architecture

## 1. Overview

Fairwork is a blockchain-based agreement and milestone-payment platform that helps clients and freelancers manage agreements, deliverables, evidence, disputes, and payments.

### Core stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Smart contracts:** Solidity on an EVM-compatible local chain or testnet
- **Blockchain integration:** Ethers.js
- **Frontend:** React + Vite
- **AI:** Ollama/local model or an approved hosted model API
- **File storage:** Private object storage or an appropriate content-addressed storage solution

The backend should initially be a **modular monolith**: one Express application organized into clear modules. Avoid microservices for the hackathon MVP.

## 2. High-Level Architecture

```text
React + Vite Frontend
        |
        | HTTPS / REST API
        v
Node.js + Express Backend
        |
        +-- Authentication & Authorization
        +-- Users & Roles
        +-- Projects & Invitations
        +-- Agreements & Versioning
        +-- Milestones & Reviews
        +-- Submissions & Evidence
        +-- AI Progress Intelligence
        +-- Disputes
        +-- Payments & Escrow Coordination
        +-- Blockchain Event/Transaction Tracking
        +-- Notifications & Scheduled Jobs
        +-- Audit Logging
        |
        +------ PostgreSQL
        |       Application records and evidence metadata
        |
        +------ Solidity Escrow Contracts
        |       Escrow rules, permitted releases/refunds, on-chain events
        |
        +------ AI Runtime
        |       Evidence assessment, delay-risk alerts, dispute summaries
        |
        +------ Private File Storage
                Deliverables and dispute evidence
```

### Component responsibilities

- **Express backend:** validates requests, enforces authorization, applies business rules, coordinates services, and exposes the API.
- **PostgreSQL:** stores application entities, agreement history, workflow states, evidence metadata, and audit records.
- **Smart contracts:** enforce financial rules on-chain. The backend must not be able to bypass contract authorization.
- **AI service:** produces advisory assessments; it must not make final dispute decisions or independently authorize payments.
- **File storage:** stores private submissions and attachments. Store references and cryptographic hashes in PostgreSQL; record on-chain data only where justified.

## 3. Backend Modules

| Module | Responsibilities |
|---|---|
| Authentication | Registration, login, password hashing, JWT handling |
| Authorization | Role checks and project-level access checks |
| Users | Client, freelancer, and arbitrator profiles |
| Projects | Project creation, participant relationships, invitations, external project links |
| Agreements | Versioned terms, explicit acceptance, change proposals, history |
| Milestones | Deliverables, acceptance criteria, deadlines, review windows, state transitions |
| Submissions | Submission metadata, revision tracking, file references, SHA-256 hashes |
| Reviews | Approval, revision requests, feedback |
| AI Intelligence | Criteria/evidence assessment, inactivity alerts, dispute summaries |
| Disputes | Case creation, evidence collection, arbitrator decisions, outcome coordination |
| Blockchain | Contract interaction, transaction submission, receipt verification, event tracking |
| Payments | Escrow state display, transaction history, release/refund coordination |
| Notifications | Deadline reminders, review-window alerts, inactivity escalation |
| Audit | Append-only application history of significant actions |

Keep modules in one backend process for the MVP. Each module should have a clear interface so developers can work in parallel.

## 4. PostgreSQL Data Model

Suggested core tables:

| Table | Important fields |
|---|---|
| `users` | `id`, `name`, `email`, `password_hash`, `role`, `wallet_address` |
| `projects` | `id`, `title`, `description`, `client_id`, `freelancer_id`, `external_url`, `status` |
| `agreements` | `id`, `project_id`, `version`, `terms`, `status`, `created_by` |
| `agreement_acceptances` | `agreement_id`, `user_id`, `accepted_at`, `signature_ref` |
| `milestones` | `id`, `project_id`, `title`, `criteria`, `amount`, `due_date`, `status` |
| `submissions` | `id`, `milestone_id`, `submitted_by`, `file_ref`, `sha256_hash`, `revision`, `submitted_at` |
| `reviews` | `id`, `submission_id`, `reviewer_id`, `decision`, `feedback`, `created_at` |
| `disputes` | `id`, `milestone_id`, `opened_by`, `reason`, `status`, `decision`, `arbitrator_id` |
| `evidence` | `id`, `dispute_id`, `uploaded_by`, `file_ref`, `sha256_hash`, `created_at` |
| `payments` | `id`, `project_id`, `milestone_id`, `amount`, `escrow_address`, `tx_hash`, `status` |
| `audit_logs` | `id`, `actor_id`, `project_id`, `action`, `metadata`, `created_at` |
| `notifications` | `id`, `user_id`, `type`, `message`, `read_at`, `created_at` |

### Database rules

- Use UUIDs for application entity IDs.
- Store password hashes, never plaintext passwords.
- Enforce foreign keys and appropriate unique constraints.
- Ensure agreement versions are unique within each project.
- Prevent duplicate acceptance records for the same user and agreement version.
- Represent money with integer token base units or an exact numeric type; do not use floating-point arithmetic.
- Keep audit records append-only at the application level.
- Store file contents outside PostgreSQL; store private file references and hashes.
- Use database transactions when a business operation changes multiple related records.
- Treat blockchain data as authoritative for on-chain balances and settlement; PostgreSQL is an application index/cache, not the source of truth for funds.

## 5. REST API

Use `/api/v1` as the API prefix.

| Resource | Example endpoints |
|---|---|
| Authentication | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Projects | `GET /projects`, `POST /projects`, `GET /projects/:id`, `POST /projects/:id/invitations` |
| Agreements | `POST /projects/:id/agreements`, `POST /agreements/:id/accept`, `POST /agreements/:id/propose-change` |
| Milestones | `POST /projects/:id/milestones`, `GET /milestones/:id`, `PATCH /milestones/:id/status` |
| Submissions | `POST /milestones/:id/submissions`, `POST /submissions/:id/review` |
| AI | `POST /submissions/:id/assess`, `GET /projects/:id/risk-assessment` |
| Disputes | `POST /milestones/:id/disputes`, `POST /disputes/:id/evidence`, `POST /disputes/:id/decision` |
| Payments | `GET /projects/:id/payments`, `GET /payments/:id`, `POST /payments/:id/sync` |
| Audit/activity | `GET /projects/:id/activity` |

These are proposed API contracts, not implemented endpoints. Final request/response schemas should be agreed on before parallel development.

### API requirements

- Authenticate protected routes.
- Authorize both the user's role and their relationship to the requested project.
- Validate request bodies, query parameters, and path IDs.
- Use consistent HTTP status codes and error response formats.
- Add pagination to list endpoints.
- Apply rate limiting to authentication and other sensitive endpoints.
- Never expose passwords, private evidence, API keys, or internal errors.
- Use idempotency protections for operations that can trigger payments or duplicate transactions.

## 6. Core Workflows

### A. Agreement and escrow funding

1. A client creates a project and proposes milestone terms.
2. The freelancer reviews and accepts the agreement version.
3. The backend records each party's acceptance.
4. The client funds the escrow contract from their wallet.
5. The backend verifies the transaction receipt and relevant contract event.
6. The payment view shows funding as confirmed only after verification.

A database acceptance record is not, by itself, proof that the agreement was cryptographically signed or that escrow was funded. Clearly distinguish recorded acceptance from wallet signatures if the MVP does not implement on-chain signatures.

### B. Submission, review, and release

1. The freelancer submits deliverables.
2. The backend checks permissions, validates the request, stores file metadata, and calculates a SHA-256 hash.
3. The AI service may assess evidence against the milestone's acceptance criteria.
4. The client approves, requests revisions, or opens a dispute.
5. If the smart contract's release conditions are satisfied, the authorized party or contract workflow initiates release.
6. The backend verifies the transaction receipt and updates the payment display.

A hash helps detect whether a file changed; it does not prove quality, authorship, or correctness.

### C. Dispute resolution

1. An authorized party opens a dispute and submits evidence.
2. The application records the case and requests the contract's dispute-protection path, where implemented.
3. AI can summarize claims, evidence, missing information, and possible contradictions.
4. An authorized arbitrator reviews the evidence and records a decision.
5. The contract executes only an outcome allowed by its rules, such as release, refund, or split.
6. The backend verifies the transaction and records the outcome.

Do not let AI make the final decision or directly transfer funds. Do not imply that funds are locked unless the contract actually enforces that state.

## 7. Smart-Contract Boundary

The Solidity escrow contract should enforce the financial rules that matter:

- Who may fund an agreement and the required amount.
- Which milestone funds are available for release.
- Conditions for release, refund, and dispute resolution.
- Which address or role is authorized to resolve a dispute.
- Prevention of duplicate releases and unauthorized withdrawals.
- Deadline and review-window behavior, if included in the contract.

The backend can prepare transactions and monitor events, but it cannot override contract checks. Do not treat a frontend action or a PostgreSQL status update as proof of payment.

For the hackathon, use a local EVM chain or testnet with test tokens. Clearly label simulated functionality and do not use real customer funds.

## 8. AI Service Design

Keep AI calls behind a dedicated backend module.

```text
Submission + Acceptance Criteria
              |
              v
Evidence Preparation
  - check access and file type
  - extract permitted text/metadata
  - select relevant evidence
              |
              v
AI Adapter
  - local Ollama model or approved hosted API
              |
              v
Structured Assessment
  - criteria and findings
  - evidence references
  - uncertainty / missing information
              |
              v
Schema Validation + Storage
              |
              v
Display to Authorized Users
```

Start with three capabilities:

1. **Acceptance-criteria assessment:** identify which requirements appear present, missing, or unverified.
2. **Delay/inactivity alerts:** begin with deterministic rules; do not claim predictive ML without enough validated historical data.
3. **Dispute-evidence summary:** organize claims and evidence for the human reviewer.

Requirements for AI outputs:

- Validate output against a schema.
- Include references to the evidence used.
- Represent uncertainty and missing information.
- Do not treat a model's conclusion as ground truth.
- Do not allow AI output to trigger a payment or final dispute outcome.
- Do not send private evidence to an external model without appropriate authorization and disclosure.

## 9. Suggested Folder Structure

```text
backend/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   ├── middleware/
│   │   ├── authenticate.js
│   │   ├── authorize.js
│   │   └── errorHandler.js
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── projects/
│   │   ├── agreements/
│   │   ├── milestones/
│   │   ├── submissions/
│   │   ├── reviews/
│   │   ├── ai/
│   │   ├── disputes/
│   │   ├── payments/
│   │   ├── blockchain/
│   │   ├── notifications/
│   │   └── audit/
│   ├── jobs/
│   ├── db/
│   │   ├── migrations/
│   │   └── seed.js
│   └── utils/
├── tests/
│   ├── unit/
│   └── integration/
├── .env.example
├── .gitignore
└── package.json

contracts/
├── contracts/
├── scripts/
└── test/
```

A typical module can contain:

```text
projects/
├── project.routes.js
├── project.controller.js
├── project.service.js
├── project.repository.js
└── project.validation.js
```

- **Routes:** URL and middleware wiring.
- **Controller:** HTTP request/response handling.
- **Service:** business rules and workflow coordination.
- **Repository:** database queries.
- **Validation:** input schemas and validation rules.

## 10. Security and Reliability Checklist

- [ ] Hash passwords with a suitable password-hashing algorithm.
- [ ] Keep secrets in environment variables; commit only `.env.example`.
- [ ] Validate JWTs and enforce roles plus project-level permissions.
- [ ] Validate uploaded file types, sizes, and access permissions.
- [ ] Keep private evidence private and use short-lived access links where suitable.
- [ ] Verify blockchain receipts, chain ID, contract address, and emitted events.
- [ ] Make payment-related operations idempotent and protect against replay/duplicate processing.
- [ ] Handle transaction failures and pending states without falsely reporting success.
- [ ] Use a reliable scheduler for reminders; ensure jobs are safe to run more than once.
- [ ] Test unauthorized access, invalid transitions, duplicate releases, and dispute/payment edge cases.
- [ ] Log significant actions without logging secrets or sensitive evidence contents.
- [ ] Clearly label testnet and simulated transactions in the UI.

## 11. Four-Developer Integration Plan

Integrate after each phase rather than waiting until all modules are finished.

| Phase | Shared deliverable |
|---|---|
| 1. Foundation | Repository conventions, API error format, migrations, database connection, authentication and roles |
| 2. Agreements | Projects, invitations, agreement versioning, acceptances and milestones |
| 3. Delivery | Submissions, file references, hashes, reviews and audit history |
| 4. Protection | AI assessments, disputes, deadline jobs and payment coordination |
| 5. End-to-end integration | Smart-contract tests, authorization checks, failure handling and demo seed data |

Before parallel work begins, agree on:

- Route names and request/response schemas.
- Database table ownership and migration naming.
- Shared milestone and payment status enums.
- Error response format.
- Environment variable names.
- Test commands and branch/integration rules.

## 12. Recommended MVP Order

Build one complete end-to-end path before expanding scope:

1. Register/login and role-based access.
2. Create a project and invite the other party.
3. Create and accept a versioned agreement.
4. Create and fund one milestone using test escrow.
5. Submit evidence and record its hash.
6. Approve the submission and release test funds.
7. Verify the blockchain receipt and display the transaction.
8. Add dispute handling.
9. Add AI assessment and notifications.
10. Add optional GitHub or other external integrations if time remains.

**Definition of done:** the team can demonstrate a complete testnet/local-chain milestone lifecycle, with correct authorization, persistent records, evidence integrity checks, verified payment state, and clear handling of errors and disputes.
