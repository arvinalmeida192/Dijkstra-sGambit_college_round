# Fairwork — Actionable Freelancer Work Invitations Implementation Report

**Date**: 2026-10-11  
**Branch**: `oswald`

---

## 1. Existing Invitation & Notification Infrastructure Reused

Rather than introducing duplicate tables, notification systems, or state stores, this implementation builds directly on Fairwork's existing modules:

- **Projects & Invitations (`backend/src/modules/projects/*`, `002_projects_invitations.sql`)**:
  - Reused the `project_invitations` table, token-based lookup, `one_pending_per_project` partial unique index, and atomic transaction workflow (`acceptInvitationAndAssignFreelancer`).
- **Notifications (`backend/src/modules/notifications/*`, `008_ai_notifications.sql`, `011_protection_notification_kinds.sql`)**:
  - Reused the `notifications` table, `notification_kind` enum, idempotent insertion helper (`insertNotificationIgnoreConflict` with `ON CONFLICT (user_id, kind, subject_key) DO NOTHING`), and `GET /api/v1/notifications` endpoint.
- **Activity & Audit History (`backend/src/modules/submissions/submission.repository.js`, `backend/src/modules/activity/activity.summaries.js`, `frontend/src/components/activity/ActivityTimeline.tsx`)**:
  - Reused `insertAuditLog`, `summarizeAuditAction`, `categorizeAuditAction`, and `ActivityTimeline` to record and display invitation lifecycle events.
- **Notification Bell UI (`frontend/src/components/layout/NotificationsBell.tsx`)**:
  - Extended the existing top-bar `NotificationsBell` dropdown component (which polls every 60 seconds and refreshes on open) to render actionable work invitation cards with `Accept invitation`, `Reject invitation` (with confirmation), and `View details` controls.

---

## 2. Files Changed and Why

| File | Purpose of Changes |
|------|--------------------|
| `backend/src/db/migrations/013_actionable_work_invitations.sql` | Added `REJECTED` to `invitation_status` enum; added `PROJECT_INVITATION`, `INVITATION_ACCEPTED`, and `INVITATION_REJECTED` to `notification_kind` enum; added `invited_user_id`, `message`, `rejected_by`, `rejected_at`, and `revoked_at` to `project_invitations`; added `invitation_id` foreign key to `notifications`. |
| `backend/src/modules/projects/project.validation.js` | Extended `createInvitationSchema` to validate an optional `message` (trimmed, up to 1,000 characters) alongside `email`. |
| `backend/src/modules/projects/project.repository.js` | Updated `insertInvitation`, `findInvitationByToken`, `findInvitationById`, `listInvitationsForProject`, and `toPublicInvitation`; added `rejectInvitationById` and `revokeInvitationById` with atomic `WHERE status = 'PENDING'` guards; computed dynamic `EXPIRED` status when `expires_at < NOW()`. |
| `backend/src/modules/projects/project.service.js` | Updated `createInvitation` to resolve registered freelancers by email, reject self-invites or non-freelancer emails, create idempotent `PROJECT_INVITATION` notifications, and record `INVITATION_CREATED` / `INVITATION_REVOKED` audit logs. Added `rejectInvitation` and `withdrawInvitation` with strict role/recipient/status checks, client notifications (`INVITATION_ACCEPTED`, `INVITATION_REJECTED`), and audit logging. |
| `backend/src/modules/projects/project.controller.js` | Added `rejectInvitation` and `withdrawInvitation` controller handlers. |
| `backend/src/modules/projects/project.routes.js` | Registered `POST /api/v1/invitations/:token/reject` (`FREELANCER`) and `POST /api/v1/projects/:id/invitations/:invitationId/withdraw` (`CLIENT`). |
| `backend/src/modules/notifications/notification.repository.js` | Extended `insertNotificationIgnoreConflict` to accept `invitationId`; updated `listNotificationsForUser` to `LEFT JOIN` `project_invitations`, `projects`, and sender `users`; updated `toPublicNotification` to include structured `invitation` metadata (`id`, `token`, `status`, `message`, `projectTitle`, `sender`, `expiresAt`, etc.). |
| `backend/src/modules/activity/activity.summaries.js` | Added `INVITATION_CREATED`, `INVITATION_ACCEPTED`, `INVITATION_REJECTED`, and `INVITATION_REVOKED` to `CATEGORY_BY_ACTION` (`invitation`) and `summarizeAuditAction`. |
| `frontend/src/lib/api/projects.ts` | Added `'REJECTED'` to `InvitationStatus`; added `message`, `invitedUserId`, `rejectedBy`, `rejectedAt`, `revokedAt`, and `sender` fields; added `rejectInvitation()` and `withdrawInvitation()` API functions. |
| `frontend/src/lib/api/notifications.ts` | Added `PROJECT_INVITATION`, `INVITATION_ACCEPTED`, and `INVITATION_REJECTED` to `NotificationKind`; added `NotificationInvitationDetails` and `invitation` field on `AppNotification`. |
| `frontend/src/components/layout/NotificationsBell.tsx` | Rendered actionable work invitation cards with client identity, project title, message, timestamp, status badge, `Accept invitation`, `Reject invitation` (with confirmation dialog), and `View details` / `View project` / `Review agreement` links. Handled loading, disabled double-submit protection, and error/success alerts. |
| `frontend/src/pages/ProjectDetailPage.tsx` | Added optional invitation message field, in-app notification delivery confirmation banner, `Withdraw` action for pending invitations, and updated `InvitationHistory` status badges (`PENDING`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `EXPIRED`). |
| `frontend/src/pages/InvitePage.tsx` | Added sender details, invitation message display, and `Reject invitation` button with confirmation step on the standalone `/invite/:token` page. |
| `frontend/src/pages/DashboardPage.tsx` & `frontend/src/pages/ProjectsPage.tsx` | Subscribed to `fairwork:invitation-updated` browser event so accepting an invitation from the notification bell immediately refreshes the project list. |
| `frontend/src/components/activity/ActivityTimeline.tsx` | Added `UserPlus` icon mapping for the `invitation` activity category. |
| `backend/tests/integration/projects.test.js` | Added 5 comprehensive integration tests covering notification delivery, acceptance, rejection, withdrawal, expiration, role validation, concurrency, and agreement safeguards. |
| `backend/tests/unit/activity.summaries.test.js` | Added unit assertions for invitation audit summaries and category mapping. |

---

## 3. Database Migrations Added

### `backend/src/db/migrations/013_actionable_work_invitations.sql`
- **Enums**:
  - `invitation_status`: added `'REJECTED'`.
  - `notification_kind`: added `'PROJECT_INVITATION'`, `'INVITATION_ACCEPTED'`, `'INVITATION_REJECTED'`.
- **Columns on `project_invitations`**:
  - `invited_user_id UUID REFERENCES users (id) ON DELETE RESTRICT` (indexed)
  - `message TEXT`
  - `rejected_by UUID REFERENCES users (id) ON DELETE RESTRICT`
  - `rejected_at TIMESTAMPTZ`
  - `revoked_at TIMESTAMPTZ`
- **Columns on `notifications`**:
  - `invitation_id UUID REFERENCES project_invitations (id) ON DELETE CASCADE` (indexed)

---

## 4. API Endpoints & Authorization Rules

| Method & Path | Auth & Role | Description & Validation Rules |
|---------------|-------------|--------------------------------|
| `POST /api/v1/projects/:id/invitations` | `CLIENT` (Project Owner) | Creates a new invitation (`email` optional, `message` optional). Rejects if project is `CANCELLED`/`COMPLETED` or already has a freelancer. If `email` matches an existing user, verifies the user has role `FREELANCER` (409 if `CLIENT`/`ARBITRATOR` or self-invite). Revokes any prior pending invitation, records `INVITATION_CREATED` audit log, and inserts an idempotent `PROJECT_INVITATION` notification for the registered freelancer. |
| `POST /api/v1/projects/:id/invitations/:invitationId/withdraw` | `CLIENT` (Project Owner) | Atomically transitions a `PENDING` invitation to `REVOKED` (`revoked_at = NOW()`) and records `INVITATION_REVOKED` in `audit_logs`. Returns 409 if already processed. |
| `GET /api/v1/invitations/:token` | Public | Previews invitation details including sender (`id`, `name`, `email`), project (`id`, `title`, `status`, `hasFreelancer`), `message`, `createdAt`, `expiresAt`, and effective status (`EXPIRED` if past `expires_at`). |
| `POST /api/v1/invitations/:token/accept` | `FREELANCER` | Validates recipient (`invited_user_id` and `invited_email` match authenticated freelancer), verifies invitation is `PENDING` and not expired, atomically updates invitation to `ACCEPTED` and assigns `projects.freelancer_id` in a transaction, notifies the client (`INVITATION_ACCEPTED`), and logs `INVITATION_ACCEPTED`. Does **not** accept any agreement version. |
| `POST /api/v1/invitations/:token/reject` | `FREELANCER` | Validates recipient and `PENDING`/unexpired state, atomically updates invitation to `REJECTED` (`rejected_by`, `rejected_at = NOW()`), notifies the client (`INVITATION_REJECTED`), and logs `INVITATION_REJECTED`. |
| `GET /api/v1/notifications` | Authenticated User | Lists notifications for `req.user.id` enriched with `invitation` details (`token`, `status`, `message`, `projectTitle`, `sender`, `hasFreelancer`). |

---

## 5. Frontend Behavior

1. **Client Invitation Flow (`ProjectDetailPage.tsx`)**:
   - Client enters the freelancer's email and an optional message and clicks **Send invitation**.
   - If the email belongs to a registered freelancer, an confirmation alert informs the client that an in-app notification was delivered.
   - Client can view current and past invitations in **Invitation history** with live status badges (`PENDING`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `EXPIRED`) and can withdraw a pending invitation at any time.
2. **Freelancer Notification Panel (`NotificationsBell.tsx`)**:
   - Displays **New work invitation** cards showing the client's name and email, project title, invitation message, timestamp, and current status badge.
   - For `PENDING` invitations, renders **Accept invitation**, **Reject invitation**, and **View details** actions.
   - Clicking **Reject invitation** opens an inline confirmation prompt (`Confirm reject` / `Cancel`) before sending the request.
   - While a request is in flight, buttons show a spinner and are disabled to prevent duplicate clicks.
   - Upon acceptance, the notification immediately transitions to `ACCEPTED`, displays a success alert reminding the freelancer to review the agreement, exposes **View project** and **Review agreement** links, and dispatches `fairwork:invitation-updated` so open project lists update immediately.
3. **Standalone Invitation Page (`InvitePage.tsx`)**:
   - Displays client identity, project title, message, and both **Accept invitation** and **Reject invitation** (with confirmation) buttons.

---

## 6. Agreement & Escrow Safeguards Preserved

- Accepting a work invitation only assigns the freelancer (`projects.freelancer_id`) and sets `projects.status = 'ACTIVE'`.
- Any `PROPOSED` agreement on the project remains `PROPOSED` until both the client and the newly joined freelancer explicitly accept the same agreement version on the Agreement page.
- Milestone work (`PENDING → IN_PROGRESS`) continues to enforce `GATEWAY_PAYMENTS_ENABLED` funding checks and agreement activation rules.

---

## 7. Tests Run and Actual Results

### Backend Migration
```bash
npm run migrate
```
- **Result**: Applied `013_actionable_work_invitations.sql` cleanly (exit code `0`).

### Backend Test Suite
```bash
npm run test
```
- **Result**: **23 test files passed (23 total), 130 tests passed (130 total)** in 108.82s (exit code `0`).
- **Key New Tests Verified in `tests/integration/projects.test.js`**:
  - `delivers an actionable notification to a registered freelancer and updates status on accept`
  - `supports freelancer rejecting an invitation and prevents subsequent acceptance`
  - `supports client withdrawing a pending invitation and blocks freelancer response`
  - `rejects expired invitations and non-freelancer email targets`
  - `handles concurrent accept/reject requests atomically and preserves agreement safeguards`

### Frontend Lint & Production Build
```bash
npm run lint && npm run build
```
- **Result**:
  - `oxlint`: **0 errors** (15 pre-existing React compiler hints in unrelated files).
  - `tsc -b && vite build`: **Succeeded** in 738ms (`dist/assets/index-DQ4j-JXZ.js` 488.72 kB).

---

## 8. Known Limitations

- **Notification Delivery Mechanism**: Consistent with the existing Fairwork architecture, `NotificationsBell` fetches notifications on mount, when the bell icon is toggled open, and via a 60-second polling interval (`setInterval` in `NotificationsBell.tsx`). It does not use WebSockets or Server-Sent Events.
- **Unregistered Freelancer Emails**: If a client invites an email address that is not yet registered in Fairwork, no in-app notification row can be created at invite creation time; the client can share the generated `/invite/:token` link with the freelancer, who can register and then accept or reject the invitation on `/invite/:token`.

---

## 9. Manual Verification Steps

1. **Client Creates Project & Sends Invitation**:
   - Sign in as a `CLIENT` account.
   - Navigate to **Projects → New project**, create a project, and open its **Overview** page.
   - In the **Invite freelancer** panel, enter the email address of a registered `FREELANCER` account and an optional message (e.g., `"We'd like to invite you to work on this project."`), then click **Send invitation**.
   - Verify the green confirmation alert appears and **Invitation history** shows `PENDING`.
2. **Freelancer Responds from Notification Bell**:
   - Sign in as the invited `FREELANCER` account.
   - Click the **Notifications** bell icon in the top navigation bar.
   - Verify the **New work invitation** card displays the client's name/email, project title, message, timestamp, and `PENDING` badge along with **Accept invitation**, **Reject invitation**, and **View details**.
   - Click **Reject invitation** to verify the confirmation step appears (`Confirm reject` / `Cancel`), then click **Cancel**.
   - Click **Accept invitation**. Verify the badge updates to `ACCEPTED`, the project appears in the freelancer's **Projects** list, and **Review agreement** / **View project** links appear.
3. **Verify Agreement Safeguards**:
   - Click **Review agreement** (or navigate to the project's **Agreement** tab).
   - Verify that if the client had proposed Agreement v1, it is still in `PROPOSED` status awaiting the freelancer's explicit acceptance before activation and project funding.

