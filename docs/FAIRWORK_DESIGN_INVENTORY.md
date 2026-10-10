# Fairwork — Design Inventory (Phase 02)

> **Source:** `stitch.zip` extracted to `docs/stitch-reference/`  
> **Date:** 2026-10-10  
> **Scope:** Design reference only. No application UI was implemented in this phase.

---

## 1. Source assets

| File | Location | Notes |
|---|---|---|
| `stitch.zip` | repo root | Original Stitch export |
| `code.html` | `docs/stitch-reference/code.html` | Single-file Tailwind + GSAP landing (~1781 lines) |
| `screen.png` | `docs/stitch-reference/screen.png` | Mobile-tall preview, **242 × 1600** PNG |

**Readable:** yes.  
**Missing from ZIP:** no separate page HTML files, no Figma/Stitch multi-page export, no icon/font asset packs (fonts and Lucide load from CDNs), no dedicated screens for dashboard/projects/agreement/progress/disputes/payments app shells.

---

## 2. What the export actually contains

The export is **one marketing landing page** plus **two modals**, not an eight-page product UI.

### Landing sections (in order)

| # | Anchor / area | Content |
|---|---|---|
| 1 | Sticky header | Brand mark, numbered nav anchors, Login / Portal, Start Agreement |
| 2 | `#hero` | Display headline, supporting copy, dual CTAs, sample milestone stack, bottom marquee |
| 3 | Accent marquee | “Milestones / Smart contracts / …” ticker |
| 4 | `#the-problem` | Three dark “vulnerability” statement cards |
| 5 | `#how-it-works` | Four stage cards: Define → Fund → Deliver → Release |
| 6 | `#features` | Seven-pillar accordion |
| 7 | `#live-tracker` | Escrow volume bars + audit stream (demo data) |
| 8 | `#dispute-flow` | Five-step dispute pipeline cards |
| 9 | Final CTA | “Build agreements both sides can trust” |
| 10 | Footer | Brand blurb, link columns, UTC clock, back-to-top |

### Overlays (not separate routes)

| Overlay | Trigger | Contents |
|---|---|---|
| `#login-modal` | Login / Portal, Open Web3 Portal | Role toggle (Freelancer / Client), wallet connect (simulated), email + password fields, Sign In to Dashboard |
| `#agreement-modal` | Start an Agreement / Create an Agreement | Title, total escrow USDC, milestone-split select, counterparty wallet/email, Deploy to Smart Escrow (simulated) |

### Interactions observed

- Custom snapping cursor with label states (`AUTH`, `LAUNCH`, `PAY`, etc.)
- GSAP pixel-reveal intro canvas
- Accordion expand/collapse (`toggleFeatureRow`)
- Simulated milestone fund release on hero M2
- Simulated wallet connect + auth success message
- Simulated escrow deploy success alert
- Marquee animations; UTC clock; Lucide icons

All wallet/auth/deploy/release flows in the export are **client-side simulations**. They must not be treated as product truth when wiring real APIs later.

---

## 3. Design tokens (from Stitch Tailwind config)

### Colors

| Token | Hex | Role |
|---|---|---|
| `base` | `#EFEDE8` | Page background |
| `surface` | `#F6F5F2` | Panels / elevated surfaces |
| `dark` | `#0B0B0B` | Primary ink, borders, dark sections |
| `darker` | `#050505` | Deep cards on dark sections |
| `accent` | `#FF5A1F` | Primary CTA / highlight |
| `accent-hover` | `#E04A12` | Accent hover |
| `status-green` | `#1FD655` | Released / success |
| `status-amber` | `#FFB020` | In review / pending |
| `status-red` | `#F43F5E` | Dispute / threat |

### Typography

| Role | Family | Weights used |
|---|---|---|
| Display | Space Grotesk | 500, 700, 800, 900 |
| Body | Inter | 400, 500, 600 |
| Mono / UI chrome | JetBrains Mono | 400, 500, 700 |

Pattern: uppercase display headlines; mono labels, badges, form labels, audit rows.

### Layout & surfaces

- Max content width ~`1720px`
- Heavy **2px** borders in `dark`
- Sharp / low-radius brutalist blocks; hero frame uses larger radius
- Hard offset shadows: `brutal` `4px 4px 0 #0B0B0B`, `brutal-lg` `8px 8px 0`, `brutal-orange` `6px 6px 0 #FF5A1F`
- Technical grid overlays (`bg-tech-grid`, `bg-tech-grid-dark`), 40px grid
- Status badges: bordered mono chips with color dots
- Primary buttons: accent fill + dark border + brutal shadow; press shifts +2px and drops shadow

### Icons

Lucide CDN: `arrow-right`, `arrow-up-right`, `check-circle-2`, `code`, `file-signature`, `git-pull-request`, `lock`, `minus`, `play`, `plus`, `shield-check`, `unlock`, `vault`, `wallet`.

---

## 4. Visual language summary

- **Direction:** technical-brutalist / protocol-console aesthetic (mono chrome, numbered sections, escrow telemetry).
- **Brand signal:** “FAIRWORK” display wordmark + orange square mark with inner dark square.
- **Motion:** intro pixel dissolve, marquees, accordion, hover lift on cards, button shadow press, optional custom cursor.
- **Hero composition:** brand-led headline + one supporting paragraph + dual CTAs + dominant sample agreement/milestone panel (matches product landing intent).

---

## 5. Mapping to approved Fairwork pages

Approved routes from `FAIRWORK_FRONTEND_FEATURES.md`:

| Fairwork page | Route(s) | Stitch coverage | Mapping notes |
|---|---|---|---|
| Landing | `/` | **Strong** | Full `#hero` → footer marketing page is the reference |
| Authentication | `/login`, `/register` | **Partial** | `#login-modal` only; Freelancer/Client toggle + email/password + simulated wallet. **No register screen**, no separate route layout |
| Dashboard | `/dashboard` | **Missing** | Auth CTA says “Sign In to Dashboard” but no dashboard UI exists. `#live-tracker` is marketing telemetry, not a user dashboard |
| Projects | `/projects`, `/new`, `/:id` | **Missing** | `#agreement-modal` is a thin create stub (title, amount, splits, invite field)—not a project list/detail UI |
| Agreement & Milestones | `/projects/:id/agreement` | **Weak / inspirational** | Hero milestone cards + how-it-works stages show status/amount language; no version history, acceptance states, or criteria editor |
| Submission & Progress | `/projects/:id/progress` | **Missing** | Features mention hashes/IPFS/PR binding; no submit/review UI |
| Disputes | `/projects/:id/disputes` | **Weak / inspirational** | `#dispute-flow` explains a 5-step process; no case form, evidence upload, or reviewer decision UI |
| Payments & Activity | `/projects/:id/payments` | **Weak / inspirational** | `#live-tracker` bars + audit stream suggest payment status vocabulary; not a project-scoped payment page |

### Status vocabulary seen in the export

Landing sample statuses: `Released`, `In Review`, `Locked in Escrow`, plus audit tags `RELEASE_EXEC`, `VERIFY_SUBMIT`, `ESCROW_DEPOSIT`, `EVIDENCE_LOG`.

These **do not** replace the approved milestone state machine from product docs (`PENDING → IN_PROGRESS → SUBMITTED → IN_REVIEW → APPROVED`, plus `REVISION_REQUESTED` / `DISPUTED`). Align labels to the shared enum when app screens are designed/built.

---

## 6. Gaps and missing states

### Screens not in Stitch

- Dedicated register page
- Authenticated app shell (sidebar/top nav for logged-in users)
- Dashboard, project list, project detail
- Full agreement builder + version comparison + acceptance
- Submission/upload/revision/review screens
- Dispute case workspace (claims, evidence, AI summary, decision)
- Project payments / activity timeline
- Arbitrator/reviewer-specific views
- Invitation-accept landing for join links

### UI states not designed

- Loading / skeleton for lists and panels
- Empty projects / empty milestones / empty disputes
- Form validation errors (beyond HTML `required`)
- API/auth failure states
- Unauthorized / forbidden
- Pending vs confirmed blockchain/payment states with testnet labels
- Mobile nav (desktop mono nav; mobile breakpoints exist but no hamburger menu pattern)

### Product-doc conflicts inside the marketing copy (do not implement as facts)

The Stitch HTML markets capabilities that **conflict with or exceed** the approved MVP docs:

- “MAINNET ACTIVE”, large mainnet-style escrow pool figures
- Solana + EVM claims; Phantom wallet mention
- Peer-staked juror courts / decentralized arbitration
- Automatic 72h fund release without dispute safeguards called out in product rules
- Audit claims (OpenZeppelin / Trail of Bits) and fee claims

For implementation: keep the **visual system**; treat hyperbolic marketing claims as optional landing copy to be edited against `FAIRWORK_PROJECT_OVERVIEW.md` (testnet/local chain, arbitrator role, AI advisory only, no real funds).

---

## 7. Reusable patterns observed (for Phase 03 proposal)

Patterns that repeat in the export and are candidates for shared components later (proposal only—**approval happens in Phase 03**):

1. Brand mark + wordmark
2. Primary / secondary / ghost buttons (brutal shadow press)
3. Mono status badge / chip
4. Bordered panel / card with optional hard shadow
5. Section header (eyebrow + display title + mono meta)
6. Form field (mono label + 2px bordered input)
7. Role segmented control (Freelancer / Client)
8. Modal shell (backdrop, close square, brutal panel)
9. Accordion row
10. Numbered process step card
11. Audit/activity list row (time + status tag + message + hash)
12. Sticky public header / dark footer

---

## 8. Recommended use of this export

| Use | Guidance |
|---|---|
| Landing (`/`) | Primary visual reference; adapt copy to MVP truthfulness |
| Auth | Reuse modal visual language for `/login` (and extend for `/register`) |
| App pages 3–8 | **No Stitch screens**—derive from the same tokens, type, borders, badges, and panel language; invent minimal consistent layouts only after Phase 03 approval |
| Code reuse | Do **not** paste the monolithic CDN HTML into the React app wholesale; extract tokens/patterns |

---

## 9. Phase 02 outcome

- Design assets located, extracted under `docs/stitch-reference/`, and inventoried.
- Page mapping to the eight Fairwork routes documented.
- Missing screens and states explicitly listed.
- No React/Vite UI implementation performed.

**Next phase:** `Implement Phase 03` — propose the reusable UI system from this inventory and wait for human approval before building components.
