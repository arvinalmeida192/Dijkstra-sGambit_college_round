# Fairwork — Always-On Agent Instructions

These instructions apply to every coding-agent task in this repository.

## Before doing any work

1. Read `FAIRWORK_20_PHASE_AGENT_WORKFLOW.md`.
2. Read `FAIRWORK_PROJECT_OVERVIEW.md`.
3. Read `FAIRWORK_FRONTEND_FEATURES.md`.
4. Read `FAIRWORK_BACKEND_ARCHITECTURE.md`.
5. Read `AGENTS.md` for the approved AI model shortlist and Phase 19 model constraints.
6. Inspect the current repository and `git status` before editing.
7. If any required file is missing or inaccessible, say exactly which file is missing. Do not pretend to have read it or invent its contents.

## Phase-based implementation

- When the user says `Implement Phase NN`, follow that exact phase in `FAIRWORK_20_PHASE_AGENT_WORKFLOW.md`.
- Implement only that phase, run its relevant checks, report results in the workflow's required format, and stop.
- Never automatically start the next phase.
- If the requested phase is already complete, inspect and report that instead of rebuilding it.
- If specifications conflict, identify the exact conflict and ask for a decision before changing shared interfaces, security behavior, payment logic, or product scope.

## Implementation discipline

- Cursor is the primary coding tool.
- Antigravity is for review or explicitly assigned isolated work; never let both tools edit the same files concurrently.
- Search for and reuse existing components, functions, hooks, services, repositories, validators, types, constants, and styles before creating new ones.
- Keep changes small. Do not rewrite whole directories, duplicate modules, add unapproved features, or install dependencies without approval.
- Treat the four Fairwork specification files as required project context. The workflow controls process; the overview defines product scope; the frontend file defines UI requirements; the backend file defines backend/API/data/security requirements.
- Human developers control Git state changes. Do not run `git add`, `git commit`, `git push`, `git merge`, `git rebase`, `git switch`, `git checkout`, `git reset`, `git cherry-pick`, `git stash`, or other commands that change Git state.
- Test what changed and report commands/results honestly.
- Never claim mocked AI, integrations, escrow, or blockchain transactions are real.
- AI must not make final dispute decisions or independently authorize transfers.
- Do not download model weights, call paid APIs, or add external model providers without explicit human approval. Follow the Ollama shortlist and routing rules in `AGENTS.md`.
