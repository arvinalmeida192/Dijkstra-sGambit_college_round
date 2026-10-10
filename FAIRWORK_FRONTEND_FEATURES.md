# Fairwork — Frontend Features & Page Plan

## Product Goal
Fairwork is a project-protection layer for freelance work. It helps clients and freelancers agree on milestones, track deliverables, review AI-generated progress insights, resolve disputes, and see payment status.

## Pages (8 total)

| # | Page | Purpose |
|---|---|---|
| 1 | **Landing Page** (`/`) | Explain Fairwork, show key benefits, and let users sign in, get started, or join through an invitation link. |
| 2 | **Authentication** (`/login`, `/register`) | Sign in or create an account. Support client and freelancer roles; use a shared form where practical. |
| 3 | **Dashboard** (`/dashboard`) | Overview of active projects, milestone statuses, upcoming deadlines, alerts, disputed items, and payment summaries. |
| 4 | **Projects** (`/projects`, `/projects/new`, `/projects/:id`) | List projects, create a project, link an external project URL, invite the other party, and view project milestones and activity. |
| 5 | **Agreement & Milestones** (`/projects/:id/agreement`) | Define deliverables, acceptance criteria, deadlines, review windows, and payment amounts. Show contract versions, changes, and both parties’ acceptance status. |
| 6 | **Submission & Progress** (`/projects/:id/progress`) | Submit deliverables or links; display timestamps, revisions, milestone status, evidence hashes, review actions, and AI progress assessments. |
| 7 | **Disputes** (`/projects/:id/disputes`) | Open a dispute, submit evidence, view both parties’ claims, see the AI evidence summary, and show the reviewer’s decision and resolution status. |
| 8 | **Payments & Activity** (`/projects/:id/payments`) | Show escrow/funding state, pending/released/refunded/disputed amounts, transaction references, and an auditable timeline of agreement, submission, review, dispute, and payment events. |

## Frontend Features to Show

### 1. Project connection and collaboration
- Create a Fairwork project or link an existing project using its URL/reference.
- Generate and copy an invitation link for the other party.
- Show project participants and their roles.
- Clearly label external-platform links as references unless an official integration is connected.

### 2. Milestone-based agreements
- Create and edit milestone drafts with deliverables, acceptance criteria, deadline, review window, and payment amount.
- Display agreement versions and a change comparison.
- Show each party’s acceptance status.
- Make it clear that proposed changes are not active until accepted by the required parties.

### 3. Progress tracking
- Display milestones as `Pending`, `In Progress`, `Submitted`, `In Review`, `Revision Requested`, `Approved`, or `Disputed`.
- Show due dates, overdue indicators, submission history, revisions, and recent activity.
- Let freelancers submit files, links, notes, and revision versions.
- Let clients approve, request revisions, or open a dispute.
- Never let the freelancer mark their own submission as client-approved.

### 4. AI Progress Intelligence
- Show a per-requirement assessment: `Verified`, `Appears Present`, `Missing`, or `Unverified`.
- Display evidence references and a short explanation for each finding.
- Show potential delay/inactivity alerts with reasons.
- For connected software projects, show relevant GitHub activity and available test results.
- Provide an AI dispute summary that highlights claims, supporting evidence, contradictions, and missing information.
- Clearly label AI output as advisory; it must not make final payment or dispute decisions.

### 5. Deadline and inactivity protection
- Display delivery deadlines, review windows, reminders, overdue states, and agreed extensions.
- Show the next expected action and who is responsible.
- Show escalation status when a party has not responded.
- Never imply that a timeout bypasses an open dispute.

### 6. Delivery proof and audit history
- Show who submitted what, when, and against which agreement version.
- Display revision number, file/link reference, and SHA-256 hash where applicable.
- Show a chronological, read-only activity timeline for important changes, reviews, dispute decisions, and transactions.
- Explain that a file hash verifies integrity, not quality or correctness.

### 7. Dispute resolution
- Let either party open a dispute and select a reason.
- Provide forms for evidence uploads, links, statements, and responses.
- Show negotiation status and authorized reviewer assignment/status.
- Display the recorded decision, rationale/reference, and resolution status.
- Show that disputed funds are protected from ordinary release while the dispute is open.

### 8. Payment tracking
- Show funded, pending, released, refunded, and disputed amounts per milestone.
- Display escrow status and transaction references.
- Show available actions according to the user’s role and current milestone state.
- For the demo, clearly identify testnet or simulated transactions; do not suggest real funds are being handled.

## Shared UI Requirements
- Role-aware views for **Client**, **Freelancer**, and **Arbitrator/Reviewer**.
- Clear loading, empty, success, and error states.
- Responsive layout for desktop and mobile.
- Forms should validate required fields and prevent invalid state transitions.
- Use a consistent milestone status vocabulary across every page.
- Provide accessible labels, readable contrast, and clear confirmation for consequential actions.
- Never display private evidence to users who lack permission.

## MVP Priorities
1. Dashboard and project creation/invitation.
2. Agreement and milestone builder with acceptance states.
3. Submission/progress timeline and AI assessment panel.
4. Dispute case and reviewer decision view.
5. Payment/activity page showing demo escrow states and transaction history.

## Frontend Boundaries
- The frontend displays AI assessments but does not trust them as executable instructions.
- Payment actions must be confirmed by the backend/smart contract and reflected only after the actual result is known.
- Do not claim marketplace API integration unless it has been implemented and authorized.
- A project URL or browser-extension shortcut is not itself an integration.
