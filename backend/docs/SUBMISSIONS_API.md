# Submissions & Reviews API (Phase 14)

Base path: `/api/v1`  
Auth: `Authorization: Bearer <jwt>` on all routes.  
Errors: `{ "error": "<CODE>", "message": "<human text>", "details"?: [...] }`

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid body/upload |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Submission / milestone / file missing |
| `CONFLICT` | 409 | Wrong milestone state / rules |

## Integrity model

- Uploaded file bytes are stored under a **private** local directory (`STORAGE_PRIVATE_DIR` / `backend/storage/private`). They are **not** exposed as static public assets.
- `sha256Hash` is computed **server-side** from file bytes. Client-supplied hashes are rejected.
- A matching hash supports **file integrity** checks only — not quality, authorship, or correctness.
- Link-only / notes-only submissions may omit `sha256Hash` (`null`).
- Authorized parties download files via `GET /submissions/:id/file` (never via a guessable public URL).

## Endpoints

### `GET /milestones/:id/submissions`

List revision history for a milestone (participants / arbitrator). Each submission includes nested `reviews`.

### `POST /milestones/:id/submissions` — create (FREELANCER)

Allowed when milestone is `IN_PROGRESS` or `REVISION_REQUESTED`. Creates the next revision and transitions the milestone to `SUBMITTED`.

**Multipart** (`multipart/form-data`):

| Field | Type | Notes |
|---|---|---|
| `file` | file | Optional; hashed server-side |
| `notes` | text | Optional |
| `externalUrl` | text | Optional http(s) URL |
| `agreementId` | text | Optional UUID |

**JSON** (no file):

```json
{
  "notes": "See Figma link",
  "externalUrl": "https://example.com/deliverable",
  "agreementId": null
}
```

At least one of file, `externalUrl`, or `notes` is required.

Response `201`:

```json
{
  "submission": {
    "id": "...",
    "revision": 1,
    "hasFile": true,
    "sha256Hash": "abc…",
    "externalUrl": null,
    "notes": "…"
  },
  "milestone": { "status": "SUBMITTED", "allowedTransitions": ["IN_REVIEW", "DISPUTED"] }
}
```

Public responses never include the private filesystem path (`file_ref`).

### `GET /submissions/:id`

Single submission + reviews.

### `GET /submissions/:id/file`

Authorized download of the private file. Sets `X-Content-SHA256` when a hash exists. `404` if link/notes-only.

### `POST /submissions/:id/review` — review (CLIENT)

Only the **latest** revision is actionable. Milestone must be `SUBMITTED` or `IN_REVIEW`.

```json
{ "decision": "START_REVIEW" | "APPROVED" | "REVISION_REQUESTED", "feedback": "…" }
```

| Decision | Effect |
|---|---|
| `START_REVIEW` | `SUBMITTED` → `IN_REVIEW` (sets review window timestamps) |
| `APPROVED` | From `SUBMITTED` or `IN_REVIEW` → `APPROVED` (auto-enters review first if needed). Freelancer cannot approve. |
| `REVISION_REQUESTED` | Requires `feedback`. Moves to `REVISION_REQUESTED`. |

Each review is persisted and an append-only `audit_logs` row is written (`SUBMISSION_CREATED` / `SUBMISSION_REVIEWED`).
