# Tasks — CHANGE split-2: extract the exit/cooldown helpers from claude-agent.ts (pure move, no behaviour change)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts`: removal of three definitions and one import; owner authorization given in the request)
- [x] Database migrations drafted (N/A: none)
- [x] Q-1 to Q-4 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: Record `git status --short` and the CR count and line count of `claude-agent.ts`; confirm `specs/docs-5-selector-criteria/tasks.md` is the only modified file and note its hash
- [x] T-02: `npx tsc --noEmit`; the characterization file three times; the five exit/cooldown test files (`cooldown-gate-fase-1b`, `cooldown-stop-loss-ghost-close`, `mr-profit-floor-exit-rules`, `trend-3day-sma5-gate-exit-rules`, `orphaned-position-reconciliation`); record the results (expected 23/23 x3 and 75/75)
- [x] T-03: Re-read `claude-agent.ts:91-153` and save the exact text of the three definitions for the later byte comparison

### Phase 2 — Observe current behaviour
- [x] T-04: Run the three functions as they are today (throwaway script or test, outside the committed files) for every case of T-05; record the observed values, including the invalid timestamp and exactly 28 calendar days
- [x] T-05: Delete the throwaway script and confirm `git status` shows no stray file

### Phase 3 — Tests first (RED)
- [x] T-06: Create `src/lib/__tests__/exit-cooldown.test.ts` (LF): `getTradingDaysOpen` cases with fake timers, expected values from T-04
- [x] T-07: Add the `computeCooldownUntil` cases: all branches, `default` via cast, three distinct `Date` objects, `toBe`
- [x] T-08: Add the `toExitReason` cases: eight mappings, normalization, empty/null/undefined/whitespace with exact `[EXIT_REASON_EMPTY]` text, unmatched with exact `[EXIT_REASON_UNMATCHED]` text
- [x] T-09: Run the new test file; confirm it fails because `../exit-cooldown` does not exist

### Phase 4 — Move (GREEN)
- [x] T-10: Create `src/lib/exit-cooldown.ts` (LF) with the type import, the three functions (export added, indent removed for `toExitReason`) and the EDT/EST comment
- [x] T-11: Run the new test file: all pass
- [x] T-12: Edit `claude-agent.ts` with an EOL-aware script: delete the three definitions and add the one import line after the `./sma5-exit` import; no other line changes
- [x] T-13: Confirm `claude-agent.ts` CR count equals its line count

### Phase 5 — Verification
- [x] T-14: `npx tsc --noEmit`
- [x] T-15: Characterization file three times, identical results; if any golden changes, STOP and report the diff
- [x] T-16: `npx vitest run` (full); report the count against the baseline plus the new tests
- [x] T-17: `npx eslint src/lib/exit-cooldown.ts src/lib/claude-agent.ts src/lib/__tests__/exit-cooldown.test.ts`
- [x] T-18: `git status --short -- src/lib/__tests__/__golden__` is empty
- [x] T-19: `git diff --name-only` shows only `claude-agent.ts` (plus the already-modified `specs/docs-5-selector-criteria/tasks.md`, unchanged) and the untracked new files
- [x] T-20: Diff review: `claude-agent.ts` diff has only the three deletions and the one import; `git diff --stat`
- [x] T-21: Compare the deleted text with the text in `exit-cooldown.ts` under the Q-1 rule; report the result
- [x] T-22: Byte check of `specs/docs-5-selector-criteria/tasks.md` against T-01
- [x] T-23: CR counts per touched file (`claude-agent.ts` CRLF; `exit-cooldown.ts` and the test LF)

### Phase 6 — Report
- [x] T-24: Write `specs/extract-exit-cooldown-helpers/review.md` in the format of `specs/extract-prompt-builder/review.md`
- [x] T-25: List, without fixing, the docs that cite moved `claude-agent.ts` line numbers (`gate-importance.ts`, `CLAUDE.md`, `.claude/agents/*`, others found by grep)
- [x] T-26: Final report: files changed, test counts, golden status, line endings, anything not verified; do not commit or push

## Post-Implementation

- [x] Run /review extract-exit-cooldown-helpers to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (or changes approved)

## Estimated Complexity

Low-Medium — the code move is 60 lines, but it edits a Protected Zone CRLF file and must keep every golden identical, so the checks (CR counts, byte comparison, three characterization runs) are most of the work.
