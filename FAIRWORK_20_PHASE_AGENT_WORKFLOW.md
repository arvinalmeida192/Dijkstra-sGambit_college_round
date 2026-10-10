# Fairwork — 20-Phase Agent Implementation Plan

> **Purpose:** This file is the operating manual for the coding agent. The human should be able to say **“Implement Phase 01”**, **“Implement Phase 02”**, and so on. The agent must identify the matching phase below, follow its instructions, implement only that phase, verify it, and stop.

## 0. How the Agent Must Operate

### The one-command workflow

When the human says `Implement Phase NN`:

1. Read this file from the beginning, including the global rules and the requested phase.
2. Inspect the current repository, existing implementation, relevant documentation, and `git status` before editing.
3. Identify the exact goal, dependencies, allowed scope, acceptance criteria, and tests for that phase.
4. Briefly report the plan and files expected to change.
5. Implement **only the requested phase**.
6. Reuse existing components, functions, utilities, types, services, validators, and patterns wherever possible.
7. Run the available relevant tests, checks, and build commands.
8. Inspect the final diff and changed-file list for accidental changes, duplication, generated clutter, and scope creep.
9. Report what changed, files touched, checks run and their results, known limitations, and whether the phase is ready for human review.
10. **Stop. Do not begin the next phase until the human explicitly asks.**

If the human says “Implement Phase 01” and Phase 01 is already complete, inspect the repository and report that it appears complete. Do not rebuild it unnecessarily. If only part of it is missing, implement only the missing part.

### If blocked

- Ask one concise question if a decision genuinely blocks safe implementation.
- If a dependency from an earlier phase is missing, report the blocker and the exact prerequisite. Do not silently implement a substitute architecture.
- If the requested phase conflicts with the current repository or an approved interface, explain the conflict before making broad changes.
- Do not invent requirements, endpoints, tables, pages, packages, or integrations to fill gaps.
- If a required tool, credential, design export, wallet, chain, model, or external service is unavailable, implement only the parts possible within the approved scope and clearly label the remaining work. Do not fake success.

---

## 1. Global Agent Rules

### A. Reuse first

Before creating code, search for an existing implementation that can be extended.

- Reuse shared React components instead of creating another button, modal, form field, card, badge, navbar, sidebar, or loader.
- Reuse existing functions, hooks, API clients, services, repositories, validators, types, and constants.
- If a component or function is almost suitable, extend it carefully instead of copying it.
- Keep shared business rules in one place. Do not duplicate status-transition logic across UI components and backend controllers.
- Use existing project conventions and libraries. Do not add a dependency without explaining why it is necessary and receiving human approval.
- Do not create wrappers, managers, factories, abstractions, or helper files without a concrete need.
- Do not create placeholder files, duplicate modules, unused components, speculative routes, or TODO-only implementations.

### B. Keep changes small and controlled

- One phase at a time; one bounded task within that phase at a time.
- Do not generate the entire application from one prompt.
- Do not rewrite whole directories when a small change is enough.
- Do not modify unrelated files or erase existing work.
- Before editing, list the files expected to change and the reason for each.
- If scope grows unexpectedly, stop and ask for approval.
- Keep code readable and proportionate to the feature.
- Avoid unnecessary comments, excessive defensive layers, and overengineering.

### C. Human-controlled Git

The agent must **not** run Git state-changing commands, including `git add`, `git commit`, `git push`, `git merge`, `git rebase`, `git switch`, `git checkout`, `git reset`, `git cherry-pick`, or `git stash`. Do not create branches or worktrees.

Read-only inspection such as `git status`, `git diff`, and `git log` is allowed. The human handles all branch, commit, and integration operations.

### D. Quality and security

- Follow the approved Fairwork architecture and current repository conventions.
- Validate inputs on both client and server where appropriate.
- Enforce authentication, role permissions, and project-level access in backend routes.
- Never store plaintext passwords or commit credentials.
- Keep private submissions and dispute evidence private.
- Use exact arithmetic for token amounts; never use JavaScript floating-point arithmetic for money calculations.
- Do not trust client-supplied roles, prices, approval states, transaction statuses, or AI conclusions.
- Verify blockchain receipts and relevant contract events before displaying settlement as confirmed.
- AI is advisory only. It must not make final dispute decisions or independently authorize transfers.
- A file hash helps detect file changes; it does not prove authorship, quality, or correctness.
- Clearly label mocked/simulated services. Never represent a mock transaction as real.
- Add or update focused tests for behavior changed by the phase.
- Never claim tests passed unless they were actually run.

### E. Phase boundaries

- Implement the requested phase only.
- Do not proceed to the next phase automatically.
- Do not silently change an earlier phase's approved API, schema, UI contract, or status enum.
- If a shared interface needs changing, explain why, list affected modules, and wait for approval.
- Keep documentation aligned with the code, but do not rewrite unrelated documentation.
- The phase's acceptance criteria are the definition of done.

---

## 2. Stitch Design ZIP Instructions

The human will export the UI designed in Stitch as a ZIP and make it available in the repository or attach it to the coding session.

1. Search the workspace for the supplied Stitch ZIP or extracted design files. Do not assume filenames or file formats.
2. If the ZIP is in the repository, inspect its file listing before extracting or copying anything. Do not overwrite application files blindly.
3. Use the design assets as references. Inspect the available page designs, styles, assets, typography, colors, spacing, and component patterns.
4. Do not treat generated Stitch code as permission to replace the existing project wholesale.
5. Map the designs to the approved Fairwork pages and identify shared elements.
6. Create a concise design inventory: pages, tokens, shared components, assets, interactions, responsive behavior, and missing states.
7. If the ZIP is absent or cannot be read, stop the design-dependent work and tell the human exactly what is missing.
8. Reuse approved assets where possible. Do not add unrelated stock images, icons, fonts, or visual effects.
9. If the design omits loading, empty, error, validation, or responsive states, propose minimal consistent states and ask for approval if they materially affect the design.
10. Before building all pages, propose a reusable component inventory and wait for human approval.

---

## 3. Fairwork Scope and Technical Boundaries

Fairwork helps clients and freelancers manage project agreements, milestones, submissions, evidence, disputes, and milestone payments.

Expected stack, unless the existing approved repository says otherwise:

- Frontend: React + Vite.
- Backend: Node.js + Express.
- Database: PostgreSQL.
- Smart contracts: Solidity on a local EVM chain or testnet.
- Blockchain client: Ethers.js.
- AI: an Ollama/local model or an approved hosted model API.
- File storage: private storage for deliverables and dispute evidence.

Use a **modular monolith** for the backend. Do not introduce microservices for the MVP.

### Important business rules

- A freelancer may submit work but cannot approve their own submission.
- Agreement changes create a new version; previous accepted versions remain visible.
- A proposed change is not active until the required parties accept it.
- Milestone status transitions must follow the agreed state machine.
- AI assessments are advisory; a human-authorized workflow decides disputes.
- A PostgreSQL status update is not proof of a blockchain payment.
- Do not claim control over external freelance marketplace contracts or payments without authorized integration.
- Use testnet/local-chain funds and clearly labelled simulations for the hackathon.

### Suggested milestone states

Use the repository's existing agreed enum if one exists. Otherwise, propose and approve a shared enum before implementation. The intended workflow includes:

`PENDING → IN_PROGRESS → SUBMITTED → IN_REVIEW → APPROVED`

Possible branches include `REVISION_REQUESTED` and `DISPUTED`. Do not independently introduce different spellings or transitions in separate modules.

---

## 4. The 20 Phases

Phases are deliberately small. Each phase has a goal, scope, and acceptance criteria. Do not expand a phase just because more work seems useful.

### Phase 01 — Repository Reconnaissance and Baseline

**Goal:** Understand the existing repository before changing it.

**Do:**
- Inspect the folder structure, package files, existing app entry points, documentation, tests, and current Git status.
- Identify what already works and what is missing.
- Identify the actual frontend/backend/contract directories rather than assuming paths.
- Report the current stack, run commands, baseline test/build status, and major blockers.
- Create no new architecture or feature implementation unless a tiny, explicitly approved setup correction is necessary.

**Acceptance criteria:**
- A concise baseline report is provided.
- Existing work is preserved.
- No broad code changes are made.
- The next phase's prerequisites are clear.

### Phase 02 — Inspect Stitch ZIP and Map the Design

**Goal:** Turn the supplied Stitch export into a usable UI reference.

**Do:**
- Locate and inspect the Stitch ZIP or extracted files.
- Inventory the page designs, assets, styles, typography, colors, layout, and interactions.
- Map designs to the Fairwork pages: landing, authentication, dashboard, projects, agreement/milestones, submission/progress, disputes, and payments/activity.
- Identify missing screens or states without inventing a new design system.
- Record the design inventory in a small Markdown file in the agreed documentation location.

**Acceptance criteria:**
- The design assets and page mapping are documented.
- Missing or unreadable files are reported.
- No full UI implementation is generated yet.

### Phase 03 — Propose and Approve the Reusable UI System

**Goal:** Identify shared UI components before page-by-page implementation.

**Do:**
- Review the Stitch designs and existing repository.
- Propose design tokens and reusable components, such as buttons, inputs, cards, badges, dialogs, navigation, status indicators, loading states, and page containers, only where actually repeated.
- Define component responsibilities and props at a practical level.
- Identify existing components that should be reused instead of recreated.
- Record the proposal and wait for human approval before implementing the component system.

**Acceptance criteria:**
- A concise component inventory is ready.
- Duplicates and unnecessary abstractions are avoided.
- Human approval is obtained before proceeding.

### Phase 04 — Implement Approved Design Tokens and Shared Components

**Goal:** Implement only the approved reusable UI foundation.

**Do:**
- Add or update the shared styles/tokens and the approved reusable components.
- Reuse existing components wherever possible.
- Add a minimal demo or existing-page integration to verify the components.
- Include focus, disabled, loading, and error states where relevant to the component.

**Acceptance criteria:**
- Shared components render and build successfully.
- No duplicate component library has been created.
- The result follows the approved Stitch reference.
- Relevant checks pass.

### Phase 05 — App Shell and Routing

**Goal:** Create the common application layout and route structure.

**Do:**
- Implement or adapt the shared layout, navigation, page container, and approved routes.
- Reuse the Phase 04 components.
- Add route placeholders only for the approved pages and only as needed to connect navigation.
- Keep authentication enforcement for the auth phase; do not pretend protected routes are secure until backend authorization exists.

**Acceptance criteria:**
- Approved routes navigate correctly.
- Shared layout is consistent and responsive.
- No duplicate layout or navigation implementations exist.

### Phase 06 — Landing and Authentication UI

**Goal:** Implement the designed public landing, login, and registration screens.

**Do:**
- Match the Stitch design using approved shared components.
- Add form validation and loading/error/success UI states.
- Support the approved client/freelancer roles in registration only if included in the requirements.
- Use the agreed API client contract; if the backend is not ready, keep the integration boundary explicit and do not fabricate a successful login.

**Acceptance criteria:**
- Screens match the design and work responsively.
- Forms validate inputs and display failures correctly.
- Mock behavior, if temporarily used, is visibly identified and easy to replace.

### Phase 07 — Backend Foundation and Authentication

**Goal:** Implement the minimum backend foundation and real authentication.

**Do:**
- Follow the existing server structure; add only missing configuration, database access, validation, error handling, and auth routes.
- Implement secure password hashing and authentication.
- Enforce approved roles and project-level authorization patterns.
- Add environment variable examples without real secrets.
- Add focused auth tests.

**Acceptance criteria:**
- Server starts using documented commands.
- Registration/login and authenticated identity retrieval work with PostgreSQL.
- Invalid credentials and unauthorized requests fail correctly.
- Secrets are not committed.

### Phase 08 — Projects and Invitations API

**Goal:** Implement the project domain and invitation flow.

**Do:**
- Add or update project schema/migrations and repository/service/controller/routes following existing conventions.
- Support project creation, listing, details, participant access, and approved invitation behavior.
- Allow an external project URL/reference but do not claim that Fairwork controls the external platform.
- Validate ownership and participant permissions.
- Add tests for authorized and unauthorized access.

**Acceptance criteria:**
- Project records persist in PostgreSQL.
- Only authorized users can read or modify project data.
- API behavior and error responses are documented.

### Phase 09 — Projects UI and API Integration

**Goal:** Connect the approved project pages to the real projects API.

**Do:**
- Implement project list, create-project form, project details, and invitation UI that are present in the approved designs.
- Reuse Phase 04 components and the shared API client.
- Handle loading, empty, success, and error states.
- Do not add project features absent from the approved requirements.

**Acceptance criteria:**
- A user can create and view an authorized project through the UI.
- Data comes from the API rather than hardcoded sample arrays in normal operation.
- UI matches Stitch and tests/checks pass.

### Phase 10 — Versioned Agreements API

**Goal:** Implement agreement versions and explicit acceptance.

**Do:**
- Add or update agreement schema, migrations, service, repository, and routes.
- Support creating a version, retrieving history, proposing a change, and recording acceptance by the required parties.
- Preserve previous versions.
- Ensure a proposed version does not replace the active accepted version prematurely.
- Add tests for duplicate acceptance, unauthorized access, and version transitions.

**Acceptance criteria:**
- Agreement history is preserved and ordered.
- Required acceptances are tracked against the correct version.
- Invalid or unauthorized transitions are rejected.

### Phase 11 — Agreement UI

**Goal:** Connect agreement creation, review, version history, and acceptance to the API.

**Do:**
- Implement the approved agreement/milestone terms screen using existing components.
- Show the active version, proposed changes, acceptance status, and previous versions as supported by the API.
- Make acceptance explicit and show errors or pending states.
- Do not imply a cryptographic wallet signature if only application-level acceptance is implemented.

**Acceptance criteria:**
- The user can inspect terms and version history.
- Acceptance status reflects API data.
- Proposed changes are clearly distinguished from active accepted terms.

### Phase 12 — Milestone API and State Transitions

**Goal:** Implement milestone records and one consistent workflow.

**Do:**
- Add or update milestone schema and CRUD routes for approved operations.
- Implement deadlines, amount, deliverables, acceptance criteria, review windows, and status changes as defined in the requirements.
- Centralize state-transition validation in one service/function and reuse it.
- Prevent a freelancer from approving their own submission.
- Add tests for valid/invalid transitions, permissions, and deadline edge cases.

**Acceptance criteria:**
- Milestone state transitions are enforced on the server.
- The state enum is shared and consistent.
- Unauthorized and invalid operations fail safely.

### Phase 13 — Milestone UI

**Goal:** Connect milestone creation and progress views to the real API.

**Do:**
- Implement the approved milestone list/detail/forms.
- Display status, due date, amount, criteria, review state, and available actions based on role and server state.
- Reuse shared status badges, cards, forms, and date/amount formatting functions.
- Never rely on hidden buttons as the only authorization check.

**Acceptance criteria:**
- Milestones can be created and viewed according to permissions.
- Status labels and actions match the backend state.
- Loading, empty, validation, and error states work.

### Phase 14 — Submissions, Evidence Metadata, and Reviews API

**Goal:** Implement deliverable submission and review records.

**Do:**
- Support submission creation, revision tracking, file references, timestamps, and SHA-256 hashing.
- Use the agreed private storage approach if upload support is available; do not expose private files publicly.
- Support client review, approval, and revision requests under the agreed state machine.
- Store evidence metadata and audit-relevant events.
- Add tests for hash calculation, revision handling, permissions, and review transitions.

**Acceptance criteria:**
- Submissions are associated with the correct milestone and submitter.
- Hashes are calculated from file bytes, not trusted from client input.
- Review actions are authorized and recorded.
- Private evidence is protected.

### Phase 15 — Submission and Progress UI

**Goal:** Connect submission, revision, review, and evidence display to the API.

**Do:**
- Implement submission forms, revision history, file/link references, review feedback, and approve/request-revision actions as supported by the API.
- Display AI assessment only if an actual assessment endpoint exists; otherwise show a clearly marked unavailable state, not fabricated findings.
- Reuse existing forms, status badges, dialogs, and feedback components.
- Explain that a hash checks integrity, not quality or authorship.

**Acceptance criteria:**
- The user can submit and review a milestone through the UI.
- Revision history and statuses reflect backend records.
- Role restrictions and failure states are clear.

### Phase 16 — Escrow Smart Contract and Tests

**Goal:** Implement the smallest tested escrow contract for the agreed MVP.

**Do:**
- Inspect existing contract code and tests before writing new contracts.
- Agree on and implement only required funding, milestone release, refund, and dispute-protection behavior.
- Apply access control, correct token units, and protection against duplicate release/withdrawal.
- Emit events needed for backend tracking.
- Add unit tests for authorized and unauthorized operations, duplicate actions, and relevant edge cases.
- Use local chain/testnet and test tokens.

**Acceptance criteria:**
- Contract behavior is covered by tests.
- Unauthorized or repeated financial actions fail.
- No claim is made that funds are protected unless contract logic enforces it.
- Do not deploy to a public network or use real funds without explicit approval.

### Phase 17 — Blockchain Backend Integration and Payment Tracking

**Goal:** Connect the backend to the contract and accurately report transaction status.

**Do:**
- Use the existing approved Ethers.js setup and contract interface.
- Verify chain ID, contract address, receipt status, and relevant emitted events.
- Record transaction hashes and reconciliation metadata.
- Distinguish pending, failed, confirmed, refunded, and disputed states as supported by the contract.
- Make sync/retry operations safe against duplicate processing.
- Never trust a client-provided transaction status.

**Acceptance criteria:**
- Payment status changes only after appropriate verification.
- Failed/pending transactions are represented honestly.
- Tests cover invalid chain/contract configuration and failed transactions.

### Phase 18 — Payments UI and Dispute Workflow

**Goal:** Present payment states and implement the core dispute process.

**Do:**
- Implement the approved payment history/status UI using verified backend data.
- Implement dispute creation, evidence references, case status, reviewer assignment/decision, and permitted outcome coordination as supported by the API and contract.
- Keep disputed funds protected only where the contract supports it.
- Show testnet or simulated labels clearly.
- Add tests for access control, evidence privacy, and allowed dispute transitions.

**Acceptance criteria:**
- Users can see accurate payment states and authorized dispute details.
- Dispute decisions are attributable to an authorized human role.
- The UI does not imply that AI or a database update directly moved funds.

### Phase 19 — AI Assessment and Deadline Notifications

**Goal:** Add bounded AI assistance and deterministic deadline reminders.

**Do:**
- Implement an AI adapter for the approved local model or hosted API, if configured.
- Start with acceptance-criteria assessment and dispute-evidence summaries.
- Validate structured output and store assessment provenance, evidence references, and uncertainty.
- Keep AI advisory only; it cannot approve milestones, decide disputes, or initiate payment.
- Implement deadline/inactivity alerts using deterministic rules and a safe scheduled-job pattern.
- Make scheduled jobs idempotent and test repeat execution.
- If model credentials or runtime are unavailable, implement the interface and tests only where approved, and report the limitation rather than fabricating output.

**Acceptance criteria:**
- AI output is validated and visibly advisory.
- Deadline rules are deterministic and tested.
- No AI result directly authorizes a financial action.
- Notification jobs do not create uncontrolled duplicates.

### Phase 20 — End-to-End Integration, Security Review, and Demo Readiness

**Goal:** Verify the full Fairwork MVP lifecycle.

**Do:**
- Run the documented build, lint, unit, integration, and contract test commands.
- Fix only defects within approved scope; report broader changes for approval.
- Test the end-to-end path: register/login → create project → accept agreement → create/fund milestone on local chain/testnet → submit evidence → review/approve → verify release → inspect activity history.
- Test a dispute path where implemented.
- Verify role authorization, private evidence access, transaction verification, error states, and mocked-service labels.
- Check that UI matches the Stitch export.
- Update setup instructions, environment variable examples, test commands, known limitations, and demo steps.
- Produce a concise final status report.

**Acceptance criteria:**
- The main demo path works from start to finish in the documented environment.
- All executed tests and their results are reported accurately.
- Remaining defects and mocked features are listed explicitly.
- No unrelated rewrites or unapproved features were added.

---

## 5. Required Response Format After Each Phase

After finishing a phase, respond using this format:

```md
## Phase NN — <Name>
- Status: COMPLETE / PARTIAL / BLOCKED
- Implemented:
  - ...
- Files changed:
  - `path/to/file` — reason
- Reused:
  - Existing components/functions/services reused
- Checks run:
  - `command` — PASS/FAIL/NOT RUN
- Acceptance criteria:
  - PASS/FAIL with brief evidence
- Known issues / blockers:
  - ...
- Human review needed:
  - ...
- Next available command: `Implement Phase NN+1`
```

Do not automatically start the next phase. Do not claim completion if acceptance criteria remain unmet.

## 6. How the Human Will Invoke Phases

Use short commands such as:

- `Implement Phase 01`
- `Implement Phase 02`
- `Implement Phase 03`
- `Review Phase 04 diff only; do not edit`
- `Fix the failing test in Phase 12 scope only`
- `Explain why Phase 16 is blocked; do not code`
- `Re-check Phase 09 acceptance criteria`

The agent must treat the requested phase number as the scope boundary.

---

## Final Rule

**One implementation owner. Cursor is the primary writer. Antigravity is used for review or explicitly isolated tasks. Stitch is the UI reference. Exactly 20 small phases. Reuse components and functions before creating new ones. Inspect, plan, implement, test, review, report, and stop after the requested phase.**
