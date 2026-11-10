# Tasks — CHANGE split-3: extract the execution-gate helpers (pure move, no behaviour change)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts`: three deletions and import changes; owner authorization given in the request)
- [x] Database migrations drafted (N/A: none)
- [x] Q-1 to Q-4 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: `git status --short`; record CR count and line count of `claude-agent.ts`, `macro-bars-staleness.ts`, `CLAUDE.md`, `vitest.config.ts`, `pr-review.yml`; SHA-256 of `specs/docs-5-selector-criteria/tasks.md`
- [x] T-02: `npx tsc --noEmit`; the characterization file three times; full `npx vitest run` (expected 1083 in 75 files); `npx eslint src/lib/claude-agent.ts` (record the three known warnings); record the Node version
- [x] T-03: Re-read `claude-agent.ts:739-766`, `:1021-1029`, the call sites `:1066-1070`, `:2110`, `:2127`, and the import blocks (`:28`, `:37`, `:71`); save the exact text of the three functions for the later byte comparison; grep that `isMacroBarsStale` and `AlpacaBar` have no other use in the file

### Phase 2 — Observe current behaviour
- [x] T-04: Throwaway script on the current text: `checkLiquidity` at 999_999, 1_000_000, 0; `checkTradingHours` at 9:44, 9:45, 15:30, 15:31 ET in EST and EDT, around 2026-03-08 and 2026-11-01, and at midnight ET (UTC instants computed with `Intl`); `guardMacroBars` with empty, fresh and stale bars (reference identity, warning text, `ageDays`)
- [x] T-05: Delete the throwaway script; confirm `git status` shows no stray file

### Phase 3 — Tests first (RED)
- [x] T-06: Create `src/lib/__tests__/execution-gates.test.ts` (LF) with the `checkLiquidity` and `checkTradingHours` cases; expected values from T-04
- [x] T-07: Create `src/lib/__tests__/guard-macro-bars.test.ts` (LF) with the three `guardMacroBars` cases and the exact warning text
- [x] T-08: Run both; confirm they fail because the exports do not exist

### Phase 4 — Move (GREEN)
- [x] T-09: Create `src/lib/execution-gates.ts` (LF, no imports) with the two functions and `export`
- [x] T-10: Edit `macro-bars-staleness.ts` (LF): add the type import and `guardMacroBars` with `export`; confirm `types.ts` does not import it
- [x] T-11: Run the two new test files: all pass
- [x] T-12: Edit `claude-agent.ts` with an EOL-aware script: delete the three definitions, add the `./execution-gates` import, replace `isMacroBarsStale` by `guardMacroBars` in the `./macro-bars-staleness` import, remove `AlpacaBar` from the type imports (per Q-1)
- [x] T-13: Confirm `claude-agent.ts` CR count equals its line count and `checkOvertradingLimit` is byte-identical

### Phase 5 — Registration
- [x] T-14: `pr-review.yml`: add `"src/lib/execution-gates.ts"` after `"src/lib/exit-cooldown.ts"`
- [x] T-15: `vitest.config.ts`: add `'src/lib/execution-gates.ts'` to `coverage.include`
- [x] T-16: `CLAUDE.md`: add the File Structure row and the "Confirm with Amaury" row (CRLF kept)
- [x] T-17: CR counts before and after for the three files

### Phase 6 — Verification
- [x] T-18: `npx tsc --noEmit`
- [x] T-19: Characterization file three times, identical results; if any golden changes, STOP and report the diff
- [x] T-20: Full `npx vitest run`; report the count against 1083 plus the new tests
- [x] T-21: `npx eslint` on `execution-gates.ts`, `macro-bars-staleness.ts`, `claude-agent.ts` and the two new tests; nothing new against the baseline
- [x] T-22: `git status --short -- src/lib/__tests__/__golden__` is empty
- [x] T-23: `git diff --name-only` shows only allowed files; `docs-5` `tasks.md` SHA unchanged
- [x] T-24: Diff review: `claude-agent.ts` diff is only the three deletions and the import changes; byte-compare the moved text with the deleted text (ignoring `export` and EOL); `git diff --stat`
- [x] T-25: CR counts per touched file

### Phase 7 — Report
- [x] T-26: Write `specs/extract-execution-gates/review.md` in the usual format
- [x] T-27: Final report: moved symbols with old and new `file:line`, test counts, golden status, line endings, ICU/timezone note, anything not verified, and the list of docs that cite moved line numbers (do not fix); do not commit or push

## Post-Implementation

- [x] Run /review extract-execution-gates to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged (or changes approved)

## Estimated Complexity

Low-Medium — about 40 lines move, but `claude-agent.ts` is a Protected Zone CRLF file, the trading-hours tests depend on correct UTC instants and ICU data, and every golden must stay identical.
