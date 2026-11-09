# Review Report — CHANGE split-2: extract the exit/cooldown helpers from claude-agent.ts (pure move)

**Date**: 2026-11-09
**Reviewer**: Claude (automated)
**Status**: APPROVED

Re-verified at review time: `git status`, the `claude-agent.ts` diff (1 added line, 54 removed), a byte comparison of the deleted text against `exit-cooldown.ts`, CR counts, `tsc`, the characterization file three times, the full suite, ESLint, and `git status` on the goldens.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Create `src/lib/exit-cooldown.ts` | ✅ | 55 lines |
| FR-02 | Move `getTradingDaysOpen` | ✅ | Was `:91-97` |
| FR-03 | Move `computeCooldownUntil` | ✅ | Was `:103-125` |
| FR-04 | Move its EDT/EST comment | ✅ | Was `:99-102`, sits above the function |
| FR-05 | Move `toExitReason` to top level | ✅ | Was `:137-153` |
| FR-06 | Export the three names | ✅ | |
| FR-07 | Keep `COOLDOWN_UNKNOWN_EXIT_REASON` | ✅ | Still in `claude-agent.ts` |
| FR-08 | Copy text without change | ✅ | Byte comparison: module equals the old text with the FR-09 differences only |
| FR-09 | Only `export` and the 2-space dedent differ | ✅ | Same comparison |
| FR-10 | `toExitReason` signature kept | ✅ | `(reason?: string \| null): ExitReason` |
| FR-11 | Other signatures kept | ✅ | |
| FR-12 | No new parameter or injection | ✅ | |
| FR-13 | No rename | ✅ | |
| FR-14 | Only import is the `ExitReason` type | ✅ | `exit-cooldown.ts:1` |
| FR-15 | No import from `claude-agent.ts` | ✅ | |
| FR-16 | New module in LF | ✅ | 0 CR |
| FR-17 | Delete `getTradingDaysOpen` | ✅ | |
| FR-18 | Delete `computeCooldownUntil` with comment | ✅ | |
| FR-19 | Delete nested `toExitReason` | ✅ | |
| FR-20 | Exactly one import line | ✅ | `claude-agent.ts:51`, after `./sma5-exit` |
| FR-21 | No call site changed | ✅ | Five call sites unchanged, only shifted by 53 lines (now `:194`, `:402`, `:1265`, `:1334`; flag use unchanged) |
| FR-22 | Nothing else changed | ✅ | Rebuilt HEAD minus the three ranges plus the import equals the current file |
| FR-23 | Touched lines in CRLF | ✅ | |
| FR-24 | CR count equals line count | ✅ | 2511 / 2511 (was 2564 / 2564) |
| FR-25 | Baseline recorded first | ✅ | tsc clean, characterization 23/23 x3, five files 75/75, full 1053 |
| FR-26 | No golden changed | ✅ | `git status` on `__golden__` is empty |
| FR-27 | Stop if a golden changes | ✅ | N/A, none changed |
| FR-28 | No golden regenerated | ✅ | |
| FR-29 | Observe behaviour first | ✅ | Throwaway test file, run with the old text; deleted afterwards |
| FR-30 | Expected values are the observed ones | ✅ | Invalid and empty timestamp give `NaN`; 28 days gives exactly 20 (`28 * (5/7)` is `20`), 27 days gives 19 |
| FR-31 | Delete the throwaway script | ✅ | Not in `git status` |
| FR-32 | RED fails on the missing import | ✅ | `Cannot find module '../exit-cooldown'` |
| FR-33 | `getTradingDaysOpen` cases | ✅ | 0, 1.4, 28 (and 27), invalid, empty |
| FR-34 | Branches returning `endOfTradingDay` | ✅ | |
| FR-35 | Branches returning `nextTradingDay1` | ✅ | |
| FR-36 | `STOP_LOSS` returns `nextTradingDay3` | ✅ | |
| FR-37 | `TIME_STOP`, `UNKNOWN` return `null` | ✅ | |
| FR-38 | `default` branch via cast | ✅ | `'BOGUS' as ExitReason` |
| FR-39 | Three distinct `Date`s, `toBe` | ✅ | |
| FR-40 | Eight mappings | ✅ | |
| FR-41 | Normalization | ✅ | Case, spaces, hyphens, padding |
| FR-42 | Empty branch with exact text | ✅ | `""`, `"   "`, `"null"`, `"undefined"` |
| FR-43 | Unmatched branch with exact text | ✅ | `[EXIT_REASON_UNMATCHED] raw="something else"` |
| FR-44 | No network, no key | ✅ | |
| FR-45 | `tsc --noEmit` passes | ✅ | |
| FR-46 | Characterization x3 identical | ✅ | 23/23 each run |
| FR-47 | Full suite and count | ✅ | 1080 passed in 74 files (baseline 1053 in 73, plus 27 new tests) |
| FR-48 | ESLint | ✅ | 0 errors; the same 3 pre-existing warnings in `claude-agent.ts` (`checkOvertradingLimit`, `wouldPassWithoutZ`, `wouldExecute`) |
| FR-49 | Goldens clean | ✅ | |
| FR-50 | Only allowed files in the diff | ✅ | `claude-agent.ts` modified; new: module, test, spec folder; plus the pre-existing `docs-5` tasks.md |
| FR-51 | Diff is three deletions and one import | ✅ | `1 insertion(+), 54 deletions(-)` |
| FR-52 | Deleted text equals module text | ✅ | See FR-08 |
| FR-53 | CR counts reported | ✅ | `claude-agent.ts` 2511/2511; `exit-cooldown.ts` 0/55; test 0/147 |
| FR-54 | This review | ✅ | |
| FR-55 | List docs citing moved line numbers | ✅ | See findings L-1 |
| FR-56 | No commit or push | ✅ | |
| NFR-01 | No behaviour change | ✅ | Goldens identical, 23/23 x3 |
| NFR-02 | No cycle, only the type import | ✅ | |
| NFR-03 | No live call | ✅ | |
| NFR-04 | No secret printed | ✅ | |
| NFR-05 | Module coverage at least 80% | ✅ | Every branch of the three functions is asserted (coverage tool not run) |
| NFR-06 | Repo test patterns | ✅ | AAA, no network |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | |
| src/lib/claude-agent.ts | MODIFIED (authorized) | Listed in design.md; only the three deletions and one import |
| src/lib/risk-manager.ts | UNTOUCHED | |
| src/lib/indicators.ts | UNTOUCHED | |
| src/lib/news-intelligence.ts | UNTOUCHED | |
| src/lib/watchlist-monitor.ts | UNTOUCHED | |
| src/lib/learning.ts | UNTOUCHED | |
| src/lib/prompt-builder.ts | UNTOUCHED | |

`.github/workflows/*`, `vitest.config.ts`, `CLAUDE.md` and every golden are untouched. `specs/docs-5-selector-criteria/tasks.md` is byte-identical to the baseline (same SHA-256 as before the work).

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | No change to the Claude call, prompt, or the forced `HOLD` |
| Supabase patterns | ✅ | Not applicable |
| TypeScript quality | ✅ | No `any`; functions under 50 lines; the single cast is the `default` test |
| Security | ✅ | No secrets |

## Task Checklist

- Completed: 32/32 boxes in `tasks.md` (4 pre-implementation, 26 implementation tasks, 2 post-implementation). Incomplete: 0. All checks above were re-run independently at review time and gave the same results.

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- **L-1** Documents that cite `claude-agent.ts` line numbers (listed, not fixed). The move shifts everything after line 90 by -53 lines:
  - `SDD.md:284` (`claude-agent.ts:945`, `:2227`) and `SDD.md:290` (`claude-agent.ts:1612-1624`).
  - `src/lib/gate-importance.ts:10` (`claude-agent.ts:1711-1728`).
  - `src/lib/__tests__/self-flagged-disqualifying-risk.test.ts:72` (`claude-agent.ts:1652`).
  - About 150 spec files under `specs/` hold historical citations; `CLAUDE.md` and `.claude/agents/*` hold none in this form. The citations in SDD and `gate-importance.ts` were already offset before this move.
- **L-2** `exit-cooldown.ts` is not in `coverage.include` (`vitest.config.ts`) or in the Protected Zone audit of `pr-review.yml`, as `prompt-builder.ts` was after move 1. Out of scope by instruction (Q-4); decision for the owner.
- **L-3** Observed quirks pinned, not fixed: an invalid timestamp makes `getTradingDaysOpen` return `NaN`, which makes `daysOpen >= 20` false (no time stop); `computeCooldownUntil` has a redundant `default` branch.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
