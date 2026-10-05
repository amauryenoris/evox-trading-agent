# Tasks — Pin All Workflow Runners to ubuntu-24.04

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, no Protected Zone file touched (see design.md)
- [x] Database migrations drafted — N/A, none required

## Implementation Checklist

### Phase 1 — Pin each workflow's runner

- [x] T-01: `agent-cron.yml:15` — change `runs-on: ubuntu-latest` to `runs-on: ubuntu-24.04`. No other line in this file changes.
- [x] T-02: `agent-exits.yml:16` — change `runs-on: ubuntu-latest` to `runs-on: ubuntu-24.04`. No other line in this file changes.
- [x] T-03: `position-health.yml:16` — change `runs-on: ubuntu-latest` to `runs-on: ubuntu-24.04`. No other line in this file changes.
- [x] T-04: `daily-bars-sync.yml:15` — change `runs-on: ubuntu-latest` to `runs-on: ubuntu-24.04`. No other line in this file changes.
- [x] T-05: `weekly-report.yml:10` — change `runs-on: ubuntu-latest` to `runs-on: ubuntu-24.04`. No other line in this file changes.
- [x] T-06: `keepalive.yml:10` — change `runs-on: ubuntu-latest` to `runs-on: ubuntu-24.04`. No other line in this file changes.
- [x] T-07: `pr-review.yml:15` — change `runs-on: ubuntu-latest` to `runs-on: ubuntu-24.04`. No other line in this file changes.

## Verification

- [x] T-08: Ran `npx js-yaml <file>` against each of the 7 modified files — all 7 parse as valid YAML. No workflow run or dispatched.
- [x] T-09: `git diff -- .github/workflows/` confirmed — exactly 7 files changed, 7 insertions/7 deletions (one line each), all other lines identical.
- [x] T-10: Grepped `.github/` for `ubuntu-latest` — zero remaining matches.
- [x] T-11: Grepped `.github/` for `ubuntu-24.04` — exactly 7 matches, one per file, each on the expected line.
- [x] T-12: `git status --short` confirms only the 7 workflow files (modified) plus this spec folder (new) — no other file touched, no new workflow file created.
- [x] T-13: Stated in the implementation report's "Could not verify" note.

## Post-Implementation

- [x] Run `/review pin-workflow-runners-ubuntu-24-04` to verify implementation matches spec — APPROVED, see `specs/pin-workflow-runners-ubuntu-24-04/review.md`
- [x] Confirm Protected Zone files unchanged — confirmed, none in scope; `git status --short` shows only `.github/workflows/*.yml` files touched
- [ ] Note for Amaury (not an implementation task): this pin defers the `ubuntu-latest` → Ubuntu 26 exposure (2026-10-19) but does not resolve it — a future, separate decision is still needed on when/whether to move off `ubuntu-24.04`. The `npm audit` hard-fail gate (5 workflows) and `keepalive.yml`'s unpinned action tag, both flagged in the same STEP 0 diagnostic, remain fully unaddressed by this change.

## Estimated Complexity

**Low** — 7 one-line text substitutions in CI config, no application code, no Protected Zone, no new file, no DB change. The only reason this merits a spec at all is the explicit "FAIL FAST if more than one runs-on line" / exact-diff-shape discipline requested, not the inherent difficulty of the change.
