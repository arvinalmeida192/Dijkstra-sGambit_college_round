# Fairwork — Agent Instructions (AI Model Configuration)

This file documents the **approved AI model shortlist and Phase 19 constraints**.

For always-on process rules (phase workflow, reuse, Git, security), also follow `FAIRWORK_AGENTS_ENTRYPOINT.md` and `FAIRWORK_20_PHASE_AGENT_WORKFLOW.md`.

## Approved five-model shortlist (local Ollama)

These are **initial routing defaults**, not claims that one model is objectively superior. Benchmark against representative submissions before declaring a preferred model within a category.

| Deliverable type | Models |
|---|---|
| Code submissions | `qwen2.5-coder:1.5b` |
| General text/documents | `qwen3:1.7b`, `gemma3:1b` |
| Visual submissions | `qwen2.5vl:3b`, `gemma3:4b` |

Documenting these names does **not** authorize downloading weights, installing Ollama runtimes, or pulling images. That requires separate explicit human approval.

## Required Phase 19 behavior

1. Implement a provider/model adapter that supports all five configured models through Ollama, with model names and connection settings configurable rather than scattered or hardcoded.
2. Route submissions according to deliverable type. Do not run all five models for every submission.
3. For ordinary submissions, run the appropriate configured model. Where useful, support comparing the two candidates for text or visual deliverables, especially when confidence is low or the result is ambiguous. Avoid unnecessary model calls.
4. Benchmark candidate models against representative submissions and expected outcomes before claiming which performs best.
5. Return validated structured assessments: acceptance criteria met, supporting evidence references, outstanding work, uncertainty, model/provider identity, and assessment status.
6. For code submissions, use objective evidence where available, including Git diffs/history and test results. For visual submissions, inspect submitted screenshots/files. For written deliverables, compare the work against the agreed requirements and document history where available.
7. Never claim to know actual hours worked, authorship, or effort percentage from model inference alone. Do not fabricate evidence or confidence.
8. AI assessments are advisory only. Models must not independently approve milestones, decide disputes, or authorize payments. Existing agreement rules, evidence, and authorized human dispute processes remain authoritative.
9. If a model is unavailable, output is invalid, or models disagree materially, handle the failure explicitly and use a configured fallback or human-review status. Never silently fabricate a successful assessment.
10. Keep deadline and inactivity notifications deterministic and independent of model judgment. Scheduled jobs must be idempotent and tested.

## Approval and scope constraints

- Do not download model weights, call paid APIs, or introduce external model providers without explicit human approval.
- Model names and routing defaults are approved for documentation only until runtime installation is separately authorized.
- Do not begin Phase 19 implementation as part of a documentation-only task.
- Do not rebuild completed phases or duplicate existing modules, services, types, validators, or components. Inspect the current codebase before proposing future implementation changes.
- Do not add unnecessary packages or unrelated features.
- Do not run Git state-changing commands: no add, commit, push, merge, rebase, checkout, switch, reset, cherry-pick, or stash.
