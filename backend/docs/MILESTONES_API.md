# Milestones API (Phase 12)

Base path: `/api/v1`  
Auth: `Authorization: Bearer <jwt>` on all routes.  
Errors: `{ "error": "<CODE>", "message": "<human text>", "details"?: [...] }`

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid body/path |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Milestone or project missing |
| `CONFLICT` | 409 | Invalid status transition / edit rules |

## Status model

Shared enum (must match frontend `milestoneStatus.ts`):

`PENDING → IN_PROGRESS → SUBMITTED → IN_REVIEW → APPROVED`

Branches: `REVISION_REQUESTED`, `DISPUTED`

| From | To | Who |
|---|---|---|
| PENDING | IN_PROGRESS | Client or freelancer |
| IN_PROGRESS | SUBMITTED | Freelancer |
| IN_PROGRESS | DISPUTED | Client or freelancer |
| SUBMITTED | IN_REVIEW | Client |
| SUBMITTED | DISPUTED | Client or freelancer |
| IN_REVIEW | APPROVED | **Client only** |
| IN_REVIEW | REVISION_REQUESTED | Client |
| IN_REVIEW | DISPUTED | Client or freelancer |
| REVISION_REQUESTED | IN_PROGRESS | Freelancer |
| REVISION_REQUESTED | SUBMITTED | Freelancer |
| REVISION_REQUESTED | DISPUTED | Client or freelancer |
| DISPUTED | IN_REVIEW / APPROVED / REVISION_REQUESTED | Arbitrator |

**Hard rule:** a freelancer cannot approve their own submission (`APPROVED` is never allowed for `FREELANCER`).

Moving to `REVISION_REQUESTED` or `DISPUTED` requires a `note`.

Entering `IN_REVIEW` sets `reviewStartedAt` and, when `reviewWindowDays` is set, `reviewDueAt = now + reviewWindowDays`.

A past `dueDate` does **not** block transitions by itself (deadlines are informational until payments/notifications phases).

## Endpoints

### `GET /projects/:id/milestones`

List milestones for a project (participants / arbitrator). Each item includes `allowedTransitions`.

### `POST /projects/:id/milestones` — create (CLIENT)

```json
{
  "title": "Design",
  "deliverables": "Figma file",
  "acceptanceCriteria": "Approved mockups",
  "amount": 25000,
  "dueDate": "2026-11-15",
  "reviewWindowDays": 5,
  "agreementId": "<optional uuid>",
  "sortOrder": 0
}
```

Amounts are integer base units (e.g. cents). Response `201`: `{ "milestone": { ... } }`.

### `GET /milestones/:id`

Single milestone + `allowedTransitions`.

### `PATCH /milestones/:id` — edit fields (CLIENT)

Only while status is `PENDING`.

### `DELETE /milestones/:id` — delete (CLIENT)

Only while status is `PENDING`.

### `PATCH /milestones/:id/status`

```json
{ "status": "IN_PROGRESS", "note": "optional except for REVISION_REQUESTED / DISPUTED" }
```

All transitions are validated by a single shared function (`assertMilestoneTransition`).
