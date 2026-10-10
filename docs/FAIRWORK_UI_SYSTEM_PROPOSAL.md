# Fairwork — Reusable UI System Proposal (Phase 03)

> **Status:** APPROVED (human: “continue”, 2026-10-10)  
> **Implementation:** Phase 04.  
> **Sources:** `docs/FAIRWORK_DESIGN_INVENTORY.md`, `docs/stitch-reference/code.html`, `FAIRWORK_FRONTEND_FEATURES.md`  
> **Existing reusable UI in repo:** none (greenfield; no React components to extend yet)

---

## 1. Decision summary (what we are asking to approve)

Approve a **small shared foundation** for the React + Vite + Tailwind app:

1. Design tokens matching Stitch (colors, type, shadows, borders).
2. A short list of shared components used across landing **and** later app pages.
3. Explicit **non-goals** so we do not build a second design system or landing-only gadgets into the shared layer.

If approved, Phase 04 implements only this list.

---

## 2. Proposed design tokens

Place in Tailwind theme extension + CSS variables (single source), e.g. `frontend/src/styles/tokens.css` + `tailwind.config`.

### Colors

| Token | Value | Use |
|---|---|---|
| `--color-base` | `#EFEDE8` | App/page background |
| `--color-surface` | `#F6F5F2` | Panels |
| `--color-dark` | `#0B0B0B` | Text, borders, dark chrome |
| `--color-darker` | `#050505` | Deep dark panels |
| `--color-accent` | `#FF5A1F` | Primary actions |
| `--color-accent-hover` | `#E04A12` | Primary hover |
| `--color-status-success` | `#1FD655` | Success / released / approved |
| `--color-status-warning` | `#FFB020` | Pending / in review |
| `--color-status-danger` | `#F43F5E` | Dispute / error / threat |

### Typography

| Token | Family | Use |
|---|---|---|
| `--font-display` | Space Grotesk | Headlines, brand |
| `--font-body` | Inter | Body copy |
| `--font-mono` | JetBrains Mono | Labels, badges, forms, audit rows |

*(Stitch uses Inter for body; keep it for fidelity to the approved export.)*

### Layout / effect tokens

| Token | Value | Use |
|---|---|---|
| `--border-width-strong` | `2px` | Default control/panel borders |
| `--shadow-brutal` | `4px 4px 0 #0B0B0B` | Primary buttons / small panels |
| `--shadow-brutal-lg` | `8px 8px 0 #0B0B0B` | Large frames / modals |
| `--radius-none` default | `0` | Most controls (brutalist) |
| `--content-max` | `1720px` | Public landing width |
| `--content-app` | `1200px` (proposed) | Authenticated page container (not in Stitch; needed for app pages) |

### Milestone status → badge color mapping (shared)

Align labels to the product state machine (not Stitch marketing synonyms):

| Status | Badge tone |
|---|---|
| `PENDING` | neutral (dark/10) |
| `IN_PROGRESS` | warning |
| `SUBMITTED` | warning |
| `IN_REVIEW` | warning |
| `REVISION_REQUESTED` | warning |
| `APPROVED` | success |
| `DISPUTED` | danger |
| Payment extras: funded / released / refunded / pending | success / success / neutral / warning |

---

## 3. Proposed shared components

Only components that **repeat** in Stitch or are required by every authenticated page. Landing-only one-offs stay in page files.

### A. Primitives (implement in Phase 04)

| Component | Responsibility | Practical props | Notes |
|---|---|---|---|
| `BrandMark` | Logo square + optional “Fairwork” wordmark | `size?: 'sm'\|'md'`, `showWordmark?: boolean`, `tone?: 'light'\|'dark'` | Replaces duplicated header/footer/modal marks |
| `Button` | Primary / secondary / ghost / danger actions | `variant`, `size`, `type`, `disabled`, `loading`, `fullWidth`, `leftIcon?`, `rightIcon?`, `onClick`, `children` | Brutal shadow press on primary; focus ring; disabled + loading |
| `IconButton` | Square close / back / icon-only | `label` (required a11y), `disabled`, `onClick`, `children` | Modal close ✕ pattern |
| `Badge` | Mono status / meta chip | `tone: 'neutral'\|'accent'\|'success'\|'warning'\|'danger'`, `dot?: boolean`, `children` | Status indicators |
| `MilestoneStatusBadge` | Maps milestone enum → `Badge` | `status: MilestoneStatus` | Single place for status vocabulary |
| `Input` | Text/email/password/number field | `label`, `name`, `type`, `value`, `onChange`, `error?`, `hint?`, `disabled`, `required`, `placeholder` | Mono label + 2px border |
| `Textarea` | Multi-line notes / criteria | same as Input minus `type` | For agreement/submission later |
| `Select` | Native select styled | same as Input + `options` | Milestone splits / reasons |
| `SegmentedControl` | 2–3 exclusive options | `options: {value,label}[]`, `value`, `onChange`, `ariaLabel` | Freelancer / Client role toggle |
| `Panel` | Bordered surface container | `tone?: 'base'\|'surface'\|'dark'`, `shadow?: 'none'\|'sm'\|'lg'`, `padding?: 'sm'\|'md'\|'lg'`, `children` | Not a generic “Card” library—only when grouping UI |
| `Alert` | Inline success/error/info | `tone`, `children`, `role?: 'status'\|'alert'` | Auth success / deploy / form errors |
| `Modal` | Backdrop + focus trap shell | `open`, `onClose`, `title?`, `children`, `size?: 'md'\|'lg'` | Login + agreement overlays; reuse for confirms |
| `Spinner` / `LoadingBlock` | Loading affordance | `label?`, `size?` | Stitch lacks these; minimal mono/square spinner matching tokens |
| `EmptyState` | Empty list/page message | `title`, `description?`, `action?: ReactNode` | Not in Stitch; required for app lists |
| `PageContainer` | Width + horizontal padding | `variant: 'marketing'\|'app'`, `children` | Marketing uses 1720; app uses narrower |
| `SectionHeader` | Eyebrow + title + optional meta | `eyebrow?`, `title`, `meta?`, `tone?: 'light'\|'dark'` | Repeated section chrome |

### B. Composition helpers (thin; still Phase 04 if approved)

| Component | Responsibility | Props |
|---|---|---|
| `PublicHeader` | Sticky marketing nav shell | `links`, `onLogin`, `primaryAction?` |
| `PublicFooter` | Dark footer shell | `columns`, `children?` |
| `FormField` | Optional wrapper if `Input` label/error is insufficient | Prefer baking into `Input` first—**skip separate FormField unless needed** |

### C. Explicitly **not** shared in Phase 04

Keep page-local or defer:

| Pattern | Why excluded |
|---|---|
| Custom snapping cursor | Landing novelty; hurts accessibility / touch |
| Pixel-reveal canvas / GSAP intro | Landing-only motion |
| Marquee tickers | Landing decoration |
| Features accordion | Landing-only; one page |
| How-it-works / dispute process step grids | Landing marketing layouts |
| Chunky escrow volume bars | Landing demo; rebuild later from real payment data if needed |
| Wallet-connect button as core auth | MVP auth is email/password (Phase 06/07); wallet can be a later optional control |
| Separate Button / Link component trees | Use `Button` + `asChild` or `Link` styled like secondary—avoid parallel APIs |
| Generic `Card` / `Stack` / `Box` / theme provider frameworks | Over-abstraction with no current need |

---

## 4. File layout (proposed; create in Phase 04)

```text
frontend/   (scaffolded when implementation starts)
  src/
    styles/
      tokens.css
      index.css
    components/
      ui/
        BrandMark.tsx
        Button.tsx
        IconButton.tsx
        Badge.tsx
        MilestoneStatusBadge.tsx
        Input.tsx
        Textarea.tsx
        Select.tsx
        SegmentedControl.tsx
        Panel.tsx
        Alert.tsx
        Modal.tsx
        Spinner.tsx
        EmptyState.tsx
        PageContainer.tsx
        SectionHeader.tsx
        index.ts          # barrel for ui only
      layout/
        PublicHeader.tsx
        PublicFooter.tsx
    lib/
      milestoneStatus.ts  # enum + label helpers (shared)
```

No component library package, no Storybook requirement for MVP. A minimal `/dev/ui` route or static demo page in Phase 04 is enough to verify render states.

---

## 5. Shared behaviors (all interactive primitives)

- Visible **focus** styles (do not rely on custom cursor).
- **Disabled** and **loading** on `Button`; disable submit while loading.
- **Error** text under inputs (red/danger tone, mono).
- Do not invent duplicate status strings in each page—use `MilestoneStatusBadge` + `milestoneStatus.ts`.
- Money display later must use shared formatters (exact/decimal-safe); out of scope for the visual system itself, but do **not** put float math in UI helpers when added.

---

## 6. Mapping to Fairwork pages (reuse plan)

| Page | Shared pieces used |
|---|---|
| Landing `/` | `BrandMark`, `Button`, `Badge`, `Panel`, `PageContainer`, `SectionHeader`, `PublicHeader`/`Footer`, `Modal` (login/create stubs until routes exist) |
| Auth `/login` `/register` | `BrandMark`, `Button`, `Input`, `SegmentedControl`, `Alert`, `Panel`/`Modal` or full page using same fields |
| Dashboard / Projects / … | `PageContainer(app)`, `Button`, `Input`, `Badge`/`MilestoneStatusBadge`, `Panel`, `Alert`, `EmptyState`, `Spinner`, `Modal` |

App shell navigation (sidebar vs top) is **Phase 05**—not proposed as a component here beyond `PageContainer`.

---

## 7. Approval checklist

Please confirm or amend:

- [ ] Tokens (colors, fonts, shadows) as listed
- [ ] Shared component list A (+ optional B)
- [ ] Exclusions list C (especially: no custom cursor / pixel intro in shared UI)
- [ ] App `PageContainer` max width `1200px` (or specify another value)
- [ ] Milestone status enum labels centralized as proposed
- [ ] Inter kept as body font for Stitch fidelity (or replace with an alternate)

**Reply with:** `Approve Phase 03 as proposed` **or** list specific changes.

After approval, the next command is: `Implement Phase 04`.

