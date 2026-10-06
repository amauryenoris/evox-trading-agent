# Requirements — Remove the npm audit Gate from the 5 Trading Workflows

## Background

The CI-resilience STEP 0 diagnostic (2026-10-05, prior session) found 5 workflows each run
`npm audit --audit-level=critical` right after `npm ci`, with no `continue-on-error`, so a newly
published CRITICAL advisory fails that step and skips the workflow's main command entirely — this
halted trading/exit management for ~18 hours on 2026-09-30. `security-audit.yml` (a separate,
additive-only workflow: daily 12:00 UTC + manual dispatch, opens/comments-on/closes a GitHub Issue
and fails its own run on a critical finding) now exists to carry that responsibility instead. This
change removes the now-redundant gate from the 5 trading workflows, replacing each with a one-line
comment pointing to where the audit actually runs.

**Re-verified live this session, against the current repo** (line numbers match the context exactly):

| File | Audit step lines | Exact current content |
|---|---|---|
| `agent-cron.yml` | `:49-50` | `- name: Security audit` / `run: npm audit --audit-level=critical` |
| `agent-exits.yml` | `:37-38` | same shape |
| `position-health.yml` | `:37-38` | same shape |
| `daily-bars-sync.yml` | `:36-37` | same shape |
| `weekly-report.yml` | `:30-31` | same shape |

**FAIL FAST checks performed this session — both resolved, neither blocks this spec**: grepped all
5 files for `npm audit` (exactly one match each, confirmed above) and for `needs:`/`outputs:`
(zero matches in any of the 5 — each file is a single-job workflow with no cross-step or cross-job
data dependency on the audit step's result). Neither FAIL FAST condition in the context (more than
one audit step; the audit step having dependencies) is triggered in any of the 5 files.

**One claim in the context that could not be independently verified this session**: "its alert was
tested end to end." `security-audit.yml` is confirmed deployed (current repo state, `:1-119`), and
its logic was reviewed and approved in two prior sessions (`specs/security-audit-workflow/`,
`specs/security-audit-dispatch-level/` — the latter's feature was ultimately pushed directly by a
third party, "JorgeD," rather than through this session's own commit, per the git history). Whether
a real dispatch actually produced/commented-on/closed a GitHub Issue cannot be confirmed from
repository files alone — there is no `gh` CLI in this environment and the project's Supabase
instance (checked in a prior session) is unrelated to GitHub Issues data. This is taken as given per
the context's "authoritative" framing, not independently re-confirmed — flagged here for visibility
since it is the stated precondition for considering it safe to remove the only existing gate.

---

## Functional Requirements

FR-01: The system shall remove the `npm audit` step from `agent-cron.yml` and replace it with a single comment line.

FR-02: The system shall remove the `npm audit` step from `agent-exits.yml` and replace it with a single comment line.

FR-03: The system shall remove the `npm audit` step from `position-health.yml` and replace it with a single comment line.

FR-04: The system shall remove the `npm audit` step from `daily-bars-sync.yml` and replace it with a single comment line.

FR-05: The system shall remove the `npm audit` step from `weekly-report.yml` and replace it with a single comment line.

FR-06: The replacement comment line in each of the 5 files shall read exactly: `# npm audit runs in security-audit.yml (daily, alerts via GitHub issue); it does not gate this workflow`.

FR-07: In each of the 5 files, every line other than the removed step and its replacement comment shall remain byte-identical, including indentation, the `npm ci` step, the main command, cron expressions, concurrency, timeouts, `runs-on`, and action versions.

FR-08: The system shall not modify `security-audit.yml`, `keepalive.yml`, `pr-review.yml`, or any file outside the 5 named trading workflows.

---

## Non-Functional Requirements

NFR-01: Each of the 5 modified files shall remain valid YAML, verified with a static parser without executing or dispatching any workflow.

NFR-02: After the change, every remaining occurrence of the substring "npm audit" within `.github/workflows/` shall be either inside `security-audit.yml` or inside one of the 5 new comment lines — no file shall retain an active `npm audit` command outside `security-audit.yml`.

---

## Constraints

C-01: This feature touches no Protected Zone file — `.github/workflows/*.yml` is not on the Protected Zone list in `CLAUDE.md`/`SDD.md` §17.

C-02: `security-audit.yml`, `keepalive.yml`, and `pr-review.yml` shall not be modified.

C-03: No non-workflow file and no secret shall be modified.

C-04: No workflow shall be run, dispatched, or re-run as part of this change or its verification.

C-05: Exactly 5 files are modified. No file is created or deleted.

---

## Out of Scope

- Re-adding any form of audit gate to these 5 workflows later
- Any change to `security-audit.yml`'s schedule, inputs, or issue-handling logic
- Fixing any currently-reported `npm audit` finding (unrelated maintenance)
- Verifying, beyond what this session already checked, that `security-audit.yml`'s alert has been exercised against a real advisory and produced a real GitHub Issue — noted as unverified-from-repo in Background, not resolved by this change
