# Tasks — Remove the npm audit Gate from the 5 Trading Workflows

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — N/A, no Protected Zone file touched (see design.md)
- [x] Database migrations drafted — N/A, none required
- [x] Amaury has confirmed `security-audit.yml`'s alert has actually been exercised end-to-end (not independently verifiable from the repo — see requirements.md Background) before this gate is removed from the 5 trading workflows

## Implementation Checklist

### Phase 1 — Replace each audit step with a comment

- [x] T-01: In `agent-cron.yml` (was `:49-50`), removed the `- name: Security audit` / `run: npm audit --audit-level=critical` step, replaced with `# npm audit runs in security-audit.yml (daily, alerts via GitHub issue); it does not gate this workflow` at the same 6-space indentation level the removed step had.
- [x] T-02: In `agent-exits.yml` (was `:37-38`), same substitution applied.
- [x] T-03: In `position-health.yml` (was `:37-38`), same substitution applied.
- [x] T-04: In `daily-bars-sync.yml` (was `:36-37`), same substitution applied.
- [x] T-05: In `weekly-report.yml` (was `:30-31`), same substitution applied.
- [x] T-06: Confirmed by inspecting each diff (see T-07 below) — no other line in any of the 5 files changed.

## Verification

- [x] T-07: Diff shown in the implementation report — exactly one step removed and one comment line added per file, nothing else.
- [x] T-08: Ran `grep -rn "npm audit" .github/workflows/` — matches limited to `security-audit.yml`'s actual command and the 5 new comment lines; no other active `npm audit` command remains anywhere.
- [x] T-09: Ran `npx js-yaml` against all 5 modified files — all valid. No workflow run or dispatched.
- [x] T-10: Ran `git status --short` and `git diff --stat` — exactly 5 files changed (5 insertions, 10 deletions); `security-audit.yml`, `keepalive.yml`, `pr-review.yml`, and every non-workflow file untouched.
- [x] T-11: Stated explicitly in the implementation report: no workflow was run or dispatched at any point.

## Post-Implementation

- [x] Run `/review remove-npm-audit-gate-trading-workflows` to verify implementation matches spec — APPROVED, see `specs/remove-npm-audit-gate-trading-workflows/review.md`
- [x] Confirm Protected Zone files unchanged — confirmed, none in scope; `git status --short` shows only the 5 intended workflow files modified
- [ ] Note for Amaury (not an implementation task): after this merges, the 5 trading workflows have zero dependency-vulnerability gate of their own — `security-audit.yml` is now the only line of defense against a critical advisory going unnoticed, and it only runs once a day (12:00 UTC) plus on manual dispatch, not on every trading-cycle run. A fast-moving critical advisory published mid-day could still execute inside a trading cycle for up to ~24 hours before the next scheduled security-audit run catches it — an accepted tradeoff per this plan, not a gap this change introduces or is meant to close.

## Estimated Complexity

**Low** — 5 structurally identical one-step-for-one-comment substitutions in already-existing CI files, no application code, no Protected Zone, no DB change, no new file.
