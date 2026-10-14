# Review Report — Serialize the trading cycle and the exit sweeps with one shared concurrency group

**Date**: 2026-10-14
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verification basis: static review of the diff (`git diff --stat`: 2 files, 6 insertions, 2 deletions), both files parsed
with `npx js-yaml` (identical `concurrency` object, triggers intact), and a grep of every workflow for `concurrency:`.
**Not run, by design:** any workflow dispatch or re-run (C-02). GitHub's queuing behavior can only be observed on its
own runners, so nothing about actual serialization was exercised.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Cycle runs in group `trading-positions` | ✅ | `agent-cron.yml:12` |
| FR-02 | Exit Check runs in group `trading-positions` | ✅ | `agent-exits.yml:12` |
| FR-03 | Identical literal name in both | ✅ | Parsed objects are equal |
| FR-04 | `cancel-in-progress: false` in both | ✅ | |
| FR-05 | At most one run of the two at a time | ➖ | Follows from GitHub's semantics; not observable without running |
| FR-06 | Applies to scheduled and manual runs | ✅ | Workflow-level block, no `if` or event filter |
| FR-07 | No context expression in the name | ✅ | Plain literal |
| FR-08 | Comment saying both can close the same positions | ✅ | First comment line in each file |
| FR-09 | Comment of three lines or fewer | ✅ | Two lines |
| FR-10 | `agent-cron.yml` unchanged outside the block and comment | ✅ | Diff shows only the comment and the group line |
| FR-11 | `agent-exits.yml` unchanged outside the block and comment | ✅ | Same |
| FR-12 | `workflow_dispatch` kept in `agent-cron.yml` | ✅ | Parsed triggers: `schedule,workflow_dispatch`; `route.ts:18` still resolves |
| FR-13 | `workflow_dispatch` kept in `agent-exits.yml` | ✅ | |
| FR-14 | Cron strings, secrets, permissions, timeouts, steps unchanged | ✅ | Not in the diff |
| FR-15 | No `concurrency:` added to other workflows | ✅ | `daily-bars-sync`, `position-health`, `security-audit` keep their own groups |
| FR-16 | Both files valid YAML | ✅ | `js-yaml` parses both; GitHub acceptance itself is ➖ until it fires |
| FR-17 | Report states one running and one pending per group | ✅ | Completion report and `design.md` |
| FR-18 | Report states a newer pending replaces an older one | ✅ | Same |
| FR-19 | Report states a queued sweep can be dropped | ✅ | Same |
| FR-20 | Report states a queued cycle can be dropped | ✅ | Same |
| FR-21 | Report confirms the cycle calls `enforceExitRules` | ✅ | `claude-agent.ts:1434`; the sweep calls it at `run-cycle.ts:38`. Both read contexts from the same function (`getAllOpenPositionContexts()` returns `getOpenPositionContexts()`, `db.ts:206-208`), so a dropped sweep is covered by the next cycle |
| FR-22 | Report states what could not be tested | ✅ | Completion report |
| FR-23 | Report states what to check on the first trading day | ✅ | Completion report and `design.md` |
| NFR-01 | Diff touches only the two files, only the `concurrency:` region | ✅ | |
| NFR-02 | Both parse with `npx js-yaml` | ✅ | |
| NFR-03 | Reversible with one commit revert | ✅ | |
| NFR-04 | No change to when workflows are scheduled | ✅ | |
| C-01 | No Protected Zone file modified | ✅ | See audit |
| C-02 | No dispatch or re-run | ✅ | |
| C-03 | `workflow_dispatch` kept in `agent-cron.yml` | ✅ | |
| C-04 | No secret, env or repo setting changed | ✅ | |
| C-05 | No other file changed | ✅ | `git status`: the two workflows plus the spec folder |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | Read only, to confirm the `enforceExitRules` call |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

No unauthorized change.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A: no agent code touched |
| Supabase patterns | ✅ | N/A: no query added |
| TypeScript quality | ✅ | N/A: no TypeScript changed |
| Security | ✅ | No secret added or exposed; secrets blocks untouched; CRLF line endings preserved |

## Task Checklist

- Implementation tasks: 8/8 completed
- Pre-implementation: 4/4 checked
- Post-implementation: 3 items. "Run /review" and "Confirm Protected Zone files unchanged" are covered by this report;
  "After the first trading day" can only be done after the workflows run and stays open by design.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
1. **A queued trading cycle can now be dropped.** With one shared group, a newer pending run (a later exit sweep or a
   dashboard "Run Agent" press) replaces an older pending cycle, which means one entry opportunity skipped. This is the
   accepted trade-off (Open Question 1) and is new relative to today, where each workflow queued on its own. Verify on the
   first trading day how many runs appear as "Canceled".
2. **The real serialization is untested.** Nothing in the repo or locally can show that the two workflows queue behind
   each other; only the first overlapping scheduled or manual runs will. Treat the first day as the test.

### LOW (optional)
1. The 15-minute `timeout-minutes` of the running job bounds how long a pending run waits, but wait time itself is not
   capped by the workflow; with scheduling delays of hours, a pending run can start well after its slot.
2. This reduces overlap but does not remove the cause of the duplicate `ghost_close` rows (`detectClosedPositions()`),
   which remains an open investigation.
3. The comment in each file is two long lines (over 100 characters). Cosmetic only.
4. Git prints an LF-to-CRLF warning for these files on Windows; no content impact.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.

Recommendation: after the first trading day, open the Actions tab and record every run marked "Canceled" for group
`trading-positions` (workflow, time, and what was running), then decide whether MEDIUM-1 needs a follow-up.
