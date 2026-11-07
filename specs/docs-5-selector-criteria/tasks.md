# Tasks — docs-5: Close the docs thread + align the selector's setup criteria with the code

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec (answers to Q-1 to Q-6)
- [x] Protected Zone changes confirmed (not applicable — read only)
- [x] Database migrations drafted (not applicable)

## Implementation Checklist

### Phase 1 — Sources and baseline
- [x] T-01: Re-read `claude-agent.ts` `:247-300`, `:1640-1830`, `protective-stop.ts` and `indicators.ts:192-196`; record `file:line` per fact
- [x] T-02: Read every file in `.github/workflows/` (name, trigger, cron, `run:` steps)
- [x] T-03: Record the line ending of `test-agent.md`, `typescript-patterns.md`, `SDD.md`, `setups.ts`, `stock-selector.test.ts`
- [x] T-04: Baseline: run `tsc --noEmit`, full Vitest and the characterization suite; record results
- [x] T-05: Grep `__golden__`, fixtures and `mocks.ts` for the selection prompt text ("active trading setups", "RSI < 45") to know before editing whether any golden records it

### Phase 2 — Tests first (RED)
- [x] T-06: Add to `stock-selector.test.ts` the describe that captures `mockMessagesCreate.mock.calls[0][0].system` and asserts every expected `* NAME: criteria` line (expected strings as literals)
- [x] T-07: Add the two absence assertions (`RSI < 45`, `%B < 0.2`)
- [x] T-08: Add the `ACTIVE_SETUPS` pin test (5 entries, order, exact criteria, `active: true`)
- [x] T-09: Run the new tests against the old `setups.ts`; confirm they fail for MR, PULLBACK and 3DAY and for both absence checks, and pass for ZLE05 and RECLAIM

### Phase 3 — Part B: criteria text (GREEN)
- [x] T-10: Re-verify each of the 5 proposed strings against the code lines in design.md
- [x] T-11: Edit `setups.ts` `criteria` values for the setups that differ (expected: MR, PULLBACK, 3DAY); no other change in the file
- [x] T-12: Run the new tests: all pass
- [x] T-13: `git diff src/lib/setups.ts` shows only `criteria` value lines

### Phase 4 — Part A: documentation
- [x] T-14: `test-agent.md` `:290-298`: replace the universal block with the per-setup exit block (FR-01 to FR-09), citing the code in the report
- [x] T-15: `test-agent.md` `:267`: ZLE05 comment (FR-10)
- [x] T-16: `typescript-patterns.md` `:102`: add `TREND_PULLBACK_3DAY` (FR-11)
- [x] T-17: `SDD.md` section 15: 8-row table with real names, files, crons and UTC/EDT/EST (FR-12 to FR-15)
- [x] T-18: Grep `test-agent.md` for "Universal exit" / "0–0.5" and `SDD.md` for `trading-cycle.yml` / `exit-only.yml` to confirm what remains (the SDD §2 diagram remains by design)

### Phase 5 — Verification
- [x] T-19: `tsc --noEmit`
- [x] T-20: Full Vitest
- [x] T-21: ESLint on `setups.ts` and `stock-selector.test.ts` (and `setups.test.ts` if created)
- [x] T-22: Characterization suite 3 times; compare each run with the baseline; confirm zero golden changes (`git status` on `__golden__` clean). If any golden changes: STOP, do not regenerate, report the diff
- [x] T-23: `git diff --name-only` shows only the allowed files; Protected Zone and `stock-selector.ts` absent
- [x] T-24: Byte-level line-ending check on each edited file (CRLF files have no bare LF; LF files have no CR)
- [x] T-25: Do not commit or push

### Phase 6 — Report
- [x] T-26: Write `.tmp/docs-5-report.md`: each change old -> new with source `file:line`; exact old and new criteria of all 5 setups; test and verification results; golden result; unverified list

## Post-Implementation

- [ ] Run /review docs-5-selector-criteria to verify implementation matches spec
- [ ] Confirm Protected Zone files unchanged (or changes approved)

## Estimated Complexity

Low-Medium — the edits are small, but `setups.ts` text feeds a live prompt, so each string needs a line-by-line check against the entry code, and the golden/characterization result must be reported exactly.
