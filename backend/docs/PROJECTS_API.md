# Projects & Invitations API (Phase 08)

Base path: `/api/v1`  
Auth: `Authorization: Bearer <jwt>` unless noted.  
Errors: `{ "error": "<CODE>", "message": "<human text>", "details"?: [...] }`

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid body/query failed validation |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Project or invitation missing |
| `CONFLICT` | 409 | Duplicate seat, expired/used invite, etc. |

## Projects

### `POST /projects` — create (CLIENT only)

Body:

```json
{ "title": "Brand redesign", "description": "Optional", "externalUrl": "https://example.com/job/123" }
```

- `externalUrl` is an optional reference. Fairwork does **not** control the external platform.
- Response `201`: `{ "project": { ... } }` with `status: "DRAFT"`.

### `GET /projects` — list for current user

Query: `limit` (1–100, default 20), `offset` (default 0).

Returns projects where the user is `client` or `freelancer`.

```json
{ "projects": [ ... ], "pagination": { "limit": 20, "offset": 0, "total": 1 } }
```

### `GET /projects/:id` — details

Requires project participant (client, freelancer) or arbitrator.

Clients also receive `project.invitations[]` (includes shareable `token`).

### `POST /projects/:id/invitations` — create invite (project client)

Body (optional): `{ "email": "freelancer@example.com" }`

- Revokes any previous pending invite for the project.
- Response `201`:

```json
{
  "invitation": { "id": "...", "token": "...", "status": "PENDING", "expiresAt": "..." },
  "invitePath": "/register?invite=<token>",
  "note": "External project URLs are references only — Fairwork does not control external platforms."
}
```

## Invitations

### `GET /invitations/:token` — public preview

No auth required. Returns invitation status + project title summary.

### `POST /invitations/:token/accept` — join project (FREELANCER)

- Assigns the authenticated freelancer to the project.
- Sets project `status` to `ACTIVE`.
- If the invite includes an email, it must match the user's email.
- Response `200`: `{ "project": { ... } }`
